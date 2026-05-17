import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface InvoiceInitialData {
  clientName: string;
  contractNumber: string;
  invoiceNumber: string;
  paymentReference: string;
  currency: string; // "USD", "EUR", etc.
  totalAmount: string; // Formatted: "USD 5000.00"
  invoicePdfUrl: string;
  tenantName: string;
  // Branding fields
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function invoiceInitialTemplate(data: InvoiceInitialData): string {
  const {
    clientName,
    contractNumber,
    invoiceNumber,
    paymentReference,
    currency,
    totalAmount,
    invoicePdfUrl,
    tenantName,
    contactEmail,
    contactWhatsApp,
    websiteUrl,
    primaryColor,
    secondaryColor,
  } = data;

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 20px;">
      Estimado(a) <strong>${clientName}</strong>,
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
      Tu contrato ha sido procesado exitosamente y se ha generado tu estado de cuenta inicial.
    </p>

    <!-- Contract Info -->
    <div style="background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #1e40af; font-size: 14px; font-weight: 600; border-bottom: 1px solid #bfdbfe;">Número de contrato:</td>
          <td style="padding: 10px 0; color: #1f2937; font-weight: 700; text-align: right; font-size: 16px; border-bottom: 1px solid #bfdbfe;">${contractNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #1e40af; font-size: 14px; font-weight: 600; border-bottom: 1px solid #bfdbfe;">Monto total del viaje:</td>
          <td style="padding: 10px 0; color: #059669; font-weight: 700; text-align: right; font-size: 18px; border-bottom: 1px solid #bfdbfe;">${totalAmount}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0 0 0; color: #dc2626; font-size: 15px; font-weight: 700;">CÓDIGO DE PAGO:</td>
          <td style="padding: 12px 0 0 0; color: #dc2626; font-weight: 900; text-align: right; font-size: 20px; font-family: monospace; letter-spacing: 1px;">${paymentReference}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Code Notice (destacado) -->
    <div style="background-color: #fef2f2; border: 3px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0; color: #991b1b; font-size: 16px; font-weight: 700; line-height: 1.5;">
        ⚠️ MUY IMPORTANTE - Léelo con atención:
      </p>
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
        Cuando hagas <strong>transferencias o depósitos</strong>, debes <strong>SIEMPRE incluir</strong> tu código de pago <strong style="font-size: 16px; font-family: monospace;">${paymentReference}</strong> en el concepto o referencia.
        <br><br>
        Esto nos permite identificar tus pagos de forma <strong>inmediata y automática</strong>, acelerando la aplicación de tus abonos.
      </p>
    </div>

    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      El estado de cuenta adjunto incluye el desglose completo de pagos y saldos. Descárgalo y guárdalo para tus registros.
    </p>
  `;

  const extraContent = `
    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 4px; margin-top: 24px;">
      <p style="margin: 0; color: #065f46; font-size: 13px; line-height: 1.5;">
        <strong>📧 Privacidad:</strong> Este correo se envió únicamente al titular del contrato. El estado de cuenta contiene información sensible que solo tú debes ver.
      </p>
    </div>
  `;

  const templateOptions: BaseTemplateOptions = {
    tenantName,
    tenantLogo: "", // Will be populated by EmailService
    title: "Estado de Cuenta Inicial",
    subtitle: `Contrato ${contractNumber} procesado exitosamente`,
    badge: {
      text: "📊 ESTADO DE CUENTA INICIAL",
      color: "blue",
    },
    content,
    cta: {
      text: "📄 Descargar Estado de Cuenta (PDF)",
      url: invoicePdfUrl,
    },
    extraContent,
    footer: {
      contactEmail,
      contactWhatsApp,
      websiteUrl,
      businessAddress: "", // Will be populated by EmailService
    },
    primaryColor: primaryColor || "#1e3a8a",
    secondaryColor: secondaryColor || "#2563eb",
  };

  return baseEmailTemplate(templateOptions);
}
