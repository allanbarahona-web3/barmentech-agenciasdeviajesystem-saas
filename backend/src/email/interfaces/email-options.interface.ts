/**
 * Opciones para enviar un email a través del servicio centralizado
 */
export interface SendEmailOptions {
  /**
   * ID del tenant que envía el email
   * Se usa para resolver fromEmail, replyTo, logo y rate limits
   */
  tenantId: string;

  /**
   * Destinatario(s) del email
   */
  to: string | string[];

  /**
   * CC opcional
   */
  cc?: string | string[];

  /**
   * Asunto del email
   * Se pueden usar placeholders: {{tenantName}}, {{contractNumber}}, etc.
   */
  subject: string;

  /**
   * Nombre del template a usar
   * Ejemplos: 'exchange-rate-history', 'welcome-user', 'contract-sign', etc.
   */
  template: EmailTemplate;

  /**
   * Datos dinámicos para el template
   * Cada template define sus propios datos requeridos
   */
  templateData: Record<string, any>;

  /**
   * Archivos adjuntos opcionales
   */
  attachments?: EmailAttachment[];

  /** Stable trusted identity used for provider-level retry idempotency. */
  idempotencyKey?: string;

  /**
   * Usuario que dispara el envío (para auditoría)
   */
  triggeredBy?: {
    userId: string;
    email: string;
    fullName: string;
  };
}

/**
 * Resultado del envío de email
 */
export interface SendEmailResult {
  success: boolean;
  emailId?: string;  // ID de Resend
  error?: string;
}

/**
 * Adjunto de email
 */
export interface EmailAttachment {
  filename: string;
  content: string;  // Base64
  contentType?: string;
}

/**
 * Templates disponibles en el sistema
 */
export type EmailTemplate =
  | 'business-document-attachment'
  // Exchange Rate
  | 'exchange-rate-history'
  
  // Auth
  | 'welcome-user'
  | 'password-reset'
  | 'password-reset-by-admin'
  
  // Billing
  | 'credit-note-approved'
  | 'contract-account-statement'
  | 'receipt-approved'
  | 'invoice-initial'
  
  // Contracts
  | 'contract-pdf-attachment'
  | 'contract-signing-link'
  | 'minor-annex-signing-link'
  | 'liability-waiver-signing-link'
  | 'contract-signed-confirmation'
  
  // Internal Tourism
  | 'booking-confirmation'
  | 'payment-received'
  | 'trip-cancelled';

/**
 * Configuración de email del tenant
 */
export interface TenantEmailConfig {
  id: string;
  name: string;
  fromEmail?: string;
  replyToEmail?: string;
  emailVerified: boolean;
  logoUrl?: string;
  emailLogoUrl?: string;
  
  // Rate limiting
  emailQuotaDaily: number;
  emailQuotaMonthly: number;
  emailsSentToday: number;
  emailsSentMonth: number;
  lastEmailResetDate?: Date;
  
  // Contact info (para footers)
  contactPhone?: string;
  contactWhatsApp?: string;
  contactEmail?: string;
  businessAddress?: string;
  websiteUrl?: string;
  
  // Branding colors
  primaryColor?: string;
  secondaryColor?: string;
}
