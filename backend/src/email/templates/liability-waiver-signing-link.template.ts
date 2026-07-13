import { baseEmailTemplate } from './base.template';

export interface LiabilityWaiverSigningLinkData {
  signerName: string;
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

export function liabilityWaiverSigningLinkTemplate(data: LiabilityWaiverSigningLinkData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Hola ${data.signerName},
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Se requiere tu firma para el documento de Exoneración de Responsabilidad del tour contratado.
    </p>

    <!-- Waiver Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef3c7; border-radius: 8px; margin: 25px 0; border: 2px solid #fbbf24;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0 0 8px 0; color: #92400e; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            ⚠️ Documento Legal Requerido
          </p>
          <p style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px; font-weight: 700;">
            Exoneración de Responsabilidad
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Contrato: <strong>${data.contractNumber}</strong>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 25px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Este documento certifica que has sido informado de los posibles riesgos asociados al tour y que participas de manera voluntaria. Por favor, lee detenidamente el contenido antes de firmar.
    </p>

    <!-- Important Warning Box -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px; line-height: 1.5; font-weight: 600;">
        ⚠️ <strong>IMPORTANTE:</strong>
      </p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #991b1b; font-size: 14px; line-height: 1.6;">
        <li>Este documento exonera a ${data.tenantName} de responsabilidad civil, penal y administrativa relacionada con el tour</li>
        <li>Al firmar, confirmas que participas voluntariamente y bajo tu propio riesgo</li>
        <li>Tu firma debe ser idéntica a la de tu documento de identidad</li>
      </ul>
    </div>
  `;

  const cta = {
    text: '✍️ Firmar Exoneración Ahora',
    url: data.signingUrl,
  };

  const extraContent = `
    <!-- Info Box -->
    <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px; line-height: 1.5;">
        📋 <strong>Sobre este documento:</strong>
      </p>
      <p style="margin: 8px 0 0 0; color: #1e3a8a; font-size: 14px; line-height: 1.6;">
        La Exoneración de Responsabilidad es un documento legal estándar que forma parte del contrato de viaje turístico. En él declaras que has sido informado de los riesgos del viaje y asumes la responsabilidad por tu participación.
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
        ¿Tienes dudas sobre el seguro de viaje? Responde a este correo.<br>
        Aún estás a tiempo de contratarlo antes de viajar.
      </p>
    </div>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: data.tenantName,
    subtitle: 'Gestión profesional de viajes',
    badge: {
      text: '⚠️ Exoneración Seguro',
      color: 'yellow',
    },
    content,
    cta,
    extraContent: `${extraContent}${footer}`,
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
  });
}
