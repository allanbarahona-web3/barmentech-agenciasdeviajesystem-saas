import { baseEmailTemplate } from './base.template';

export interface ContractSigningLinkData {
  clientName: string;
  contractNumber: string;
  signingUrl: string;
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

export function contractSigningLinkTemplate(data: ContractSigningLinkData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Hola ${data.clientName},
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Tu contrato está listo para ser firmado. Solo necesitamos tu firma digital para completar el proceso.
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

    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Haz clic en el botón de abajo para abrir el documento, revisarlo y firmar con tu dedo directamente en la pantalla.
    </p>

    <!-- Important Warning Box -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5; font-weight: 600;">
        ⚠️ <strong>MUY IMPORTANTE:</strong> Tu firma debe ser idéntica a la que aparece en tu cédula de identidad o pasaporte. Firmas que no coincidan con tu documento de identificación no serán válidas.
      </p>
    </div>
  `;

  const cta = {
    text: '✍️ Firmar Contrato Ahora',
    url: data.signingUrl,
  };

  const extraContent = `
    <!-- Info Box -->
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
        ⚡ <strong>Proceso rápido:</strong> Solo toma 2 minutos. Lee el contrato, dibuja tu firma en pantalla y listo.
      </p>
    </div>

    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5; text-align: center;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${data.signingUrl}" style="color: ${data.primaryColor}; word-break: break-all;">${data.signingUrl}</a>
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
        ¿Tienes dudas o necesitas ayuda? Responde a este correo.<br>
        Estamos aquí para asistirte.
      </p>
    </div>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: data.tenantName,
    subtitle: 'Gestión profesional de viajes',
    badge: {
      text: '✍️ Firma Pendiente',
      color: 'blue',
    },
    content,
    cta,
    extraContent: `${extraContent}${footer}`,
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
