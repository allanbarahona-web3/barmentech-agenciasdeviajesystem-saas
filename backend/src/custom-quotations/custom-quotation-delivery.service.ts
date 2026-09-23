import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isEmail } from "class-validator";
import { randomUUID } from "crypto";
import { getPublicAppBaseUrl } from "../common/utils/tenant-url.util";
import { EmailService } from "../email/email.service";
import {
  GENERATED_DOCUMENT_ACCESS_PURPOSES,
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
} from "../generated-documents";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import { assertCustomQuotationVersionNotExpired, type CustomQuotationApprovalTransaction } from "./custom-quotation-approval.service";
import { CustomQuotationDeliveryEmailMapper } from "./custom-quotation-delivery-email.mapper";

export type CustomQuotationDeliveryActor = { userId: string; email: string; name: string };

type DeliveryTransaction = CustomQuotationApprovalTransaction;

type DeliveryDatabase = {
  $transaction<T>(work: (transaction: DeliveryTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationDeliveryService {
  private readonly database: DeliveryDatabase;

  constructor(
    prisma: PrismaService,
    private readonly documents: GeneratedDocumentsService,
    private readonly access: GeneratedDocumentAccessService,
    private readonly email: EmailService,
    private readonly tenants: TenantService,
    private readonly config: ConfigService,
    private readonly mapper: CustomQuotationDeliveryEmailMapper,
  ) {
    this.database = prisma as unknown as DeliveryDatabase;
  }

  async send(tenantId: string, quotationId: string, versionId: string, actor: CustomQuotationDeliveryActor) {
    const { version, timezone } = await this.withTenantTransaction(tenantId, async (tx) => {
      const version = await tx.customQuotationVersion.findFirst({
        where: { id: versionId, tenantId, customQuotationId: quotationId },
        select: {
          id: true,
          status: true,
          title: true,
          currency: true,
          finalSellingPrice: true,
          quotationValidUntil: true,
          recipientFullName: true,
          recipientEmail: true,
          recipientPhone: true,
          recipientCompanyName: true,
          customQuotation: {
            select: {
              quotationNumber: true,
              status: true,
            },
          },
        },
      });
      if (!version) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
      if (version.status !== "ISSUED" || version.customQuotation.status !== "ISSUED") {
        throw new ConflictException("CUSTOM_QUOTATION_VERSION_NOT_DELIVERABLE");
      }
      const timezone = await assertCustomQuotationVersionNotExpired(tx, tenantId, version.quotationValidUntil);
      return { version, timezone };
    });

    const recipient = snapshotRecipient(version);
    if (!recipient) throw new ConflictException("CUSTOM_QUOTATION_RECIPIENT_SNAPSHOT_REQUIRED");
    const recipientEmail = recipient?.email?.trim().toLowerCase();
    if (!recipientEmail || !isEmail(recipientEmail)) {
      throw new BadRequestException("CUSTOM_QUOTATION_RECIPIENT_EMAIL_INVALID");
    }
    const document = await this.documents.findLatest({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.CUSTOM_QUOTATION_VERSION,
      ownerId: version.id,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      version: 1,
    });
    if (!document) throw new NotFoundException("CUSTOM_QUOTATION_PROPOSAL_NOT_FOUND");
    if (document.ownerType !== GENERATED_DOCUMENT_OWNER_TYPES.CUSTOM_QUOTATION_VERSION || document.ownerId !== version.id) {
      throw new ConflictException("CUSTOM_QUOTATION_PROPOSAL_OWNERSHIP_INVALID");
    }

    const pdf = await this.documents.download(tenantId, document.id);
    const approvalToken = await this.access.issue(
      document.id,
      GENERATED_DOCUMENT_ACCESS_PURPOSES.APPROVAL,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );
    try {
      const tenant = await this.tenants.getTenantConfig(tenantId);
      const approvalUrl = `${getPublicAppBaseUrl(this.config, tenant)}/custom-quotation-approval/${encodeURIComponent(approvalToken)}`;
      const message = this.mapper.map({
        customerName: recipient!.fullName,
        quotationNumber: version.customQuotation.quotationNumber,
        title: version.title,
        currency: version.currency,
        finalSellingPrice: decimalString(version.finalSellingPrice),
        quotationValidUntil: version.quotationValidUntil,
        timezone,
        approvalUrl,
      });
      const result = await this.email.sendEmail({
        tenantId,
        to: recipientEmail,
        subject: message.subject,
        template: message.template,
        templateData: message.templateData,
        attachments: [{ filename: document.fileName, content: pdf.toString("base64"), contentType: document.mimeType }],
        idempotencyKey: `custom-quotation-proposal:${tenantId}:${document.id}:delivery:${randomUUID()}`,
        triggeredBy: { userId: actor.userId, email: actor.email, fullName: actor.name },
      });
      if (!result.success) throw new InternalServerErrorException(result.error || "CUSTOM_QUOTATION_DELIVERY_FAILED");
      return { documentId: document.id, sentTo: recipientEmail, emailId: result.emailId ?? null };
    } catch (error) {
      await this.access.revoke(approvalToken);
      throw error;
    }
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: DeliveryTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function hasRecipientSnapshot(version: any) {
  return typeof version.recipientFullName === "string" && Boolean(version.recipientFullName.trim());
}

function snapshotRecipient(version: any) {
  if (!hasRecipientSnapshot(version)) return null;
  return {
    fullName: version.recipientFullName.trim(),
    email: normalizedOrNull(version.recipientEmail),
  };
}

function normalizedOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new ConflictException("CUSTOM_QUOTATION_DELIVERY_DECIMAL_INVALID");
}
