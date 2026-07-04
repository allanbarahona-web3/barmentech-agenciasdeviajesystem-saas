import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailTemplate } from '../email/interfaces/email-options.interface';

/**
 * DocumentEmailsService
 * 
 * Generic service for sending document-related emails.
 * 
 * Purpose:
 * - Centralize email-sending logic for all document types
 * - Support contracts, authorizations, waivers, and future legal documents
 * 
 * Current State:
 * - Extracted from ContractsEmailsService
 * - Supports contract email workflows
 * - Ready to support additional document types
 * 
 * Email Workflows:
 * - Send document PDF for review
 * - Send signing link for digital signature
 * - Send signed document to multiple recipients
 */
@Injectable()
export class DocumentEmailsService {
  private readonly logger = new Logger(DocumentEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.logger.log('✅ DocumentEmailsService inicializado');
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
   * Enviar documento en PDF para revisión (antes de firma)
   * Template: contract-pdf-attachment (para contratos)
   * Endpoint: POST /contracts/send-email
   */
  async sendDocumentPdfEmail(
    user: { id: string; email: string; fullName: string },
    payload: {
      toEmail: string;
      clientName: string;
      documentNumber: string;
      fileName: string;
    },
    pdfBuffer: Buffer,
    tenant: { id: string; name: string; emailLogoUrl?: string | null; logoUrl?: string | null } | null | undefined,
    options?: {
      subject?: string;
      template?: EmailTemplate;
    },
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
        to: payload.toEmail,
        subject: options?.subject || `📄 Contrato para Firma - ${payload.documentNumber}`,
        template: options?.template || 'contract-pdf-attachment',
        templateData: {
          clientName: payload.clientName,
          contractNumber: payload.documentNumber,
          tenantName: tenant.name,
        },
        attachments: [
          {
            filename: payload.fileName,
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
        sentTo: payload.toEmail,
        contractNumber: payload.documentNumber,
        sentBy: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send document email: ${(error as Error).message}`);
      throw new InternalServerErrorException("No se pudo enviar el correo con el contrato adjunto.");
    }
  }

  /**
   * Enviar link de firma digital (CRÍTICO - contiene signingUrl)
   * Template: contract-signing-link (para contratos)
   * Endpoints: POST /contracts/send-signing-email + uso interno en sendSigningLinksForContract
   */
  async sendDocumentSigningEmail(
    user: { id: string; email: string; fullName: string },
    payload: {
      toEmail: string;
      clientName: string;
      documentNumber: string;
      signingUrl: string;
    },
    tenant: { id: string; name: string; emailLogoUrl?: string | null; logoUrl?: string | null } | null | undefined,
    options?: {
      subject?: string;
      template?: EmailTemplate;
    },
  ) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    try {
      await this.emailService.sendEmail({
        tenantId: tenant.id,
        to: payload.toEmail,
        subject: options?.subject || `✍️ Firma tu Contrato - ${payload.documentNumber}`,
        template: options?.template || 'contract-signing-link',
        templateData: {
          clientName: payload.clientName,
          contractNumber: payload.documentNumber,
          signingUrl: payload.signingUrl, // ⚠️ CRÍTICO: Enlace público para la firma del documento.
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
        sentTo: payload.toEmail,
        contractNumber: payload.documentNumber,
        sentBy: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send document signing email: ${(error as Error).message}`);
      throw new InternalServerErrorException("No se pudo enviar el correo de firma al cliente.");
    }
  }

  /**
   * Enviar PDF firmado a múltiples recipients (loop)
   * Template: contract-signed-confirmation (para contratos)
   * Endpoint: POST /contracts/:contractId/resend-signed-email
   */
  async sendSignedDocumentToRecipients(
    user: { id: string; email: string; fullName: string },
    documentNumber: string,
    fileName: string,
    pdfBase64: string,
    recipients: Array<{ email: string; name: string }>,
    tenant: { id: string; name: string; emailLogoUrl?: string | null; logoUrl?: string | null } | null | undefined,
    options?: {
      subject?: string;
      template?: EmailTemplate;
    },
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
          subject: options?.subject || `✅ Contrato Firmado - ${documentNumber}`,
          template: options?.template || 'contract-signed-confirmation',
          templateData: {
            recipientName: recipient.name,
            contractNumber: documentNumber,
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
        this.logger.log(`✅ Sent signed document to ${recipient.email}`);
      } catch (error) {
        failedTo.push(recipient.email);
        this.logger.warn(`⚠️ Failed to send signed document to ${recipient.email}: ${(error as Error).message}`);
      }
    }

    return { sentTo, failedTo };
  }
}
