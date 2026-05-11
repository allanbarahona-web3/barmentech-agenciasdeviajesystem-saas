/**
 * Template base HTML para todos los emails
 * Aplica branding dinámico del tenant
 */
export interface BaseTemplateOptions {
  tenantName: string;
  tenantLogo?: string;
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    color: 'green' | 'blue' | 'purple' | 'yellow';
  };
  content: string;
  cta?: {
    text: string;
    url?: string;
    info?: string;  // Para CTAs sin URL (ej: "Documento adjunto al final")
  };
  footer?: {
    contactEmail?: string;
    contactPhone?: string;
    businessAddress?: string;
  };
}

const badgeColors = {
  green: { bg: '#10b981', text: '#ffffff' },
  blue: { bg: '#3b82f6', text: '#ffffff' },
  purple: { bg: '#8b5cf6', text: '#ffffff' },
  yellow: { bg: '#f59e0b', text: '#ffffff' },
};

export function baseEmailTemplate(options: BaseTemplateOptions): string {
  const {
    tenantName,
    tenantLogo,
    title,
    subtitle,
    badge,
    content,
    cta,
    footer,
  } = options;

  const badgeColor = badge ? badgeColors[badge.color] : undefined;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${tenantName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header con branding dinámico -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              ${tenantLogo ? `<img src="${tenantLogo}" alt="${tenantName}" style="max-width: 180px; height: auto; margin-bottom: 16px;" />` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin: 8px 0 0 0; color: #e9d5ff; font-size: 14px; font-weight: 500;">${subtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Badge opcional -->
          ${badge && badgeColor ? `
          <tr>
            <td style="padding: 30px 30px 0 30px; text-align: center;">
              <div style="display: inline-block; background-color: ${badgeColor.bg}; color: ${badgeColor.text}; padding: 12px 24px; border-radius: 50px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${badge.text}
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Contenido principal -->
          <tr>
            <td style="padding: 30px;">
              ${content}
            </td>
          </tr>

          <!-- CTA opcional -->
          ${cta ? `
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    ${cta.url ? `
                      <a href="${cta.url}" target="_blank" style="display: inline-block; background-color: #667eea; color: #ffffff; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none;">
                        ${cta.text}
                      </a>
                    ` : `
                      <div style="background-color: #667eea; color: #ffffff; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                        ${cta.text}
                      </div>
                    `}
                    ${cta.info ? `<p style="margin: 12px 0 0 0; color: #6b7280; font-size: 13px;">${cta.info}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; border-top: 2px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px; font-weight: 600;">
                Atentamente,
              </p>
              <p style="margin: 0 0 20px 0; color: #667eea; font-size: 18px; font-weight: 700;">
                Equipo ${tenantName}
              </p>
              
              ${footer && (footer.contactEmail || footer.contactPhone || footer.businessAddress) ? `
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                ${footer.contactEmail ? `<p style="margin: 4px 0; color: #6b7280; font-size: 13px;">📧 ${footer.contactEmail}</p>` : ''}
                ${footer.contactPhone ? `<p style="margin: 4px 0; color: #6b7280; font-size: 13px;">📞 ${footer.contactPhone}</p>` : ''}
                ${footer.businessAddress ? `<p style="margin: 4px 0; color: #6b7280; font-size: 13px;">📍 ${footer.businessAddress}</p>` : ''}
              </div>
              ` : ''}
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
                  Este es un correo automático, por favor no respondas a este mensaje.<br>
                  Para soporte, contáctanos a través de nuestros canales oficiales.
                </p>
              </div>
            </td>
          </tr>

        </table>
        
        <!-- Copyright -->
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
          © ${new Date().getFullYear()} ${tenantName}. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
