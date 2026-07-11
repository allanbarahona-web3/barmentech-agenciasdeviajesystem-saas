import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
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
  SigningProgress,
  SigningSessionFinalization,
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
    private readonly prisma: PrismaService,
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

    // Persist signing session (or retrieve existing active session)
    const tenantId = context.tenant?.id;
    if (!tenantId) {
      throw new Error("Tenant context is required to start a signing session.");
    }

    // Check for existing active session
    const existingSession = await this.prisma.documentSigningSession.findFirst({
      where: {
        contractId: plan.processId,
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    });

    let session;
    if (existingSession) {
      session = existingSession;
      this.logger.log(
        `[signing-session] Reusing existing active session id=${session.id} contractId=${plan.processId}`,
      );
    } else {
      // Create new session
      session = await this.prisma.documentSigningSession.create({
        data: {
          contractId: plan.processId,
          tenantId,
          processType: plan.processType || "CONTRACT",
          status: "PENDING",
          startedAt: new Date(),
        },
      });
      this.logger.log(
        `[signing-session] Created new session id=${session.id} contractId=${plan.processId}`,
      );
    }

    // Persist primary document (or retrieve existing)
    const existingDocument = await this.prisma.documentSigning.findFirst({
      where: {
        sessionId: session.id,
        documentType: "CONTRACT",
      },
    });

    let document;
    if (existingDocument) {
      document = existingDocument;
      this.logger.log(
        `[signing-session] Reusing existing document id=${document.id} sessionId=${session.id}`,
      );
    } else {
      // Create new document
      document = await this.prisma.documentSigning.create({
        data: {
          sessionId: session.id,
          documentType: "CONTRACT",
          status: "PENDING",
        },
      });
      this.logger.log(
        `[signing-session] Created document id=${document.id} sessionId=${session.id}`,
      );
    }

    // Persist signers (or retrieve existing)
    const primaryDocument = plan.documents[0];
    if (primaryDocument && Array.isArray(primaryDocument.signers)) {
      for (const planSigner of primaryDocument.signers) {
        const existingSigner = await this.prisma.documentSigner.findFirst({
          where: {
            documentSigningId: document.id,
            signerKey: planSigner.signerKey,
          },
        });

        if (existingSigner) {
          this.logger.log(
            `[signing-session] Reusing existing signer id=${existingSigner.id} key=${planSigner.signerKey}`,
          );
        } else {
          const newSigner = await this.prisma.documentSigner.create({
            data: {
              documentSigningId: document.id,
              signerKey: planSigner.signerKey,
              signerRole: planSigner.role,
              signerName: planSigner.name,
              signerEmail: planSigner.email,
              status: "PENDING",
            },
          });
          this.logger.log(
            `[signing-session] Created signer id=${newSigner.id} key=${planSigner.signerKey}`,
          );
        }
      }
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

  /**
   * Calculate signing progress for a session
   *
   * Determines how many signers have completed their signatures
   * and who is still pending.
   *
   * @param plan Signing session plan
   * @param completedSignerKeys List of signer keys who have already signed
   * @returns Signing progress information
   */
  async calculateSigningProgress(
    plan: SigningSessionPlan,
    completedSignerKeys: string[],
  ): Promise<SigningProgress> {
    // Try to calculate from persisted DocumentSigner records
    try {
      const session = await this.prisma.documentSigningSession.findFirst({
        where: {
          contractId: plan.processId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
        },
      });

      if (session) {
        const document = await this.prisma.documentSigning.findFirst({
          where: {
            sessionId: session.id,
            documentType: "CONTRACT",
          },
        });

        if (document) {
          const signers = await this.prisma.documentSigner.findMany({
            where: {
              documentSigningId: document.id,
            },
          });

          if (signers.length > 0) {
            // Calculate progress from persisted signers
            const totalSigners = signers.length;
            const signedSigners = signers.filter((s) => s.status === "COMPLETED");
            const signedCount = signedSigners.length;
            const pendingSigners = signers.filter((s) => s.status !== "COMPLETED");
            const pendingCount = pendingSigners.length;
            const pendingSignerKeys = pendingSigners.map((s) => s.signerKey);
            const completed = pendingCount === 0 && totalSigners > 0;

            return {
              totalSigners,
              signedCount,
              pendingCount,
              completed,
              pendingSignerKeys,
            };
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `[signing-session] Failed to calculate progress from persistence, falling back to in-memory: ${error}`,
      );
    }

    // Fallback: calculate from in-memory plan
    // Collect all required signer keys from all documents
    const requiredSignerKeys: string[] = [];
    for (const document of plan.documents) {
      for (const signer of document.signers) {
        requiredSignerKeys.push(signer.signerKey);
      }
    }

    // Build set of completed keys for fast lookup
    const completedSet = new Set(completedSignerKeys.filter(Boolean));

    // Calculate pending signers
    const pendingSignerKeys = requiredSignerKeys.filter(
      (key) => !completedSet.has(key),
    );

    // Calculate counts
    const totalSigners = requiredSignerKeys.length;
    const signedCount = totalSigners - pendingSignerKeys.length;
    const pendingCount = pendingSignerKeys.length;
    const completed = pendingCount === 0 && totalSigners > 0;

    return {
      totalSigners,
      signedCount,
      pendingCount,
      completed,
      pendingSignerKeys,
    };
  }

  /**
   * Check if a signing session is completed
   *
   * Determines whether all required signatures have been collected.
   *
   * @param progress Signing progress information
   * @returns True if session is complete, false otherwise
   */
  isSessionCompleted(progress: SigningProgress): boolean {
    return progress.completed;
  }

  /**
   * Finalize a signing session
   *
   * Determines whether a session should be finalized based on
   * the current progress. Does not perform any I/O operations.
   *
   * @param plan Signing session plan
   * @param progress Signing progress information
   * @returns Finalization state
   */
  finalizeSigningSession(
    plan: SigningSessionPlan,
    progress: SigningProgress,
  ): SigningSessionFinalization {
    const shouldFinalize = this.isSessionCompleted(progress);
    const hasPendingSignatures = progress.pendingCount > 0;

    return {
      shouldFinalize,
      hasPendingSignatures,
      pendingSignerKeys: progress.pendingSignerKeys,
    };
  }
}
