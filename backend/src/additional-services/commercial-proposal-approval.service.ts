import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  GENERATED_DOCUMENT_ACCESS_PURPOSES,
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
} from "../generated-documents";
import { CommercialProposalStatus } from "./enums";

@Injectable()
export class CommercialProposalApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: GeneratedDocumentAccessService,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
  ) {}

  async getPublicProposal(token: string) {
    const context = await this.resolve(token);
    const url = await this.generatedDocumentsService.getSignedUrl(
      context.document.tenantId,
      context.document.id,
      900,
    );
    return {
      proposalNumber: context.order.orderNumber,
      commercialStatus: context.order.commercialStatus,
      company: context.order.tenant,
      document: {
        fileName: context.document.fileName,
        mimeType: context.document.mimeType,
        size: context.document.size,
        url,
        expiresInSeconds: 900,
      },
    };
  }

  async approve(
    token: string,
    ip: string | null,
    userAgent: string | null,
  ) {
    const context = await this.resolve(token);
    if (
      ![
        CommercialProposalStatus.PDF_GENERATED,
        CommercialProposalStatus.SENT,
      ].includes(context.order.commercialStatus as CommercialProposalStatus)
    ) {
      throw new ConflictException(
        "This commercial proposal cannot be approved in its current state.",
      );
    }

    const approvedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.generatedDocumentAccessToken.updateMany({
        where: {
          id: context.access.id,
          isActive: true,
          usedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: approvedAt } }],
        },
        data: { isActive: false, usedAt: approvedAt },
      });
      if (consumed.count !== 1) {
        throw new ConflictException("This approval link was already used.");
      }
      const updated = await transaction.additionalServiceOrder.updateMany({
        where: {
          id: context.order.id,
          tenantId: context.document.tenantId,
          commercialStatus: {
            in: [
              CommercialProposalStatus.PDF_GENERATED,
              CommercialProposalStatus.SENT,
            ],
          },
        },
        data: {
          commercialStatus: CommercialProposalStatus.APPROVED,
          proposalApprovedAt: approvedAt,
          proposalApprovalMethod: "EMAIL_LINK",
          proposalApprovedByUserId: null,
          proposalApprovedByName: null,
          proposalApprovedIp: this.truncate(ip, 128),
          proposalApprovedUserAgent: this.truncate(userAgent, 1024),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "This commercial proposal was already processed.",
        );
      }
    });

    return {
      proposalNumber: context.order.orderNumber,
      commercialStatus: CommercialProposalStatus.APPROVED,
      approvedAt,
    };
  }

  private async resolve(token: string) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) {
      throw new BadRequestException("Approval token is required.");
    }
    const access = await this.documentAccessService.resolve(
      normalizedToken,
      GENERATED_DOCUMENT_ACCESS_PURPOSES.APPROVAL,
    );
    const document = access.generatedDocument;
    if (
      document.ownerType !== GENERATED_DOCUMENT_OWNER_TYPES.ADDITIONAL_SERVICE_ORDER ||
      document.documentType !== GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL ||
      document.variant !== GENERATED_DOCUMENT_VARIANTS.GENERATED ||
      document.version !== 1
    ) {
      throw new NotFoundException("Approval link is invalid or expired.");
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: document.tenantId },
      select: { name: true, logoUrl: true },
    });
    if (!tenant) {
      throw new NotFoundException("Commercial proposal not found.");
    }
    const order = await this.prisma.additionalServiceOrder.findFirst({
      where: { id: document.ownerId, tenantId: document.tenantId },
      select: {
        id: true,
        orderNumber: true,
        commercialStatus: true,
      },
    });
    if (!order) {
      throw new NotFoundException("Commercial proposal not found.");
    }
    return { access, document, order: { ...order, tenant } };
  }

  private truncate(value: string | null, max: number): string | null {
    const normalized = String(value || "").trim();
    return normalized ? normalized.slice(0, max) : null;
  }
}
