import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { EmailService } from "../email/email.service";
import {
  GENERATED_DOCUMENT_ACCESS_PURPOSES,
  GENERATED_DOCUMENT_OWNER_TYPES,
  GENERATED_DOCUMENT_TYPES,
  GENERATED_DOCUMENT_VARIANTS,
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
} from "../generated-documents";
import { ConfigService } from "@nestjs/config";
import { TenantService } from "../tenant/tenant.service";
import { getPublicAppBaseUrl } from "../common/utils/tenant-url.util";
import { CommercialProposalStatus } from "./enums";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceOrderRecord,
  AdditionalServicesRepository,
} from "./repositories";

export interface CommercialProposalEmailActor {
  userId: string;
  email: string;
  fullName: string;
}

export interface CommercialProposalDeliveryResult {
  documentId: string;
  commercialStatus: CommercialProposalStatus.SENT;
  sentAt: Date;
  recipientEmail: string;
}

@Injectable()
export class CommercialProposalEmailService {
  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly repository: AdditionalServicesRepository,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    private readonly emailService: EmailService,
    private readonly documentAccessService: GeneratedDocumentAccessService,
    private readonly tenantService: TenantService,
    private readonly configService: ConfigService,
  ) {}

  async send(
    order: AdditionalServiceOrderRecord,
    tenantId: string,
    actor: CommercialProposalEmailActor,
  ): Promise<CommercialProposalDeliveryResult> {
    if (order.tenantId !== tenantId) {
      throw new NotFoundException(
        "Orden de servicios adicionales no encontrada.",
      );
    }
    if (order.commercialStatus !== CommercialProposalStatus.PDF_GENERATED) {
      throw new BadRequestException(
        "La propuesta comercial solo puede enviarse cuando su PDF está generado.",
      );
    }

    const customer = this.findCustomer(order);
    const recipientEmail = customer.email?.trim().toLowerCase();
    if (!recipientEmail) {
      throw new BadRequestException(
        "El cliente no tiene un correo electrónico disponible.",
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
      throw new BadRequestException(
        "La propuesta comercial no tiene un PDF persistido para enviar.",
      );
    }

    const pdf = await this.generatedDocumentsService.download(
      tenantId,
      document.id,
    );
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const approvalToken = await this.documentAccessService.issue(
      document.id,
      GENERATED_DOCUMENT_ACCESS_PURPOSES.APPROVAL,
      expiresAt,
    );
    const tenant = await this.tenantService.getTenantConfig(tenantId);
    const approvalUrl = `${getPublicAppBaseUrl(
      this.configService,
      tenant,
    )}/commercial-proposals/${encodeURIComponent(approvalToken)}`;
    const result = await this.emailService.sendEmail({
      tenantId,
      to: recipientEmail,
      subject: "Propuesta comercial {{documentNumber}} - {{tenantName}}",
      template: "business-document-attachment",
      templateData: {
        recipientName: customer.fullName,
        documentLabel: "Propuesta comercial",
        documentNumber: order.orderNumber,
        message:
          "Adjuntamos la propuesta comercial con el detalle de los servicios solicitados.",
        actionUrl: approvalUrl,
        actionLabel: "Ver y aprobar propuesta",
      },
      attachments: [
        {
          filename: document.fileName,
          content: pdf.toString("base64"),
          contentType: document.mimeType,
        },
      ],
      triggeredBy: actor,
    });
    if (!result.success) {
      await this.documentAccessService.revoke(approvalToken);
      throw new InternalServerErrorException(
        result.error || "No se pudo enviar la propuesta comercial.",
      );
    }

    const sentAt = new Date();
    await this.repository.updateOrderDelivery(tenantId, order.id, {
      commercialStatus: CommercialProposalStatus.SENT,
      proposalSentAt: sentAt,
      proposalSentToEmail: recipientEmail,
    });

    return {
      documentId: document.id,
      commercialStatus: CommercialProposalStatus.SENT,
      sentAt,
      recipientEmail,
    };
  }

  private findCustomer(order: AdditionalServiceOrderRecord) {
    const participants = order.lines.flatMap((line) => line.participants);
    return (
      participants.find((participant) => participant.role === "HOLDER") ??
      participants[0] ?? {
        fullName: "Cliente",
        email: null,
      }
    );
  }
}
