import { Injectable, Logger } from "@nestjs/common";
import { DocumentSigningService } from "./document-signing.service";
import { DocumentSigningAuditService } from "./document-signing-audit.service";
import { DocumentSignatureFinalizationService } from "./document-signature-finalization.service";
import { DocumentDeliveryService } from "./document-delivery.service";
import { DocumentEmailsService } from "./document-emails.service";
import type {
  SigningSessionPlan,
  SigningSessionResult,
  SigningSessionContext,
  SigningLink,
} from "./signing-session/signing-session.types";

/**
 * DocumentSigningSessionService
 *
 * Orchestration service for multi-document signing sessions.
 *
 * Responsibilities (future):
 * - Coordinate signing workflows across multiple documents
 * - Manage signer participation and authentication
 * - Orchestrate document delivery and email notifications
 * - Handle signature finalization and artifact generation
 *
 * Current State:
 * - Foundation layer only
 * - No business logic implemented
 *
 * This service will coordinate the following workflow:
 * 1. Validate signing plan and participants
 * 2. Generate signing tokens for each document-signer pair
 * 3. Send signing invitations to all participants
 * 4. Track signing progress and audit events
 * 5. Finalize signatures when complete
 * 6. Deliver signed documents to recipients
 *
 * Extracted from ContractsService to support multiple document types
 * (contracts, waivers, authorizations, etc.)
 */
@Injectable()
export class DocumentSigningSessionService {
  private readonly logger = new Logger(DocumentSigningSessionService.name);

  constructor(
    private readonly documentSigningService: DocumentSigningService,
    private readonly documentSigningAuditService: DocumentSigningAuditService,
    private readonly documentSignatureFinalizationService: DocumentSignatureFinalizationService,
    private readonly documentDeliveryService: DocumentDeliveryService,
    private readonly documentEmailsService: DocumentEmailsService,
  ) {}

  /**
   * Start a new signing session with the given plan
   *
   * @param plan Signing session plan
   * @param context Signing session context (base URL, TTL)
   * @returns Signing session result with generated links
   */
  async startSigningSession(
    plan: SigningSessionPlan,
    context: SigningSessionContext,
  ): Promise<SigningSessionResult> {
    // Validate plan exists
    if (!plan) {
      throw new Error("Signing plan is required.");
    }

    // Validate at least one document exists
    if (!Array.isArray(plan.documents) || plan.documents.length === 0) {
      throw new Error("Signing plan must contain at least one document.");
    }

    // Validate at least one signer exists across all documents
    const totalSigners = plan.documents.reduce((count, doc) => {
      return count + (Array.isArray(doc.signers) ? doc.signers.length : 0);
    }, 0);

    if (totalSigners === 0) {
      throw new Error("Signing plan must contain at least one signer.");
    }

    // Calculate expiration
    const safeTtlMinutes = Math.min(Math.max(Number(context.ttlMinutes) || 1440, 15), 60 * 24 * 7);
    const expiresAt = new Date(Date.now() + safeTtlMinutes * 60 * 1000);

    // Generate signing links for all document-signer pairs
    const signingLinks: SigningLink[] = [];

    for (const document of plan.documents) {
      for (const signer of document.signers) {
        // Generate signing token
        const token = this.documentSigningService.buildSigningToken({
          documentId: document.id,
          expiresAt,
          signerKey: signer.signerKey,
          signerRole: signer.role,
          signerName: signer.name,
        });

        // Build signing URL based on document type
        const signingPath = this.getSigningPathForDocumentType(document.type);
        const signingUrl = `${context.baseUrl}${signingPath}?token=${encodeURIComponent(token)}`;

        signingLinks.push({
          documentId: document.id,
          documentType: document.type,
          signerKey: signer.signerKey,
          signerRole: signer.role,
          signerName: signer.name,
          signerEmail: signer.email,
          signingUrl,
          expiresAt,
        });
      }
    }
    // Send signing emails if actor and document display name are provided
    let emailsSent = 0;
    const failedEmails: string[] = [];

    if (context.actor && context.documentDisplayName) {
      for (const link of signingLinks) {
        if (!link.signerEmail) continue;

        try {
          await this.documentEmailsService.sendDocumentSigningEmail(
            context.actor,
            {
              toEmail: link.signerEmail,
              clientName: link.signerName || "Firmante",
              documentNumber: context.documentDisplayName,
              signingUrl: link.signingUrl,
            },
            context.tenant,
          );
          emailsSent += 1;
        } catch (error) {
          this.logger.warn(
            `[signing-session] Failed to send signing email to ${link.signerEmail}: ${error}`,
          );
          failedEmails.push(link.signerEmail);
        }
      }
    }

    return {
      generatedDocuments: plan.documents.length,
      generatedLinks: signingLinks.length,
      emailsSent,
      emailsFailed: failedEmails.length,
      failedEmails,
      signingLinks,
    };
  }

  /**
   * Get the signing path for a document type
   * @param documentType Type of document
   * @returns Signing path (e.g., "/sign-contract")
   */
  private getSigningPathForDocumentType(documentType: string): string {
    switch (documentType) {
      case "contract":
        return "/sign-contract";
      case "waiver":
        return "/sign-waiver";
      case "authorization":
        return "/sign-authorization";
      default:
        return `/sign-${documentType}`;
    }
  }
}
