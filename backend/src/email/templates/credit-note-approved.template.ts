import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface CreditNoteApprovedData {
  clientName: string;
  contractNumber: string;
  creditNoteNumber: string;
  amount: string; // Formatted: "USD 500.00"
  reason: string;
  pdfUrl: string;
  tenantName: string;
  // Branding fields
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function creditNoteApprovedTemplate(data: CreditNoteApprovedData): string {
  const {
    clientName,
    contractNumber,
    creditNoteNumber,
    amount,
    reason,
    pdfUrl,
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
      Se ha aplicado una nota de crédito a tu contrato. Este ajuste se verá reflejado en tu saldo actual.
    </p>

    <!-- Info Card -->
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${contractNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Nota de Crédito:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${creditNoteNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Monto:</td>
          <td style="padding: 8px 0; color: #10b981; font-weight: 700; font-size: 18px; text-align: right;">${amount}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding: 12px 0 8px 0; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Motivo:</strong></p>
            <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 14px; line-height: 1.5;">${reason}</p>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      Este documento ha sido generado automáticamente. Guárdalo para tus registros.
    </p>
  `;

  const templateOptions: BaseTemplateOptions = {
    tenantName,
    tenantLogo: "", // Will be populated by EmailService
    title: `Nota de Crédito ${creditNoteNumber}`,
    subtitle: "Se ha aplicado un ajuste a tu contrato",
    badge: {
      text: "💳 Nota de Crédito Aprobada",
      color: "green",
    },
    content,
    cta: {
      text: "📄 Descargar Nota de Crédito PDF",
      url: pdfUrl,
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
