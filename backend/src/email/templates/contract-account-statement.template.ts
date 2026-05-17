import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface ContractAccountStatementData {
  clientName: string;
  contractNumber: string;
  paymentReference: string;
  status: string; // "Emitida", "Parcial", "Pagada", etc.
  currency: string; // "USD", "EUR", etc.
  totalAmount: string; // Formatted: "USD 5000.00"
  verifiedAmount: string;
  pendingAmount: string;
  balanceAmount: string;
  documentUrl: string;
  tenantName: string;
  // Branding fields
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function contractAccountStatementTemplate(data: ContractAccountStatementData): string {
  const {
    clientName,
    contractNumber,
    paymentReference,
    status,
    currency,
    totalAmount,
    verifiedAmount,
    pendingAmount,
    balanceAmount,
    documentUrl,
    tenantName,
    contactEmail,
    contactWhatsApp,
    websiteUrl,
    primaryColor,
    secondaryColor,
  } = data;

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 20px;">
      Hola <strong>${clientName}</strong>,
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
      Aquí tienes el estado de cuenta actualizado de tu contrato con ${tenantName}.
    </p>

    <!-- Contract Info -->
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${contractNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Código de pago:</td>
          <td style="padding: 8px 0; color: #dc2626; font-weight: 700; font-size: 16px; text-align: right; font-family: monospace;">${paymentReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Estado:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${status}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Code Notice -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
        <strong>⚠️ IMPORTANTE:</strong> Al realizar transferencias o depósitos, SIEMPRE incluye tu código de pago <strong>${paymentReference}</strong> para identificar tu abono automáticamente.
      </p>
    </div>

    <!-- Amounts Summary (usa gradiente del primaryColor y secondaryColor) -->
    <div style="background: linear-gradient(135deg, ${primaryColor || '#667eea'} 0%, ${secondaryColor || '#764ba2'} 100%); border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">Total del contrato:</td>
          <td style="padding: 10px 0; color: #ffffff; font-weight: 700; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${totalAmount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">Total verificado:</td>
          <td style="padding: 10px 0; color: #10b981; font-weight: 600; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${verifiedAmount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">En revisión bancaria:</td>
          <td style="padding: 10px 0; color: #fbbf24; font-weight: 600; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${pendingAmount}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0 0 0; color: #ffffff; font-size: 16px; font-weight: 600;">Saldo por cobrar:</td>
          <td style="padding: 12px 0 0 0; color: #ffffff; font-weight: 700; font-size: 20px; text-align: right;">${balanceAmount}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      Este documento incluye el detalle completo de pagos, abonos y saldos. Si tienes alguna pregunta, no dudes en contactarnos.
    </p>
  `;

  const templateOptions: BaseTemplateOptions = {
    tenantName,
    tenantLogo: "", // Will be populated by EmailService
    title: "Estado de Cuenta",
    subtitle: `Contrato ${contractNumber}`,
    badge: {
      text: "📄 Estado de Cuenta",
      color: "blue",
    },
    content,
    cta: {
      text: "📄 Ver Estado de Cuenta Completo (PDF)",
      url: documentUrl,
    },
    footer: {
      contactEmail,
      contactWhatsApp,
      websiteUrl,
      businessAddress: "", // Will be populated by EmailService
    },
    primaryColor: primaryColor || "#3B82F6",
    secondaryColor: secondaryColor || "#8B5CF6",
  };

  return baseEmailTemplate(templateOptions);
}
