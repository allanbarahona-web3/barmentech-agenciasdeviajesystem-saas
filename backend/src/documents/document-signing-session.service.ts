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

    // Persist all documents defined in the plan (or retrieve existing)
    const documentSigningIdMap = new Map<string, string>(); // documentKey -> DocumentSigning.id

    for (const planDocument of plan.documents) {
      const existingDocument = await this.prisma.documentSigning.findFirst({
        where: {
          sessionId: session.id,
          documentKey: planDocument.key,
        },
      });

      let document;
      if (existingDocument) {
        document = existingDocument;
        this.logger.log(
          `[signing-session] Reusing existing document id=${document.id} key=${planDocument.key} type=${planDocument.type} sessionId=${session.id}`,
        );
      } else {
        // Create new document
        document = await this.prisma.documentSigning.create({
          data: {
            sessionId: session.id,
            documentKey: planDocument.key,
            documentType: planDocument.type,
            status: "PENDING",
          },
        });
        this.logger.log(
          `[signing-session] Created document id=${document.id} key=${planDocument.key} type=${planDocument.type} sessionId=${session.id}`,
        );
      }

      // Store mapping for token generation
      documentSigningIdMap.set(planDocument.key, document.id);

      // Persist signers for this document (or retrieve existing)
      if (Array.isArray(planDocument.signers)) {
        for (const planSigner of planDocument.signers) {
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
    }

    // Calculate expiration
    const safeTtlMinutes = Math.min(Math.max(Number(context.ttlMinutes) || 1440, 15), 60 * 24 * 7);
    const expiresAt = new Date(Date.now() + safeTtlMinutes * 60 * 1000);

    // Generate signing links for all document-signer pairs
    const signingLinks: SigningLink[] = [];

    for (const document of plan.documents) {
      // Get the persisted DocumentSigning.id for this document
      const documentSigningId = documentSigningIdMap.get(document.key);
      if (!documentSigningId) {
        this.logger.error(
          `[signing-session] No DocumentSigning.id found for document key=${document.key}`,
        );
        continue;
      }

      for (const signer of document.signers) {
        // Generate signing token with both contractId and documentSigningId
        const token = this.documentSigningService.buildSigningToken({
          documentId: plan.processId, // contractId
          documentSigningId, // Specific DocumentSigning record
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

        // Extract minorName from document displayName for MINOR_ANNEX
        let minorName: string | undefined;
        if (link.documentType === 'MINOR_ANNEX') {
          const matchMinorName = link.documentType === 'MINOR_ANNEX' 
            ? plan.documents.find(d => d.id === link.documentId)?.displayName
            : undefined;
          if (matchMinorName) {
            // Extract minor name from "Anexo Menor 1 - Juan Perez" format
            const parts = matchMinorName.split(' - ');
            minorName = parts.length > 1 ? parts[1] : 'Menor';
          }
        }

        try {
          await this.documentEmailsService.sendDocumentSigningEmail(
            context.actor,
            {
              toEmail: link.signerEmail,
              clientName: link.signerName || "Firmante",
              documentNumber: context.documentDisplayName,
              signingUrl: link.signingUrl,
              documentType: link.documentType,
              signerRole: link.signerRole,
              minorName,
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
    const normalizedType = documentType.toUpperCase();

    switch (normalizedType) {
      case "CONTRACT":
        return "/sign-contract";
      case "MINOR_ANNEX":
        return "/sign-contract";
      case "LIABILITY_WAIVER":
        return "/sign-contract";
      case "WAIVER":
        return "/sign-contract";
      case "AUTHORIZATION":
        return "/sign-authorization";
      default:
        return `/sign-${documentType.toLowerCase()}`;
    }
  }

  /**
   * Calculate signing progress for a session
   *
   * Priority order:
   * 1. PRIMARY: Read from persisted DocumentSigner records (if available)
   * 2. FALLBACK: Calculate from in-memory SigningSessionPlan
   *
   * Determines how many signers have completed their signatures
   * and who is still pending.
   *
   * @param plan Signing session plan
   * @param completedSignerKeys List of signer keys who have already signed (used for fallback only)
   * @returns Signing progress information
   */
  async calculateSigningProgress(
    plan: SigningSessionPlan,
    completedSignerKeys: string[],
  ): Promise<SigningProgress> {
    // PRIMARY SOURCE: Try to calculate from persisted DocumentSigner records
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
            // PRIMARY SOURCE: Calculate progress from persisted signers
            const totalSigners = signers.length;
            const signedSigners = signers.filter((s) => s.status === "SIGNED" || s.status === "COMPLETED");
            const signedCount = signedSigners.length;
            const pendingSigners = signers.filter((s) => s.status !== "SIGNED" && s.status !== "COMPLETED");
            const pendingCount = pendingSigners.length;
            const pendingSignerKeys = pendingSigners.map((s) => s.signerKey);
            const completed = pendingCount === 0 && totalSigners > 0;

            this.logger.log(
              `[signing-session] Progress from persistence: ${signedCount}/${totalSigners} signed`,
            );

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

    // FALLBACK: Calculate progress from in-memory plan
    this.logger.log(
      `[signing-session] Using in-memory plan for progress calculation`,
    );

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

  /**
   * Check if signing session is completed
   *
   * Determines completion status by querying the persisted DocumentSigningSession.
   * This is the authoritative source for session completion state.
   *
   * @param contractId Contract identifier
   * @returns True if session is completed, false otherwise
   */
  async isSigningSessionCompleted(contractId: string): Promise<boolean> {
    try {
      const session = await this.prisma.documentSigningSession.findFirst({
        where: {
          contractId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!session) {
        this.logger.warn(
          `[session-completion-check] No session found for contractId=${contractId}`,
        );
        return false;
      }

      const isCompleted = session.status === "SIGNED" || session.status === "COMPLETED";

      this.logger.log(
        `[session-completion-check] Session id=${session.id} status=${session.status} completed=${isCompleted}`,
      );

      return isCompleted;
    } catch (error) {
      this.logger.error(
        `[session-completion-check] Failed to check session completion for contractId=${contractId}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Record signer completion in the persistence layer
   *
   * Updates the DocumentSigner status to SIGNED when a signer completes their signature.
   * This keeps the new signing framework synchronized with the existing workflow.
   *
   * @param contractId Contract identifier
   * @param signerKey Signer key identifier
   * @param signedAt Signature timestamp
   * @param documentSigningId Optional specific document signing ID (for MINOR_ANNEX)
   */
  async recordSignerCompletion(
    contractId: string,
    signerKey: string,
    signedAt: Date,
    documentSigningId?: string,
  ): Promise<void> {
    try {
      let document;

      if (documentSigningId) {
        // Use specific document if provided
        document = await this.prisma.documentSigning.findUnique({
          where: { id: documentSigningId },
        });
      } else {
        // Fallback: Locate active session and CONTRACT document
        const session = await this.prisma.documentSigningSession.findFirst({
          where: {
            contractId,
            status: {
              in: ["PENDING", "IN_PROGRESS"],
            },
          },
        });

        if (!session) {
          this.logger.warn(
            `[signer-completion] No active session found for contractId=${contractId}`,
          );
          return;
        }

        document = await this.prisma.documentSigning.findFirst({
          where: {
            sessionId: session.id,
            documentType: "CONTRACT",
          },
        });
      }

      if (!document) {
        this.logger.warn(
          `[signer-completion] No document found for contractId=${contractId} docId=${documentSigningId}`,
        );
        return;
      }

      // Locate signer
      const signer = await this.prisma.documentSigner.findFirst({
        where: {
          documentSigningId: document.id,
          signerKey,
        },
      });

      if (!signer) {
        this.logger.warn(
          `[signer-completion] No signer found for key=${signerKey} documentId=${document.id}`,
        );
        return;
      }

      // Check if already signed (idempotency)
      if (signer.status === "SIGNED" || signer.status === "COMPLETED") {
        this.logger.log(
          `[signer-completion] Signer already completed id=${signer.id} key=${signerKey}`,
        );
        return;
      }

      // Update signer status
      await this.prisma.documentSigner.update({
        where: { id: signer.id },
        data: {
          status: "SIGNED",
          signedAt,
        },
      });

      this.logger.log(
        `[signer-completion] Updated signer id=${signer.id} key=${signerKey} status=SIGNED docType=${document.documentType}`,
      );
    } catch (error) {
      this.logger.error(
        `[signer-completion] Failed to record completion for key=${signerKey}: ${error}`,
      );
      // Do not throw - this is a synchronization operation that should not break the main workflow
    }
  }

  /**
   * Complete document signing when all signers have signed
   *
   * Updates the DocumentSigning status to SIGNED when all required signers
   * have completed their signatures. Checks all documents in the session.
   *
   * @param contractId Contract identifier
   */
  async completeDocumentSigning(contractId: string): Promise<void> {
    try {
      // Locate active session
      const session = await this.prisma.documentSigningSession.findFirst({
        where: {
          contractId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
        },
      });

      if (!session) {
        this.logger.warn(
          `[document-completion] No active session found for contractId=${contractId}`,
        );
        return;
      }

      // Get all documents in session
      const documents = await this.prisma.documentSigning.findMany({
        where: {
          sessionId: session.id,
        },
      });

      if (documents.length === 0) {
        this.logger.warn(
          `[document-completion] No documents found for sessionId=${session.id}`,
        );
        return;
      }

      // Check each document for completion
      for (const document of documents) {
        // Skip if already completed
        if (document.status === "SIGNED" || document.status === "COMPLETED") {
          this.logger.log(
            `[document-completion] Document already completed id=${document.id} type=${document.documentType}`,
          );
          continue;
        }

        // Get signers for this document
        const signers = await this.prisma.documentSigner.findMany({
          where: {
            documentSigningId: document.id,
          },
        });

        if (signers.length === 0) {
          this.logger.warn(
            `[document-completion] No signers found for documentId=${document.id}`,
          );
          continue;
        }

        // Check if all signers are signed
        const allSigned = signers.every(
          (s) => s.status === "SIGNED" || s.status === "COMPLETED",
        );

        if (!allSigned) {
          this.logger.log(
            `[document-completion] Not all signers completed for documentId=${document.id} type=${document.documentType}`,
          );
          continue;
        }

        // Update document status
        await this.prisma.documentSigning.update({
          where: { id: document.id },
          data: {
            status: "SIGNED",
          },
        });

        this.logger.log(
          `[document-completion] Updated document id=${document.id} type=${document.documentType} status=SIGNED`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[document-completion] Failed to complete document for contractId=${contractId}: ${error}`,
      );
      // Do not throw - this is a synchronization operation that should not break the main workflow
    }
  }

  /**
   * Complete signing session when all documents have been signed
   *
   * Updates the DocumentSigningSession status to SIGNED when all documents
   * in the session have been completed. This keeps the session entity
   * synchronized with the document completion state.
   *
   * @param contractId Contract identifier
   */
  async completeSigningSession(contractId: string): Promise<void> {
    try {
      // Locate active session
      const session = await this.prisma.documentSigningSession.findFirst({
        where: {
          contractId,
          status: {
            in: ["PENDING", "IN_PROGRESS"],
          },
        },
      });

      if (!session) {
        this.logger.warn(
          `[session-completion] No active session found for contractId=${contractId}`,
        );
        return;
      }

      // Check if already completed (idempotency)
      if (session.status === "SIGNED" || session.status === "COMPLETED") {
        this.logger.log(
          `[session-completion] Session already completed id=${session.id}`,
        );
        return;
      }

      // Count documents
      const documents = await this.prisma.documentSigning.findMany({
        where: {
          sessionId: session.id,
        },
      });

      if (documents.length === 0) {
        this.logger.warn(
          `[session-completion] No documents found for sessionId=${session.id}`,
        );
        return;
      }

      // Check if all documents are signed
      const allSigned = documents.every(
        (d) => d.status === "SIGNED" || d.status === "COMPLETED",
      );

      if (!allSigned) {
        this.logger.log(
          `[session-completion] Not all documents completed for sessionId=${session.id}`,
        );
        return;
      }

      // Update session status
      await this.prisma.documentSigningSession.update({
        where: { id: session.id },
        data: {
          status: "SIGNED",
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `[session-completion] Updated session id=${session.id} status=SIGNED`,
      );
    } catch (error) {
      this.logger.error(
        `[session-completion] Failed to complete session for contractId=${contractId}: ${error}`,
      );
      // Do not throw - this is a synchronization operation that should not break the main workflow
    }
  }
}
