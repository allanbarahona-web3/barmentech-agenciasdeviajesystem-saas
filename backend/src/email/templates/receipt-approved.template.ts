import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface ReceiptApprovedData {
  clientName: string;
  contractNumber: string;
  receiptNumber: string;
  paymentReference: string;
  amount: string; // Formatted: "USD 500.00"
  previousBalance: string;
  newBalance: string;
  receiptPdfUrl: string;
  accountStatementUrl?: string; // Optional
  tenantName: string;
  // Branding fields
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function receiptApprovedTemplate(data: ReceiptApprovedData): string {
  const {
    clientName,
    contractNumber,
    receiptNumber,
    paymentReference,
    amount,
    previousBalance,
    newBalance,
    receiptPdfUrl,
    accountStatementUrl,
    tenantName,
    contactEmail,
    contactWhatsApp,
    websiteUrl,
    primaryColor,
    secondaryColor,
  } = data;

  // Parse newBalance para determinar color
  const balanceValue = parseFloat(newBalance.replace(/[^0-9.-]/g, ''));
  const balanceColor = balanceValue > 0 ? '#dc2626' : '#059669';

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 20px;">
      Hola <strong>${clientName}</strong>,
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
      ¡Excelentes noticias! Tu pago ha sido verificado y aprobado. El monto ha sido aplicado a tu contrato.
    </p>

    <!-- Payment Info Card -->
    <div style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Contrato:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${contractNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Código de pago:</td>
          <td style="padding: 8px 0; color: #dc2626; font-weight: 700; font-size: 16px; text-align: right; font-family: monospace;">${paymentReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Recibo:</td>
          <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${receiptNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Monto pagado:</td>
          <td style="padding: 8px 0; color: #10b981; font-weight: 700; font-size: 18px; text-align: right;">${amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Estado:</td>
          <td style="padding: 8px 0; color: #10b981; font-weight: 600; text-align: right;">✅ Verificado y Aprobado</td>
        </tr>
      </table>
    </div>

    <!-- Balance Summary Card -->
    <div style="background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #1e40af; font-size: 16px; font-weight: 600;">💰 Resumen de Saldo</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 10px 0; color: #1e293b; font-size: 14px;">Saldo Anterior:</td>
          <td style="padding: 10px 0; color: #1e293b; font-weight: 600; text-align: right; font-size: 15px;">${previousBalance}</td>
        </tr>
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 10px 0; color: #059669; font-size: 14px;">Pago Aplicado:</td>
          <td style="padding: 10px 0; color: #059669; font-weight: 700; text-align: right; font-size: 15px;">- ${amount}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0 0 0; color: #1e40af; font-size: 15px; font-weight: 700;">Saldo Pendiente:</td>
          <td style="padding: 12px 0 0 0; color: ${balanceColor}; font-weight: 700; text-align: right; font-size: 18px;">${newBalance}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Code Notice -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
        <strong>⚠️ Recuerda:</strong> Para futuros pagos, SIEMPRE incluye tu código <strong>${paymentReference}</strong> al hacer transferencias o depósitos.
      </p>
    </div>

    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
      Este recibo confirma que tu pago ha sido verificado contra nuestros registros bancarios. El estado de cuenta muestra el historial completo de movimientos.
    </p>
  `;

  const extraContent = accountStatementUrl ? `
    <div style="text-align: center; margin-top: 16px;">
      <a href="${accountStatementUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        📊 Ver Estado de Cuenta
      </a>
    </div>
  ` : '';

  const templateOptions: BaseTemplateOptions = {
    tenantName,
    tenantLogo: "", // Will be populated by EmailService
    title: `Recibo ${receiptNumber}`,
    subtitle: "Tu pago ha sido verificado y aplicado",
    badge: {
      text: "✅ Recibo Aprobado",
      color: "green",
    },
    content,
    cta: {
      text: "📄 Ver Recibo",
      url: receiptPdfUrl,
    },
    extraContent,
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
