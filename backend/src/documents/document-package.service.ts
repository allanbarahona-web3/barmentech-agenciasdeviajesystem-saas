import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { DocumentSigningSessionService } from "./document-signing-session.service";
import { DocumentSigningService } from "./document-signing.service";
import { DocumentDeliveryService } from "./document-delivery.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { BillingService } from "../billing/billing.service";
import { ContractSigningSessionBuilder } from "../contracts/contract-signing-session.builder";
import { SigningParticipant } from "./signing-session/signing-session.types";

/**
 * DocumentPackageService
 * 
 * Orchestration service for Document Package workflows.
 * 
 * Purpose:
 * - Coordinate completion states across documents in a signing session
 * - Delegate package-level decisions to appropriate document engines
 * - Manage package-level lifecycle events
 * 
 * Current State:
 * - Evaluates single-document packages (CONTRACT)
 * - Future: Will support multi-document packages (CONTRACT + MINOR_ANNEX + WAIVER, etc.)
 * 
 * Responsibilities:
 * - Track completion state of individual documents
 * - Determine when entire package is complete
 * - Trigger delivery and finalization workflows
 * - Orchestrate multi-document signing sessions
 */
@Injectable()
export class DocumentPackageService {
  private readonly logger = new Logger(DocumentPackageService.name);

  constructor(
    private readonly documentSigningSessionService: DocumentSigningSessionService,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly documentDeliveryService: DocumentDeliveryService,
    private readonly storageService: StorageService,
    private readonly documentSigningService: DocumentSigningService,
    private readonly contractSigningSessionBuilder: ContractSigningSessionBuilder,
  ) {}

  /**
   * Check if a single document is completed
   * 
   * Evaluates if the package containing this document is complete.
   * Does NOT trigger post-completion workflow.
   * Caller is responsible for calling onPackageCompleted() after status updates.
   * 
   * @param documentId Document identifier (contract ID for current single-document packages)
   * @returns True if document (and its package) is completed
   */
  async documentCompleted(documentId: string): Promise<boolean> {
    return this.isPackageCompleted(documentId);
  }

  /**
   * Check if the entire document package is completed
   * 
   * Current behavior:
   * - Single-document packages: Package is complete when Contract is complete
   * - Evaluates using DocumentSigningSession status
   * 
   * Future behavior:
   * - Multi-document packages: Package is complete when ALL documents are complete
   * - Will query DocumentSigningSession to check all documents (CONTRACT, MINOR_ANNEX, etc.)
   * 
   * @param documentId Document identifier (contract ID for current single-document packages)
   * @returns True if entire package is completed
   */
  async isPackageCompleted(documentId: string): Promise<boolean> {
    this.logger.debug(
      `[package-completion] Evaluating package completion for documentId=${documentId}`,
    );

    // Current: Single-document package (CONTRACT only)
    // Package is complete when the signing session is complete
    const isComplete = await this.documentSigningSessionService.isSigningSessionCompleted(
      documentId,
    );

    this.logger.log(
      `[package-completion] Package completion evaluation documentId=${documentId} result=${isComplete}`,
    );

    return isComplete;
  }

  /**
   * Handle package completion event
   * 
   * Orchestrates post-signing workflow:
   * 1. Billing - Auto-issue and send initial invoice to titular
   * 2. Delivery - Auto-send signed contract to all parties
   * 
   * Current: Single-document packages (CONTRACT)
   * Future: Multi-document packages (CONTRACT + MINOR_ANNEX + WAIVER)
   * 
   * @param documentId Document identifier (contract ID for current single-document packages)
   */
  async onPackageCompleted(documentId: string): Promise<void> {
    this.logger.log(`[package-completed] Starting post-package workflow for documentId=${documentId}`);

    const CONTRACT_STATUS_SIGNED = "SIGNED";

    // 1. Trigger Billing
    try {
      const contract = await (this.prisma as any).contract.findUnique({
        where: { id: documentId },
      });

      if (!contract) {
        throw new NotFoundException("Contrato no encontrado.");
      }

      await this.billingService.autoIssueAndSendInvoiceToTitular({
        contractId: documentId,
        actorUserId: String(contract.generatedByUserId || "system"),
        actorEmail: String(contract.generatedByEmail || "system@local"),
        actorName: String(contract.generatedByName || "Sistema"),
      });

      this.logger.log(`[package-completed] Billing completed for documentId=${documentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fallo el auto-envio de factura al titular.";
      this.logger.error(`[package-completed] Billing failed for documentId=${documentId}: ${message}`);
      // Continue with delivery even if billing fails
    }

    // 2. Trigger Delivery
    try {
      const contract = await (this.prisma as any).contract.findUnique({
        where: { id: documentId },
        include: {
          client: true,
          tenant: true,
        },
      });

      if (!contract) {
        throw new NotFoundException("Contrato no encontrado.");
      }

      if (String(contract.status || "").toUpperCase() !== CONTRACT_STATUS_SIGNED || !contract.signedPdfObjectKey) {
        throw new BadRequestException("El contrato aun no esta firmado por todas las partes.");
      }

      const tenant = contract.tenant || null;
      if (!tenant) {
        throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
      }

      const payload = this.documentSigningService.getPayloadRecord(contract.payload);
      const participants = this.getSigningParticipantsFromPlan(contract);

      // Download signed PDF buffer
      const signedPdfBuffer = await this.storageService.downloadObject(contract.signedPdfObjectKey);
      if (!signedPdfBuffer.length) {
        throw new InternalServerErrorException("No se pudo leer el contrato firmado.");
      }

      // Deliver signed document
      const deliveryResult = await this.documentDeliveryService.deliverSignedDocument({
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        signedPdfBuffer,
        signedPdfFileName: contract.signedPdfFileName,
        signingParticipants: participants,
        actorContext: {
          userId: String(contract.generatedByUserId || "system"),
          email: String(contract.generatedByEmail || "system@local"),
          fullName: String(contract.generatedByName || "Sistema"),
        },
        tenant,
      });

      // Build dispatch log entry
      const dispatchLogEntry = this.documentDeliveryService.buildDispatchLogEntry({
        type: "SIGNED_AUTO_SEND",
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        actorContext: {
          userId: String(contract.generatedByUserId || "system"),
          email: String(contract.generatedByEmail || "system@local"),
          fullName: String(contract.generatedByName || "Sistema"),
        },
        sentTo: deliveryResult.sentTo,
        failedTo: deliveryResult.failedTo,
      });

      // Persist dispatch log
      const existingDispatchLog = Array.isArray(payload?.emailDispatchLog)
        ? payload.emailDispatchLog.filter((item: any) => item && typeof item === "object")
        : [];

      await (this.prisma as any).contract.update({
        where: { id: contract.id },
        data: {
          payload: {
            ...payload,
            emailDispatchLog: [...existingDispatchLog, dispatchLogEntry],
          },
        },
      });

      this.logger.log(
        `[package-completed] Delivery completed for documentId=${documentId} ` +
        `(${deliveryResult.sentTo.length} sent, ${deliveryResult.failedTo.length} failed)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fallo el envio automatico del contrato firmado.";
      this.logger.error(`[package-completed] Delivery failed for documentId=${documentId}: ${message}`);
      // Do not fail the signing process
    }

    this.logger.log(`[package-completed] Post-package workflow completed for documentId=${documentId}`);
  }

  /**
   * Extract signing participants from a contract using SigningSessionPlan
   */
  private getSigningParticipantsFromPlan(contract: any): SigningParticipant[] {
    const plan = this.contractSigningSessionBuilder.buildFromContract(contract);
    return plan.documents[0]?.signers || [];
  }
}
