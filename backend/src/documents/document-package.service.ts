import { Injectable, Logger } from "@nestjs/common";
import { DocumentSigningSessionService } from "./document-signing-session.service";

/**
 * DocumentPackageService
 * 
 * Orchestration service for Document Package workflows.
 * 
 * Purpose:
 * - Coordinate completion states across documents in a signing session
 * - Delegate package-level decisions to appropriate document engines
 * - Evaluate package-level lifecycle state
 * 
 * Current State:
 * - Evaluates single-document packages (CONTRACT)
 * - Future: Will support multi-document packages (CONTRACT + MINOR_ANNEX + WAIVER, etc.)
 * 
 * Responsibilities:
 * - Track completion state of individual documents
 * - Determine when entire package is complete
 * - Orchestrate multi-document signing sessions
 */
@Injectable()
export class DocumentPackageService {
  private readonly logger = new Logger(DocumentPackageService.name);

  constructor(
    private readonly documentSigningSessionService: DocumentSigningSessionService,
  ) {}

  /**
   * Check if a single document is completed
   * 
   * Evaluates if the package containing this document is complete.
   * Does NOT trigger post-completion workflow.
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
}
