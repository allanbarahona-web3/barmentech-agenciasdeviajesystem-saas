import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  GENERATED_DOCUMENT_ACCESS_PURPOSES,
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
  type GeneratedDocumentAccessTransaction,
} from "../generated-documents";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import {
  CustomQuotationApprovalService,
  type CustomQuotationApprovalTransaction,
} from "./custom-quotation-approval.service";

type CustomerApprovalTransaction = CustomQuotationApprovalTransaction & GeneratedDocumentAccessTransaction & {
  tenant: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomerApprovalDatabase = {
  $transaction<T>(work: (transaction: CustomerApprovalTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationCustomerApprovalService {
  private readonly database: CustomerApprovalDatabase;

  constructor(
    prisma: PrismaService,
    private readonly documentAccess: GeneratedDocumentAccessService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    private readonly approvals: CustomQuotationApprovalService,
  ) {
    this.database = prisma as unknown as CustomerApprovalDatabase;
  }

  async getPublicProposal(token: string) {
    const context = await this.resolveToken(token);
    const proposal = await this.withTenantTransaction(context.document.tenantId, async (tx) => {
      const version = await this.findPublicVersion(tx, context.document.tenantId, context.document.ownerId);
      const tenant = await tx.tenant.findUnique({
        where: { id: context.document.tenantId },
        select: { name: true, logoUrl: true },
      });
      if (!tenant) throw new NotFoundException("CUSTOM_QUOTATION_PROPOSAL_NOT_FOUND");
      return { version, tenant };
    });
    const expiresInSeconds = 900;
    const url = await this.generatedDocuments.getSignedUrl(context.document.tenantId, context.document.id, expiresInSeconds);
    return {
      quotationNumber: proposal.version.customQuotation.quotationNumber,
      versionNumber: proposal.version.versionNumber,
      tenant: { name: proposal.tenant.name, logoUrl: proposal.tenant.logoUrl },
      lines: proposal.version.lines.map((line: any) => ({
        displayOrder: line.displayOrder,
        description: line.description,
        quantity: decimalString(line.quantity),
        commercialNote: line.commercialNote,
      })),
      currency: proposal.version.currency,
      finalSellingPrice: decimalString(proposal.version.finalSellingPrice),
      quotationValidUntil: proposal.version.quotationValidUntil,
      paymentConditionType: proposal.version.paymentConditionType,
      paymentTermValue: proposal.version.paymentTermValue,
      paymentTermUnit: proposal.version.paymentTermUnit,
      commercialObservations: proposal.version.commercialObservations,
      status: proposal.version.status,
      document: {
        fileName: context.document.fileName,
        mimeType: context.document.mimeType,
        size: context.document.size,
        url,
        expiresInSeconds,
      },
    };
  }

  accept(token: string) {
    return this.transition(token, "ACCEPTED");
  }

  reject(token: string) {
    return this.transition(token, "REJECTED");
  }

  private async transition(token: string, targetStatus: "ACCEPTED" | "REJECTED") {
    const context = await this.resolveToken(token);
    return this.withTenantTransaction(context.document.tenantId, async (tx) => {
      const target = await tx.customQuotationVersion.findFirst({
        where: { id: context.document.ownerId, tenantId: context.document.tenantId },
        select: { id: true, customQuotationId: true, customQuotation: { select: { customer: { select: { fullName: true } } } }, },
      });
      if (!target) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");

      const consumed = await this.documentAccess.consumeInTransaction(tx, context.access.id);
      if (!consumed) throw new ConflictException("CUSTOM_QUOTATION_APPROVAL_TOKEN_ALREADY_USED");
      return this.approvals.transitionInTransaction(
        tx,
        context.document.tenantId,
        target.customQuotationId,
        target.id,
        targetStatus,
        { userId: null, name: target.customQuotation.customer.fullName },
      );
    });
  }

  private async resolveToken(token: string) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) throw new BadRequestException("CUSTOM_QUOTATION_APPROVAL_TOKEN_REQUIRED");
    const access = await this.documentAccess.resolve(normalizedToken, GENERATED_DOCUMENT_ACCESS_PURPOSES.APPROVAL);
    const document = access.generatedDocument;
    if (
      document.ownerType !== GENERATED_DOCUMENT_OWNER_TYPES.CUSTOM_QUOTATION_VERSION
      || document.documentType !== GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL
      || document.variant !== GENERATED_DOCUMENT_VARIANTS.GENERATED
      || document.version !== 1
    ) {
      throw new NotFoundException("CUSTOM_QUOTATION_APPROVAL_TOKEN_INVALID");
    }
    return { access, document };
  }

  private async findPublicVersion(tx: CustomerApprovalTransaction, tenantId: string, versionId: string) {
    const version = await tx.customQuotationVersion.findFirst({
      where: { id: versionId, tenantId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        currency: true,
        finalSellingPrice: true,
        quotationValidUntil: true,
        paymentConditionType: true,
        paymentTermValue: true,
        paymentTermUnit: true,
        commercialObservations: true,
        lines: { orderBy: [{ displayOrder: "asc" }, { id: "asc" }], select: { displayOrder: true, description: true, quantity: true, commercialNote: true } },
        customQuotation: { select: { quotationNumber: true } },
      },
    });
    if (!version) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
    return version;
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomerApprovalTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new ConflictException("CUSTOM_QUOTATION_PROPOSAL_DECIMAL_INVALID");
}
