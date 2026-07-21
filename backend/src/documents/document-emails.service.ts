import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  EmailTemplate,
  SendEmailOptions,
} from '../email/interfaces/email-options.interface';
import {
  CONTRACTS_EMAIL_JOB_NAMES,
  CONTRACTS_EMAIL_JOB_OPTIONS,
  ContractsEmailJobName,
  ContractsEmailJobPayload,
} from '../email/jobs';
import { JobDispatcherService } from '../infrastructure/job-dispatcher';
import { PLATFORM_QUEUE_KEYS } from '../infrastructure/queue';

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
    private readonly jobDispatcher: JobDispatcherService,
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
      jobName?: ContractsEmailJobName;
      jobId?: string;
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
      await this.dispatchContractsEmail(
        options?.jobName || CONTRACTS_EMAIL_JOB_NAMES.CONTRACT_REVIEW,
        {
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
        },
        options?.jobId,
      );

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
   * Template: contract-signing-link (para contratos), minor-annex-signing-link (para anexos), etc.
   * Endpoints: POST /contracts/send-signing-email + uso interno en sendSigningLinksForContract
   */
  async sendDocumentSigningEmail(
    user: { id: string; email: string; fullName: string },
    payload: {
      toEmail: string;
      clientName: string;
      documentNumber: string;
      signingUrl: string;
      documentType?: string;
      signerRole?: string;
      minorName?: string;
    },
    tenant: { id: string; name: string; emailLogoUrl?: string | null; logoUrl?: string | null } | null | undefined,
    options?: {
      subject?: string;
      template?: EmailTemplate;
      jobName?: ContractsEmailJobName;
      jobId?: string;
    },
  ) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    // Determine template and subject based on document type
    let template: EmailTemplate = 'contract-signing-link';
    let defaultSubject = `✍️ Firma tu Contrato - ${payload.documentNumber}`;
    let templateData: any = {
      clientName: payload.clientName,
      contractNumber: payload.documentNumber,
      signingUrl: payload.signingUrl,
      tenantName: tenant.name,
    };

    if (payload.documentType === 'MINOR_ANNEX') {
      template = 'minor-annex-signing-link';
      defaultSubject = `👶 Firma Anexo de Menor - ${payload.documentNumber}`;
      templateData = {
        signerName: payload.clientName,
        minorName: payload.minorName || 'Menor',
        contractNumber: payload.documentNumber,
        signingUrl: payload.signingUrl,
        signerRole: payload.signerRole || 'TUTOR',
        tenantName: tenant.name,
      };
    } else if (payload.documentType === 'LIABILITY_WAIVER') {
      template = 'liability-waiver-signing-link';
      defaultSubject = `⚠️ Firma Exoneración de Seguro - ${payload.documentNumber}`;
      templateData = {
        signerName: payload.clientName,
        contractNumber: payload.documentNumber,
        signingUrl: payload.signingUrl,
        tenantName: tenant.name,
      };
    }

    try {
      await this.dispatchContractsEmail(
        options?.jobName || CONTRACTS_EMAIL_JOB_NAMES.SIGNING_INVITATION,
        {
          tenantId: tenant.id,
          to: payload.toEmail,
          subject: options?.subject || defaultSubject,
          template: options?.template || template,
          templateData,
          triggeredBy: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
          },
        },
        options?.jobId,
      );

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

  private async dispatchContractsEmail(
    jobName: ContractsEmailJobName,
    options: SendEmailOptions,
    jobId?: string,
  ): Promise<void> {
    await this.jobDispatcher.dispatch<ContractsEmailJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.EMAIL,
      jobName,
      payload: { options },
      metadata: { tenantId: options.tenantId },
      options: {
        ...CONTRACTS_EMAIL_JOB_OPTIONS,
        ...(jobId ? { jobId } : {}),
      },
    });
  }
}
