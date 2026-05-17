import { baseEmailTemplate } from './base.template';

export interface ContractSignedConfirmationData {
  recipientName: string;
  contractNumber: string;
  tenantName: string;
  
  // Branding
  tenantLogo?: string;
  primaryColor: string;
  secondaryColor: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  businessAddress?: string;
}

export function contractSignedConfirmationTemplate(data: ContractSignedConfirmationData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Hola ${data.recipientName || ''},
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      ¡Excelentes noticias! Tu contrato ha sido completado y firmado exitosamente por todas las partes involucradas.
    </p>

    <!-- Contract Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; margin: 25px 0; border: 2px solid #e5e7eb;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Número de Contrato
          </p>
          <p style="margin: 0; color: #1f2937; font-size: 20px; font-weight: 700; font-family: 'Courier New', monospace;">
            ${data.contractNumber}
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Adjunto a este correo encontrarás el <strong>documento firmado en formato PDF</strong>. Te recomendamos descargarlo y guardarlo para tus registros.
    </p>

    <!-- CTA Button (informative, not clickable) -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
      <tr>
        <td align="center">
          <div style="background-color: ${data.primaryColor}; color: #ffffff; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; display: inline-block;">
            📎 Documento adjunto al final de este correo
          </div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Si tienes alguna pregunta o requieres asistencia adicional, no dudes en contactarnos.
    </p>
  `;

  const footer = `
    <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px; font-weight: 600;">
      Atentamente,
    </p>
    <p style="margin: 0 0 20px 0; color: ${data.primaryColor}; font-size: 18px; font-weight: 700;">
      Equipo ${data.tenantName}
    </p>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
        Este es un correo automático, por favor no respondas a este mensaje.<br>
        Para soporte, contáctanos a través de nuestros canales oficiales.
      </p>
    </div>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: data.tenantName,
    subtitle: 'Gestión profesional de viajes',
    badge: {
      text: '✓ Contrato Completado',
      color: 'green',
    },
    content,
    extraContent: footer,
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
    footer: {
      contactEmail: data.contactEmail,
      contactWhatsApp: data.contactWhatsApp,
      websiteUrl: data.websiteUrl,
      businessAddress: data.businessAddress,
    },
  });
}
