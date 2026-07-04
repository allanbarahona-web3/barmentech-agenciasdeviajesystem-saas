import { Injectable, Logger } from '@nestjs/common';
import { DocumentEmailsService } from '../documents/document-emails.service';
import { SendContractEmailDto } from './dto/send-contract-email.dto';
import { SendSigningEmailDto } from './dto/send-signing-email.dto';
import { ResolvedTenant } from '../tenant/tenant.service';

/**
 * ContractsEmailsService (Wrapper)
 * 
 * Temporary wrapper that delegates to DocumentEmailsService.
 * 
 * Purpose:
 * - Maintain backward compatibility with ContractsService
 * - Keep existing method signatures unchanged
 * - Delegate actual email-sending logic to DocumentEmailsService
 * 
 * Migration Status:
 * - Email logic extracted to DocumentEmailsService
 * - This wrapper preserves existing integration points
 * - Will remain until ContractsService is fully refactored
 */
@Injectable()
export class ContractsEmailsService {
  private readonly logger = new Logger(ContractsEmailsService.name);

  constructor(
    private readonly documentEmailsService: DocumentEmailsService,
  ) {
    this.logger.log('✅ ContractsEmailsService inicializado (wrapper mode)');
  }

  /**
   * Enviar contrato en PDF para revisión (antes de firma)
   * Template: contract-pdf-attachment
   * Endpoint: POST /contracts/send-email
   * 
   * Delegates to DocumentEmailsService
   */
  async sendContractEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendContractEmailDto,
    pdfBuffer: Buffer,
    tenant?: ResolvedTenant | null,
  ) {
    return this.documentEmailsService.sendDocumentPdfEmail(
      user,
      {
        toEmail: dto.toEmail,
        clientName: dto.clientName,
        documentNumber: dto.contractNumber,
        fileName: dto.fileName,
      },
      pdfBuffer,
      tenant,
    );
  }

  /**
   * Enviar link de firma digital (CRÍTICO - contiene signingUrl)
   * Template: contract-signing-link
   * Endpoints: POST /contracts/send-signing-email + uso interno en sendSigningLinksForContract
   * 
   * Delegates to DocumentEmailsService
   */
  async sendContractSigningEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendSigningEmailDto,
    tenant?: ResolvedTenant | null,
  ) {
    return this.documentEmailsService.sendDocumentSigningEmail(
      user,
      {
        toEmail: dto.toEmail,
        clientName: dto.clientName,
        documentNumber: dto.contractNumber,
        signingUrl: dto.signingUrl,
      },
      tenant,
    );
  }

  /**
   * Enviar PDF firmado a múltiples recipients (loop)
   * Template: contract-signed-confirmation
   * Endpoint: POST /contracts/:contractId/resend-signed-email
   * 
   * Delegates to DocumentEmailsService
   */
  async sendSignedContractToRecipients(
    user: { id: string; email: string; fullName: string },
    contractNumber: string,
    fileName: string,
    pdfBase64: string,
    recipients: Array<{ email: string; name: string }>,
    tenant?: ResolvedTenant | null,
  ): Promise<{ sentTo: string[]; failedTo: string[] }> {
    return this.documentEmailsService.sendSignedDocumentToRecipients(
      user,
      contractNumber,
      fileName,
      pdfBase64,
      recipients,
      tenant,
    );
  }
}