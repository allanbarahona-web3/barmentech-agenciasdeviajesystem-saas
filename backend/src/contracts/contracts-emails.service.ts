import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SendContractEmailDto } from './dto/send-contract-email.dto';
import { SendSigningEmailDto } from './dto/send-signing-email.dto';
import { ResolvedTenant } from '../tenant/tenant.service';

/**
 * Service especializado en envío de emails relacionados con contratos
 * Separado de ContractsService para mejor modularización y testing
 */
@Injectable()
export class ContractsEmailsService {
  private readonly logger = new Logger(ContractsEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.logger.log('✅ ContractsEmailsService inicializado');
  }

  /**
   * Load company logo for email templates (returns URL or base64 data URI)
   * Prioridad: emailLogoUrl > logoUrl > fallback
   */
  private async loadCompanyLogoEmailSrc(tenant?: { emailLogoUrl: string | null; logoUrl: string | null } | null): Promise<string | null> {
    // Prioridad 1: Usar emailLogoUrl del tenant, si no está, usar logoUrl del tenant
    const configuredUrl = tenant?.emailLogoUrl || tenant?.logoUrl || this.configService.get<string>("COMPANY_LOGO_EMAIL_URL", "").trim();
    if (configuredUrl) {
      return configuredUrl;
    }
    // Fallback: could load and convert to base64, but URL is preferred
    return null;
  }

  /**
   * Enviar contrato en PDF para revisión (antes de firma)
   * Template: contract-pdf-attachment
   * Endpoint: POST /contracts/send-email
   */
  async sendContractEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendContractEmailDto,
    pdfBuffer: Buffer,
    tenant?: ResolvedTenant | null,
  ) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    if (!pdfBuffer.length) {
      throw new InternalServerErrorException("Adjunto PDF invalido o vacio.");
    }

    const pdfBase64 = pdfBuffer.toString("base64");

    try {
      await this.emailService.sendEmail({
        tenantId: tenant.id,
        to: dto.toEmail,
        subject: `📄 Contrato para Firma - ${dto.contractNumber}`,
        template: 'contract-pdf-attachment',
        templateData: {
          clientName: dto.clientName,
          contractNumber: dto.contractNumber,
          tenantName: tenant.name,
        },
        attachments: [
          {
            filename: dto.fileName,
            content: pdfBase64,
          },
        ],
        triggeredBy: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      });

      return {
        ok: true,
        emailId: null,
        sentTo: dto.toEmail,
        contractNumber: dto.contractNumber,
        sentBy: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send contract email: ${(error as Error).message}`);
      throw new InternalServerErrorException("No se pudo enviar el correo con el contrato adjunto.");
    }
  }

  /**
   * Enviar link de firma digital (CRÍTICO - contiene signingUrl)
   * Template: contract-signing-link
   * Endpoints: POST /contracts/send-signing-email + uso interno en sendSigningLinksForContract
   */
  async sendContractSigningEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendSigningEmailDto,
    tenant?: ResolvedTenant | null,
  ) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    try {
      await this.emailService.sendEmail({
        tenantId: tenant.id,
        to: dto.toEmail,
        subject: `✍️ Firma tu Contrato - ${dto.contractNumber}`,
        template: 'contract-signing-link',
        templateData: {
          clientName: dto.clientName,
          contractNumber: dto.contractNumber,
          signingUrl: dto.signingUrl, // ⚠️ CRÍTICO: Enlace público para la firma del contrato.
          tenantName: tenant.name,
        },
        triggeredBy: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      });

      return {
        ok: true,
        emailId: null,
        sentTo: dto.toEmail,
        contractNumber: dto.contractNumber,
        sentBy: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send contract signing email: ${(error as Error).message}`);
      throw new InternalServerErrorException("No se pudo enviar el correo de firma al cliente.");
    }
  }

  /**
   * Enviar PDF firmado a múltiples recipients (loop)
   * Template: contract-signed-confirmation
   * Endpoint: POST /contracts/:contractId/resend-signed-email
   */
  async sendSignedContractToRecipients(
    user: { id: string; email: string; fullName: string },
    contractNumber: string,
    fileName: string,
    pdfBase64: string,
    recipients: Array<{ email: string; name: string }>,
    tenant?: ResolvedTenant | null,
  ): Promise<{ sentTo: string[]; failedTo: string[] }> {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    const sentTo: string[] = [];
    const failedTo: string[] = [];

    for (const recipient of recipients) {
      try {
        await this.emailService.sendEmail({
          tenantId: tenant.id,
          to: recipient.email,
          subject: `✅ Contrato Firmado - ${contractNumber}`,
          template: 'contract-signed-confirmation',
          templateData: {
            recipientName: recipient.name,
            contractNumber: contractNumber,
            tenantName: tenant.name,
          },
          attachments: [
            {
              filename: fileName,
              content: pdfBase64,
            },
          ],
          triggeredBy: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
          },
        });

        sentTo.push(recipient.email);
        this.logger.log(`✅ Sent signed contract to ${recipient.email}`);
      } catch (error) {
        failedTo.push(recipient.email);
        this.logger.warn(`⚠️ Failed to send signed contract to ${recipient.email}: ${(error as Error).message}`);
      }
    }

    return { sentTo, failedTo };
  }
}
