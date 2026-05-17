import { baseEmailTemplate } from './base.template';

export interface ContractPdfAttachmentData {
  clientName: string;
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

export function contractPdfAttachmentTemplate(data: ContractPdfAttachmentData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Hola ${data.clientName},
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Te enviamos tu contrato en formato PDF para que puedas revisarlo y firmarlo.
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
      Encontrarás el contrato adjunto a este correo. Por favor, <strong>revísalo cuidadosamente</strong> antes de proceder con la firma digital.
    </p>

    <!-- Important Warning Box -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5; font-weight: 600;">
        ⚠️ <strong>MUY IMPORTANTE:</strong> Tu firma debe ser idéntica a la que aparece en tu cédula de identidad o pasaporte. Firmas que no coincidan con la identificación no serán válidas.
      </p>
    </div>

    <!-- Info Box -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 25px 0;">
      <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.5;">
        💡 <strong>Importante:</strong> Revisa todos los detalles del contrato. Si tienes alguna duda o corrección, por favor responde a este correo antes de firmar.
      </p>
    </div>

    <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Estamos a tu disposición para cualquier consulta.
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
        Si tienes dudas, responde a este correo.<br>
        Nuestro equipo te atenderá a la brevedad.
      </p>
    </div>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: data.tenantName,
    subtitle: 'Gestión profesional de viajes',
    badge: {
      text: '📄 Documento Adjunto',
      color: 'yellow',
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
