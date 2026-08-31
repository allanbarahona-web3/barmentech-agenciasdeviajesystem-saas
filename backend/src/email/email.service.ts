import {
  Injectable,
  InternalServerErrorException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import {
  SendEmailOptions,
  SendEmailResult,
  TenantEmailConfig,
  EmailTemplate,
} from './interfaces/email-options.interface';
import { exchangeRateHistoryTemplate } from './templates';
import { welcomeUserTemplate } from './templates/welcome-user.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { passwordResetByAdminTemplate } from './templates/password-reset-by-admin.template';
import { creditNoteApprovedTemplate } from './templates/credit-note-approved.template';
import { contractAccountStatementTemplate } from './templates/contract-account-statement.template';
import { receiptApprovedTemplate } from './templates/receipt-approved.template';
import { invoiceInitialTemplate } from './templates/invoice-initial.template';
import { businessDocumentAttachmentTemplate } from './templates/business-document-attachment.template';

// Contract templates
import { contractPdfAttachmentTemplate } from './templates/contract-pdf-attachment.template';
import { contractSigningLinkTemplate } from './templates/contract-signing-link.template';
import { minorAnnexSigningLinkTemplate } from './templates/minor-annex-signing-link.template';
import { liabilityWaiverSigningLinkTemplate } from './templates/liability-waiver-signing-link.template';
import { contractSignedConfirmationTemplate } from './templates/contract-signed-confirmation.template';

// Internal Tourism templates
import { bookingConfirmationTemplate } from './templates/booking-confirmation.template';
import { paymentReceivedTemplate } from './templates/payment-received.template';
import { tripCancelledNotificationTemplate } from './templates/trip-cancelled.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY', '').trim();
    if (!apiKey) {
      this.logger.error('⚠️ RESEND_API_KEY no configurado');
    }
    this.resend = new Resend(apiKey);
  }

  /**
   * Método principal para enviar emails
   * ✅ Auto-resuelve fromEmail/replyTo del tenant
   * ✅ Auto-carga logo del tenant
   * ✅ Auto-incrementa contadores (rate limiting)
   * ✅ Auto-logs de auditoría
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const {
      tenantId,
      to,
      cc,
      subject,
      template,
      templateData,
      attachments,
      triggeredBy,
      idempotencyKey,
    } = options;

    try {
      // 1. Resolver tenant config (incluye rate limits)
      const tenant = await this.getTenantWithEmailConfig(tenantId);

      // 2. Validar rate limits
      await this.checkRateLimits(tenant);

      // 3. Resolver fromEmail/replyTo
      const { fromEmail, replyTo } = this.resolveEmailAddresses(tenant);

      // 4. Cargar logo del tenant
      const logoSrc = await this.loadTenantLogo(tenant);

      // 5. Renderizar template con branding dinámico
      const html = await this.renderTemplate(template, {
        ...templateData,
        tenantName: tenant.name,
        tenantLogo: logoSrc,
        contactEmail: tenant.contactEmail,
        contactWhatsApp: tenant.contactWhatsApp,
        businessAddress: tenant.businessAddress,
        websiteUrl: tenant.websiteUrl,
        primaryColor: tenant.primaryColor || '#667eea',
        secondaryColor: tenant.secondaryColor || '#764ba2',
      });

      // 6. Normalizar destinatarios
      const toArray = Array.isArray(to) ? to : [to];
      const ccArray = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;

      // 7. Preparar subject con placeholders reemplazados
      const finalSubject = this.replacePlaceholders(subject, {
        tenantName: tenant.name,
        ...templateData,
      });

      // 8. Enviar con Resend
      this.logger.log(
        `📧 Enviando email [${template}] desde ${fromEmail} → ${toArray.join(', ')} (tenant: ${tenant.name})`,
      );

      const result = await this.resend.emails.send({
        from: fromEmail,
        ...(replyTo ? { reply_to: replyTo } : {}),
        to: toArray,
        ...(ccArray && ccArray.length > 0 ? { cc: ccArray } : {}),
        subject: finalSubject,
        html,
        attachments: attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
        })),
      }, idempotencyKey ? { idempotencyKey } : undefined);

      const emailId = result.data?.id || 'unknown';

      // 9. Incrementar contadores
      await this.incrementEmailCounters(tenantId);

      // 10. Log de auditoría
      await this.logEmailSent({
        tenantId,
        to: toArray,
        cc: ccArray,
        subject: finalSubject,
        template,
        resendId: emailId,
        triggeredBy,
      });

      this.logger.log(
        `✅ Email enviado exitosamente [${template}] → Resend ID: ${emailId}`,
      );

      return {
        success: true,
        emailId: emailId !== 'unknown' ? emailId : undefined,
      };
    } catch (error) {
      this.logger.error(`❌ Error enviando email [${template}]:`, (error as Error).message);

      // Si es un error de rate limiting, propagar
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }

      return {
        success: false,
        error: (error as Error).message || 'Error desconocido al enviar email',
      };
    }
  }

  /**
   * Obtener configuración del tenant con datos de email
   */
  private async getTenantWithEmailConfig(
    tenantId: string,
  ): Promise<TenantEmailConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
        logoUrl: true,
        emailLogoUrl: true,
        emailQuotaDaily: true,
        emailQuotaMonthly: true,
        emailsSentToday: true,
        emailsSentMonth: true,
        lastEmailResetDate: true,
        contactPhone: true,
        contactWhatsApp: true,
        contactEmail: true,
        businessAddress: true,
        websiteUrl: true,
        primaryColor: true,
        secondaryColor: true,
      },
    });

    if (!tenant) {
      throw new InternalServerErrorException(`Tenant ${tenantId} no encontrado`);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      fromEmail: tenant.fromEmail || undefined,
      replyToEmail: tenant.replyToEmail || undefined,
      emailVerified: tenant.emailVerified,
      logoUrl: tenant.logoUrl || undefined,
      emailLogoUrl: tenant.emailLogoUrl || undefined,
      emailQuotaDaily: tenant.emailQuotaDaily,
      emailQuotaMonthly: tenant.emailQuotaMonthly,
      emailsSentToday: tenant.emailsSentToday,
      emailsSentMonth: tenant.emailsSentMonth,
      lastEmailResetDate: tenant.lastEmailResetDate || undefined,
      contactPhone: tenant.contactPhone || undefined,
      contactWhatsApp: tenant.contactWhatsApp || undefined,
      contactEmail: tenant.contactEmail || undefined,
      businessAddress: tenant.businessAddress || undefined,
      websiteUrl: tenant.websiteUrl || undefined,
      primaryColor: tenant.primaryColor || undefined,
      secondaryColor: tenant.secondaryColor || undefined,
    };
  }

  /**
   * Resolver fromEmail y replyTo del tenant
   */
  private resolveEmailAddresses(tenant: TenantEmailConfig): {
    fromEmail: string;
    replyTo?: string;
  } {
    const fallbackFromEmail = this.configService
      .get<string>('CONTRACTS_FROM_EMAIL', '')
      .trim();

    const fromEmail =
      tenant.emailVerified && tenant.fromEmail
        ? tenant.fromEmail
        : fallbackFromEmail;

    const replyTo =
      tenant.emailVerified && tenant.replyToEmail
        ? tenant.replyToEmail
        : undefined;

    if (!fromEmail) {
      throw new InternalServerErrorException(
        'No hay email configurado (ni en tenant ni en sistema)',
      );
    }

    this.logger.debug(
      `📧 Email config → From: ${fromEmail}, ReplyTo: ${replyTo || '(none)'}, Verified: ${tenant.emailVerified}`,
    );

    return { fromEmail, replyTo };
  }

  /**
   * Cargar logo del tenant para emails
   */
  private async loadTenantLogo(
    tenant: TenantEmailConfig,
  ): Promise<string | undefined> {
    // Prioridad: emailLogoUrl > logoUrl > undefined
    const logoKey = tenant.emailLogoUrl || tenant.logoUrl;

    if (!logoKey) {
      return undefined;
    }

    // Si es una URL completa, retornar directamente
    if (logoKey.startsWith('http://') || logoKey.startsWith('https://')) {
      return logoKey;
    }

    // Si es una key de DigitalOcean Spaces, construir URL
    const spacesRegion = this.configService.get('SPACES_REGION', 'sfo3');
    const spacesBucket = this.configService.get(
      'SPACES_BUCKET',
      'agencia-viajes-saas',
    );

    return `https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com/${logoKey}`;
  }

  /**
   * Validar rate limits del tenant
   */
  private async checkRateLimits(tenant: TenantEmailConfig): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const lastReset = tenant.lastEmailResetDate
      ? new Date(tenant.lastEmailResetDate).toISOString().split('T')[0]
      : null;

    // Si cambió el día, resetear contador diario
    if (lastReset !== today) {
      this.logger.log(
        `🔄 Reseteando contador diario para tenant ${tenant.name} (último reset: ${lastReset})`,
      );
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          emailsSentToday: 0,
          lastEmailResetDate: new Date(),
        },
      });
      // Actualizar valores en memoria
      tenant.emailsSentToday = 0;
    }

    // Validar límite diario
    if (tenant.emailsSentToday >= tenant.emailQuotaDaily) {
      this.logger.warn(
        `⚠️ Tenant ${tenant.name} alcanzó límite diario: ${tenant.emailsSentToday}/${tenant.emailQuotaDaily}`,
      );
      throw new HttpException(
        `Límite diario de emails alcanzado (${tenant.emailQuotaDaily}). Intenta mañana.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Validar límite mensual
    if (tenant.emailsSentMonth >= tenant.emailQuotaMonthly) {
      this.logger.warn(
        `⚠️ Tenant ${tenant.name} alcanzó límite mensual: ${tenant.emailsSentMonth}/${tenant.emailQuotaMonthly}`,
      );
      throw new HttpException(
        `Límite mensual de emails alcanzado (${tenant.emailQuotaMonthly}). Contacta soporte.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Log de uso actual
    const dailyPercent = (
      (tenant.emailsSentToday / tenant.emailQuotaDaily) *
      100
    ).toFixed(1);
    const monthlyPercent = (
      (tenant.emailsSentMonth / tenant.emailQuotaMonthly) *
      100
    ).toFixed(1);

    this.logger.debug(
      `📊 Rate limits → Daily: ${tenant.emailsSentToday}/${tenant.emailQuotaDaily} (${dailyPercent}%), Monthly: ${tenant.emailsSentMonth}/${tenant.emailQuotaMonthly} (${monthlyPercent}%)`,
    );
  }

  /**
   * Incrementar contadores de emails enviados
   */
  private async incrementEmailCounters(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        emailsSentToday: { increment: 1 },
        emailsSentMonth: { increment: 1 },
      },
    });
  }

  /**
   * Renderizar template HTML según el tipo
   */
  private async renderTemplate(
    template: EmailTemplate,
    data: Record<string, any>,
  ): Promise<string> {
    switch (template) {
      case 'business-document-attachment':
        return businessDocumentAttachmentTemplate(data as any);

      case 'exchange-rate-history':
        return exchangeRateHistoryTemplate(data as any);

      case 'welcome-user':
        return welcomeUserTemplate(data as any);

      case 'password-reset':
        return passwordResetTemplate(data as any);

      case 'password-reset-by-admin':
        return passwordResetByAdminTemplate(data as any);

      case 'credit-note-approved':
        return creditNoteApprovedTemplate(data as any);

      case 'contract-account-statement':
        return contractAccountStatementTemplate(data as any);

      case 'receipt-approved':
        return receiptApprovedTemplate(data as any);

      case 'invoice-initial':
        return invoiceInitialTemplate(data as any);

      case 'contract-pdf-attachment':
        return contractPdfAttachmentTemplate(data as any);

      case 'contract-signing-link':
        return contractSigningLinkTemplate(data as any);

      case 'minor-annex-signing-link':
        return minorAnnexSigningLinkTemplate(data as any);

      case 'liability-waiver-signing-link':
        return liabilityWaiverSigningLinkTemplate(data as any);

      case 'contract-signed-confirmation':
        return contractSignedConfirmationTemplate(data as any);

      case 'booking-confirmation':
        return bookingConfirmationTemplate(data as any);

      case 'payment-received':
        return paymentReceivedTemplate(data as any);

      case 'trip-cancelled':
        return tripCancelledNotificationTemplate(data as any);

      default:
        throw new InternalServerErrorException(
          `Template '${template}' no implementado`,
        );
    }
  }

  /**
   * Reemplazar placeholders en strings
   */
  private replacePlaceholders(
    text: string,
    data: Record<string, any>,
  ): string {
    let result = text;

    Object.keys(data).forEach((key) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(placeholder, String(data[key] || ''));
    });

    return result;
  }

  /**
   * Log de auditoría de email enviado
   */
  private async logEmailSent(params: {
    tenantId: string;
    to: string[];
    cc?: string[];
    subject: string;
    template: EmailTemplate;
    resendId: string;
    triggeredBy?: {
      userId: string;
      email: string;
      fullName: string;
    };
  }): Promise<void> {
    // Por ahora solo log, en el futuro podrías guardar en DB
    this.logger.log(
      `📨 Email Log → Template: ${params.template}, To: ${params.to.join(', ')}, Subject: "${params.subject}", Resend: ${params.resendId}`,
    );

    if (params.triggeredBy) {
      this.logger.debug(
        `👤 Triggered by: ${params.triggeredBy.fullName} (${params.triggeredBy.email})`,
      );
    }

    // TODO: Guardar en tabla de auditoría si se requiere
    // await this.prisma.emailLog.create({ ... });
  }
}
