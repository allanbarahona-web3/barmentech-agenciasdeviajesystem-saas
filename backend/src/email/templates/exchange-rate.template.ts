import { baseEmailTemplate, BaseTemplateOptions } from './base.template';

/**
 * Template: Historial de tipos de cambio
 */
export interface ExchangeRateHistoryData {
  userName: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  totalRecords: number;
  tenantName: string;
  tenantLogo?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function exchangeRateHistoryTemplate(data: ExchangeRateHistoryData): string {
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const baseOptions: BaseTemplateOptions = {
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: '📊 Historial de Tipos de Cambio',
    subtitle: data.tenantName,
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
    content: `
      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
        Hola ${data.userName},
      </h2>
      
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Adjunto encontrarás el historial de tipos de cambio solicitado.
      </p>

      <!-- Info Card -->
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; margin: 25px 0; border: 2px solid #e5e7eb;">
        <tr>
          <td style="padding: 20px;">
            <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              📅 Período
            </p>
            <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
              ${formatDateDisplay(data.startDate)} - ${formatDateDisplay(data.endDate)}
            </p>

            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              📋 Total de registros
            </p>
            <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: 600;">
              ${data.totalRecords}
            </p>
          </td>
        </tr>
      </table>

      <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
        <strong>📎 Archivo adjunto:</strong> historial-tipo-cambio.pdf
      </p>
      
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
        El PDF adjunto contiene el detalle completo de todos los tipos de cambio configurados en el período seleccionado.
      </p>
    `,
    cta: {
      text: '📎 Documento adjunto al final de este correo',
      info: 'El archivo PDF se encuentra adjunto a este email',
    },
    footer: {
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      websiteUrl: data.websiteUrl,
    },
  };

  return baseEmailTemplate(baseOptions);
}
