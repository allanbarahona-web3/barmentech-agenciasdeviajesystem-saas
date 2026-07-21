import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { SIGNED_DOCUMENT_EMAIL_JOB_NAMES } from "../email/jobs";
import { DocumentEmailsService } from "./document-emails.service";
import { SigningParticipant } from "./signing-session/signing-session.types";

type SigningRole = "CLIENTE" | "ACOMPANANTE";

type DeliveryRecipient = {
  email: string;
  name: string;
  role: SigningRole;
  jobId?: string;
};

type DeliveryResult = {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  sentTo: string[];
  failedTo: string[];
};

type DispatchLogEntry = {
  type: string;
  createdAt: string;
  contractId: string;
  contractNumber: string;
  requestedBy: {
    userId: string;
    email: string;
    fullName: string;
  };
  sentCount: number;
  failedCount: number;
  sentTo: string[];
  failedTo: string[];
};

/**
 * DocumentDeliveryService
 *
 * Responsibilities:
 * - Resolve delivery recipients from signing participants
 * - Prepare signed document attachment data
 * - Send signed document emails to all recipients
 * - Build dispatch log entries
 *
 * NOT Responsible For:
 * - Database persistence (caller's responsibility)
 * - Storage infrastructure (caller provides buffers)
 * - Business validation (caller validates before calling)
 */
@Injectable()
export class DocumentDeliveryService {
  private readonly logger = new Logger(DocumentDeliveryService.name);

  constructor(private readonly documentEmailsService: DocumentEmailsService) {}

  /**
   * Resolve delivery recipients from signing participants
   * De-duplicates by email address (case-insensitive)
   */
  resolveRecipientsFromParticipants(participants: SigningParticipant[]): DeliveryRecipient[] {
    const seenEmails = new Set<string>();
    const recipients: DeliveryRecipient[] = [];

    participants.forEach((participant) => {
      const normalizedEmail = String(participant.email || "").trim().toLowerCase();
      if (!normalizedEmail || seenEmails.has(normalizedEmail)) {
        return;
      }

      seenEmails.add(normalizedEmail);
      recipients.push({
        email: normalizedEmail,
        name: participant.name,
        role: participant.role as SigningRole,
      });
    });

    return recipients;
  }

  /**
   * Send signed document to all recipients
   * Returns lists of successfully sent and failed email addresses
   */
  async sendSignedDocument(params: {
    contractNumber: string;
    fileName: string;
    pdfBase64: string;
    recipients: DeliveryRecipient[];
    actorContext: {
      userId: string;
      email: string;
      fullName: string;
    };
    tenant?: {
      id: string;
      name: string;
      subdomain: string;
      emailLogoUrl: string | null;
      logoUrl: string | null;
    } | null;
  }): Promise<{ sentTo: string[]; failedTo: string[] }> {
    const { contractNumber, fileName, pdfBase64, recipients, actorContext, tenant } = params;

    if (!recipients.length) {
      this.logger.warn(`[delivery] No recipients for contract ${contractNumber}`);
      return { sentTo: [], failedTo: [] };
    }

    // Delegate to existing email service
    const { sentTo, failedTo } = await this.documentEmailsService.sendSignedDocumentToRecipients(
      { id: actorContext.userId, email: actorContext.email, fullName: actorContext.fullName },
      contractNumber,
      fileName,
      pdfBase64,
      recipients,
      tenant,
      {
        jobName: SIGNED_DOCUMENT_EMAIL_JOB_NAMES.AUTOMATIC_DELIVERY,
      },
    );

    this.logger.log(
      `[delivery] Signed document sent: ${contractNumber} (${sentTo.length} sent, ${failedTo.length} failed)`,
    );

    return { sentTo, failedTo };
  }

  /**
   * Build dispatch log entry for automatic signed document delivery
   */
  buildDispatchLogEntry(params: {
    type: string;
    contractId: string;
    contractNumber: string;
    actorContext: {
      userId: string;
      email: string;
      fullName: string;
    };
    sentTo: string[];
    failedTo: string[];
  }): DispatchLogEntry {
    return {
      type: params.type,
      createdAt: new Date().toISOString(),
      contractId: params.contractId,
      contractNumber: params.contractNumber,
      requestedBy: {
        userId: params.actorContext.userId,
        email: params.actorContext.email,
        fullName: params.actorContext.fullName,
      },
      sentCount: params.sentTo.length,
      failedCount: params.failedTo.length,
      sentTo: params.sentTo,
      failedTo: params.failedTo,
    };
  }

  /**
   * Orchestrate automatic signed document delivery
   * Caller is responsible for:
   * - Fetching and validating contract
   * - Downloading signed PDF buffer
   * - Persisting dispatch log to database
   */
  async deliverSignedDocument(params: {
    contractId: string;
    completedPackageId: string;
    contractNumber: string;
    signedPdfBuffer: Buffer;
    signedPdfFileName: string | null;
    signingParticipants: SigningParticipant[];
    actorContext: {
      userId: string;
      email: string;
      fullName: string;
    };
    tenant?: {
      id: string;
      name: string;
      subdomain: string;
      emailLogoUrl: string | null;
      logoUrl: string | null;
    } | null;
  }): Promise<DeliveryResult> {
    const {
      contractId,
      completedPackageId,
      contractNumber,
      signedPdfBuffer,
      signedPdfFileName,
      signingParticipants,
      actorContext,
      tenant,
    } = params;

    // Resolve recipients
    const recipients = this.resolveRecipientsFromParticipants(signingParticipants)
      .map((recipient) => ({
        ...recipient,
        jobId: this.buildAutomaticDeliveryJobId(
          completedPackageId,
          recipient.email,
        ),
      }));

    if (!recipients.length) {
      this.logger.warn(`[delivery] No recipients for contractId=${contractId}`);
      return { ok: false, sentCount: 0, failedCount: 0, sentTo: [], failedTo: [] };
    }

    // Prepare PDF attachment
    if (!signedPdfBuffer.length) {
      this.logger.error(`[delivery] Empty signed PDF buffer for contractId=${contractId}`);
      return { ok: false, sentCount: 0, failedCount: 0, sentTo: [], failedTo: [] };
    }

    const pdfBase64 = signedPdfBuffer.toString("base64");
    const fileName = signedPdfFileName?.trim() || `${contractNumber.trim()}-signed.pdf`;

    // Send emails
    const { sentTo, failedTo } = await this.sendSignedDocument({
      contractNumber,
      fileName,
      pdfBase64,
      recipients,
      actorContext,
      tenant,
    });

    return {
      ok: true,
      sentCount: sentTo.length,
      failedCount: failedTo.length,
      sentTo,
      failedTo,
    };
  }

  private buildAutomaticDeliveryJobId(
    completedPackageId: string,
    recipientEmail: string,
  ): string {
    const recipientHash = createHash("sha256")
      .update(recipientEmail.trim().toLowerCase())
      .digest("hex")
      .slice(0, 16);

    return `signed-document-auto-${completedPackageId}-${recipientHash}`;
  }
}
