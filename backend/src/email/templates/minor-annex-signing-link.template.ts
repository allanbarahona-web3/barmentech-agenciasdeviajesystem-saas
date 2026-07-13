import { baseEmailTemplate } from './base.template';

export interface MinorAnnexSigningLinkData {
  signerName: string;
  minorName: string;
  contractNumber: string;
  signingUrl: string;
  tenantName: string;
  signerRole: string; // 'TUTOR' or 'ACOMPANANTE_RESPONSABLE'
  
  // Branding
  tenantLogo?: string;
  primaryColor: string;
  secondaryColor: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  businessAddress?: string;
}

export function minorAnnexSigningLinkTemplate(data: MinorAnnexSigningLinkData): string {
  const roleLabel = data.signerRole === 'TUTOR' ? 'tutor/a legal' : 'acompañante responsable';
  
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Hola ${data.signerName},
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Se requiere tu firma como <strong>${roleLabel}</strong> para autorizar el viaje del menor.
    </p>

    <!-- Minor Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; margin: 25px 0; border: 2px solid #86efac;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0 0 8px 0; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Anexo de Autorización para Menor
          </p>
          <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px; font-weight: 700;">
            ${data.minorName}
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Contrato: <strong>${data.contractNumber}</strong>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Este anexo es independiente del contrato principal y requiere tu autorización específica. Haz clic en el botón para revisar el documento y firmar digitalmente.
    </p>

    <!-- Important Warning Box -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5; font-weight: 600;">
        ⚠️ <strong>MUY IMPORTANTE:</strong> Tu firma debe ser idéntica a la que aparece en tu cédula de identidad o pasaporte. Firmas que no coincidan con tu documento de identificación no serán válidas.
      </p>
    </div>
  `;

  const cta = {
    text: '✍️ Firmar Anexo de Menor Ahora',
    url: data.signingUrl,
  };

  const extraContent = `
    <!-- Info Box -->
    <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px; line-height: 1.5;">
        📋 <strong>Sobre este documento:</strong>
      </p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #1e3a8a; font-size: 14px; line-height: 1.6;">
        <li>Autorización específica para el viaje del menor</li>
        <li>Documento independiente del contrato principal</li>
        <li>Firma requerida como ${roleLabel}</li>
      </ul>
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
      text: '👶 Autorización Menor',
      color: 'purple',
    },
    content,
    cta,
    extraContent: `${extraContent}${footer}`,
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
  });
}
