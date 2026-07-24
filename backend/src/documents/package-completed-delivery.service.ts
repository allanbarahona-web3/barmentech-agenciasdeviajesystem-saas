import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ContractSigningSessionBuilder } from "../contracts/contract-signing-session.builder";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { DocumentDeliveryService } from "./document-delivery.service";
import { DocumentSigningSessionService } from "./document-signing-session.service";
import { DocumentSigningService } from "./document-signing.service";
import { SigningParticipant } from "./signing-session/signing-session.types";

@Injectable()
export class PackageCompletedDeliveryService {
  private readonly logger = new Logger(PackageCompletedDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentSigningSessionService: DocumentSigningSessionService,
    private readonly documentDeliveryService: DocumentDeliveryService,
    private readonly storageService: StorageService,
    private readonly documentSigningService: DocumentSigningService,
    private readonly contractSigningSessionBuilder: ContractSigningSessionBuilder,
  ) {}

  async deliver(documentId: string): Promise<void> {
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

      const isSessionCompleted =
        await this.documentSigningSessionService.isSigningSessionCompleted(
          contract.id,
        );
      await this.documentSigningSessionService.assertArtifactsReady(contract.id);
      const contractDoc = await this.getContractDocumentSigning(contract.id);
      if (
        !isSessionCompleted ||
        !contractDoc?.signedPdfObjectKey
      ) {
        throw new BadRequestException(
          "El contrato no esta firmado o sus artefactos no estan listos.",
        );
      }

      const tenant = contract.tenant || null;
      if (!tenant) {
        throw new InternalServerErrorException(
          "Tenant no encontrado para enviar email.",
        );
      }

      const payload = this.documentSigningService.getPayloadRecord(
        contract.payload,
      );
      const participants = this.getSigningParticipantsFromPlan(contract);
      const signedPdfBuffer = await this.storageService.downloadObject(
        contractDoc.signedPdfObjectKey,
      );

      if (!signedPdfBuffer.length) {
        throw new InternalServerErrorException(
          "No se pudo leer el contrato firmado.",
        );
      }

      const deliveryResult =
        await this.documentDeliveryService.deliverSignedDocument({
          contractId: contract.id,
          completedPackageId: contractDoc.sessionId,
          contractNumber: contract.contractNumber,
          signedPdfBuffer,
          signedPdfFileName: contractDoc.signedPdfFileName,
          signingParticipants: participants,
          actorContext: {
            userId: String(contract.generatedByUserId || "system"),
            email: String(contract.generatedByEmail || "system@local"),
            fullName: String(contract.generatedByName || "Sistema"),
          },
          tenant,
        });

      const dispatchLogEntry =
        this.documentDeliveryService.buildDispatchLogEntry({
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

      const existingDispatchLog = Array.isArray(payload?.emailDispatchLog)
        ? payload.emailDispatchLog.filter(
            (item: any) => item && typeof item === "object",
          )
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
      const message =
        error instanceof Error
          ? error.message
          : "Fallo el envio automatico del contrato firmado.";
      this.logger.error(
        `[package-completed] Delivery failed for documentId=${documentId}: ${message}`,
      );
      // Do not fail the signing process
    }
  }

  private async getContractDocumentSigning(contractId: string): Promise<any> {
    const session = await (this.prisma as any).documentSigningSession.findFirst({
      where: {
        contractId,
        status: {
          in: ["PENDING", "IN_PROGRESS", "COMPLETED", "SIGNED"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return null;
    }

    return (this.prisma as any).documentSigning.findFirst({
      where: {
        sessionId: session.id,
        documentType: "CONTRACT",
      },
    });
  }

  private getSigningParticipantsFromPlan(contract: any): SigningParticipant[] {
    const plan = this.contractSigningSessionBuilder.buildFromContract(contract);
    return plan.documents[0]?.signers || [];
  }
}
