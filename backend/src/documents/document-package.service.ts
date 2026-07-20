import { Inject, Injectable, Logger } from "@nestjs/common";
import { DocumentSigningSessionService } from "./document-signing-session.service";
import {
  EVENT_PUBLISHER,
  EventPublisher,
  PackageCompletedEvent,
} from "../common/events";

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
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: EventPublisher,
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

    await this.documentSigningSessionService.assertArtifactsReady(documentId);
    await this.eventPublisher.publish(new PackageCompletedEvent(documentId));

    this.logger.log(`[package-completed] Post-package workflow completed for documentId=${documentId}`);
  }
}
