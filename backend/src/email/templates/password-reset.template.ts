import { baseEmailTemplate, BaseTemplateOptions } from './base.template';

/**
 * Template: Email de restablecimiento de contraseña
 */
export interface PasswordResetData {
  userName: string;
  resetLink: string;
  expirationMinutes: number;
  tenantName: string;
  tenantLogo?: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function passwordResetTemplate(data: PasswordResetData): string {
  const baseOptions: BaseTemplateOptions = {
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: '🔐 Restablece tu contraseña',
    subtitle: data.tenantName,
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
    content: `
      <!-- Icon Badge -->
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; background-color: #f59e0b; color: #ffffff; width: 80px; height: 80px; border-radius: 50%; line-height: 80px; font-size: 40px;">
          🔐
        </div>
      </div>

      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">
        Restablece tu contraseña
      </h2>
      
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Hola <strong>${data.userName}</strong>,
      </p>

      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>${data.tenantName}</strong>. Si fuiste tú, haz clic en el botón de abajo para crear una nueva contraseña.
      </p>

      <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Haz clic en el botón de abajo para restablecer tu contraseña:
      </p>
    `,
    cta: {
      text: '🔑 Restablecer Contraseña',
      url: data.resetLink,
    },
    footer: {
      contactEmail: data.contactEmail,
      contactWhatsApp: data.contactWhatsApp,
      websiteUrl: data.websiteUrl,
      businessAddress: undefined,
    },
    extraContent: `
      <!-- Alternative Link -->
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:
        </p>
        <p style="margin: 0; word-break: break-all;">
          <a href="${data.resetLink}" style="color: #3b82f6; font-size: 13px; text-decoration: none;">${data.resetLink}</a>
        </p>
      </div>

      <!-- Warning -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 8px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          <strong>⚠️ Importante:</strong> Este enlace expirará en <strong>${data.expirationMinutes} minutos</strong>. Si no solicitaste este cambio, ignora este correo y tu contraseña permanecerá igual.
        </p>
      </div>

      <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
        Por tu seguridad, nunca compartas este enlace con nadie.
      </p>
    `,
  };

  return baseEmailTemplate(baseOptions);
}
