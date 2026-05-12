import { baseEmailTemplate, BaseTemplateOptions } from './base.template';

/**
 * Template: Email de bienvenida con credenciales
 */
export interface WelcomeUserData {
  userName: string;
  userEmail: string;
  temporaryPassword: string;
  roleLabel: string;
  loginUrl: string;
  tenantName: string;
  tenantLogo?: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function welcomeUserTemplate(data: WelcomeUserData): string {
  const baseOptions: BaseTemplateOptions = {
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: '🎉 Bienvenido a ' + data.tenantName,
    subtitle: 'Credenciales de Acceso',
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
    content: `
      <!-- Icon Badge -->
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; background-color: #10b981; color: #ffffff; width: 80px; height: 80px; border-radius: 50%; line-height: 80px; font-size: 40px;">
          🎉
        </div>
      </div>

      <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">
        ¡Bienvenido a ${data.tenantName}!
      </h2>
      
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Hola <strong>${data.userName}</strong>,
      </p>

      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Te damos la bienvenida al sistema de gestión de ${data.tenantName}. Tu cuenta ha sido creada exitosamente con el rol de <strong>${data.roleLabel}</strong>.
      </p>

      <!-- Credentials Card -->
      <table role="presentation" style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; margin: 30px 0; border: 2px solid #10b981; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.1);">
        <tr>
          <td style="padding: 30px;">
            <p style="margin: 0 0 20px 0; color: #065f46; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center;">
              🔑 Tus Credenciales de Acceso
            </p>

            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 16px; background-color: #ffffff; border-radius: 8px; margin-bottom: 12px;">
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    📧 Usuario
                  </p>
                  <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600; word-break: break-all;">
                    ${data.userEmail}
                  </p>
                </td>
              </tr>
            </table>

            <div style="height: 12px;"></div>

            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 16px; background-color: #ffffff; border-radius: 8px;">
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    🔐 Contraseña Temporal
                  </p>
                  <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; word-break: break-all;">
                    ${data.temporaryPassword}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Warning -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 8px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          <strong>⚠️ Importante:</strong> Por tu seguridad, te recomendamos cambiar esta contraseña temporal en tu primer inicio de sesión.
        </p>
      </div>

      <p style="margin: 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Haz clic en el botón de abajo para acceder al sistema:
      </p>
    `,
    cta: {
      text: '🚀 Iniciar Sesión',
      url: data.loginUrl,
    },
    footer: {
      contactEmail: data.contactEmail,
      contactWhatsApp: data.contactWhatsApp,
      websiteUrl: data.websiteUrl,
      businessAddress: undefined,
    },
  };

  return baseEmailTemplate(baseOptions);
}
