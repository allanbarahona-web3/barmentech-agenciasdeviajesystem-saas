import { Inject, Injectable } from "@nestjs/common";
import {
  BILLING_DOCUMENT_REPOSITORY,
  type BillingDocumentRepository,
} from "./billing-document.repository";
import type {
  BillingDocumentDraftCommand,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";

@Injectable()
export class BillingDocumentService {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY)
    private readonly repository: BillingDocumentRepository,
  ) {}

  findPrimaryDocument(tenantId: string, sourceType: string, sourceId: string) {
    return this.repository.findPrimaryDocument(tenantId, sourceType, sourceId);
  }

  async createOrResumeDraft(command: BillingDocumentDraftCommand) {
    const primarySource =
      command.source?.sourceRole === "PRIMARY" ? command.source : null;
    if (primarySource) {
      const existing = await this.repository.findPrimaryDocument(
        command.tenantId,
        primarySource.sourceType,
        primarySource.sourceId,
      );
      if (existing) return this.resumeOrReject(command.tenantId, existing);
    }

    try {
      const result = await this.repository.createDraft(command);
      return this.resumeOrReject(command.tenantId, result);
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;
      if (!primarySource) throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
      const winner = await this.repository.findPrimaryDocument(
        command.tenantId,
        primarySource.sourceType,
        primarySource.sourceId,
      );
      if (!winner) throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
      return this.resumeOrReject(command.tenantId, winner);
    }
  }

  async resumeOrReject(
    tenantId: string,
    document: PrimaryDocumentSummary,
  ) {
    if (document.lifecycleStatus !== "DRAFT") {
      throw fiscalBillingError("BILLING_DRAFT_ALREADY_ADVANCED", {
        billingDocumentId: document.id,
        lifecycleStatus: document.lifecycleStatus,
      });
    }
    return this.getWorkspace(tenantId, document.id);
  }

  async getWorkspace(tenantId: string, billingDocumentId: string) {
    const workspace = await this.repository.findWorkspace(
      tenantId,
      billingDocumentId,
    );
    if (!workspace) throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
    return workspace;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
