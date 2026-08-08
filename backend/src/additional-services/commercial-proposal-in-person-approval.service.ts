import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentsService,
} from "../generated-documents";
import { CommercialProposalStatus } from "./enums";
import type { AdditionalServiceOrderRecord } from "./repositories";

export interface InPersonApprovalActor {
  id: string;
  fullName: string;
}

@Injectable()
export class CommercialProposalInPersonApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
  ) {}

  async approve(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
    actor: InPersonApprovalActor,
  ) {
    if (order.tenantId !== tenantId) {
      throw new ForbiddenException(
        "La propuesta comercial no pertenece al tenant autenticado.",
      );
    }
    if (
      ![
        CommercialProposalStatus.PDF_GENERATED,
        CommercialProposalStatus.SENT,
      ].includes(order.commercialStatus as CommercialProposalStatus)
    ) {
      throw new ConflictException(
        "La propuesta comercial no puede aprobarse presencialmente en su estado actual.",
      );
    }

    const document = await this.generatedDocumentsService.findLatest({
      tenantId,
      ownerType: GENERATED_DOCUMENT_OWNER_TYPES.ADDITIONAL_SERVICE_ORDER,
      ownerId: order.id,
      documentType: GENERATED_DOCUMENT_TYPES.COMMERCIAL_PROPOSAL,
      variant: GENERATED_DOCUMENT_VARIANTS.GENERATED,
      version: 1,
    });
    if (!document) {
      throw new NotFoundException(
        "La propuesta comercial no tiene un PDF persistido.",
      );
    }

    const approvedAt = new Date();
    const updated = await this.prisma.$transaction((transaction) =>
      transaction.$executeRaw`
        UPDATE "additional_service_orders"
        SET "commercialStatus" = 'APPROVED'::"CommercialProposalStatus",
            "proposalApprovedAt" = ${approvedAt},
            "proposalApprovalMethod" = 'IN_PERSON',
            "proposalApprovedByUserId" = ${actor.id},
            "proposalApprovedByName" = ${actor.fullName},
            "proposalApprovedIp" = NULL,
            "proposalApprovedUserAgent" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${order.id}
          AND "tenantId" = ${tenantId}
          AND "commercialStatus" IN (
            'PDF_GENERATED'::"CommercialProposalStatus",
            'SENT'::"CommercialProposalStatus"
          )
      `,
    );
    if (updated !== 1) {
      throw new ConflictException(
        "La propuesta comercial ya fue procesada.",
      );
    }

    return {
      proposalNumber: order.orderNumber,
      commercialStatus: CommercialProposalStatus.APPROVED,
      approvedAt,
      approvalMethod: "IN_PERSON" as const,
    };
  }
}
