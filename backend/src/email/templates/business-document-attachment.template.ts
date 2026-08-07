import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface BusinessDocumentAttachmentData {
  recipientName: string;
  documentLabel: string;
  documentNumber: string;
  message: string;
  tenantName: string;
  tenantLogo?: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  businessAddress?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function businessDocumentAttachmentTemplate(
  data: BusinessDocumentAttachmentData,
): string {
  const recipientName = escapeHtml(data.recipientName);
  const documentLabel = escapeHtml(data.documentLabel);
  const documentNumber = escapeHtml(data.documentNumber);
  const message = escapeHtml(data.message);

  const options: BaseTemplateOptions = {
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: documentLabel,
    subtitle: `Documento ${documentNumber}`,
    content: `
      <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">
        Estimado(a) <strong>${recipientName}</strong>,
      </p>
      <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">
        ${message}
      </p>
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
        <strong>${documentLabel}:</strong> ${documentNumber}<br>
        El documento PDF se encuentra adjunto a este correo.
      </div>
    `,
    footer: {
      contactEmail: data.contactEmail,
      contactWhatsApp: data.contactWhatsApp,
      businessAddress: data.businessAddress,
      websiteUrl: data.websiteUrl,
    },
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
  };
  return baseEmailTemplate(options);
}
