import { baseEmailTemplate, BaseTemplateOptions } from "./base.template";

export interface PasswordResetByAdminData {
  userName: string;
  temporaryPassword: string;
  loginUrl: string;
  tenantName: string;
  // Branding fields
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export function passwordResetByAdminTemplate(data: PasswordResetByAdminData): string {
  const {
    userName,
    temporaryPassword,
    loginUrl,
    tenantName,
    contactEmail,
    contactWhatsApp,
    websiteUrl,
    primaryColor,
    secondaryColor,
  } = data;

  const content = `
    <div style="background: linear-gradient(135deg, #FFA500 0%, #FF6B35 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: white; font-size: 18px; font-weight: 600; margin: 0; text-align: center;">
        🔄 Tu contraseña ha sido restablecida
      </p>
    </div>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 20px;">
      Hola <strong>${userName}</strong>,
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
      Un administrador ha restablecido tu contraseña en <strong>${tenantName}</strong>. 
      A continuación encontrarás tu nueva contraseña temporal:
    </p>

    <!-- Contraseña Temporal Card -->
    <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #FFA500;">
      <p style="font-size: 14px; color: #6B7280; margin: 0 0 8px 0; font-weight: 600;">
        CONTRASEÑA TEMPORAL
      </p>
      <p style="font-family: 'Courier New', monospace; font-size: 24px; color: #1F2937; margin: 0; font-weight: 700; letter-spacing: 2px; background: white; padding: 12px; border-radius: 8px; text-align: center;">
        ${temporaryPassword}
      </p>
    </div>

    <!-- Info Box: Cambio Obligatorio -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 14px; color: #92400E; line-height: 1.5;">
        <strong>⚠️ Importante:</strong> Por seguridad, <strong>deberás cambiar esta contraseña</strong> la primera vez que inicies sesión. 
        El sistema te pedirá crear una nueva contraseña antes de acceder.
      </p>
    </div>

    <p style="font-size: 16px; line-height: 1.6; color: #374151; margin-bottom: 24px;">
      Si tu sesión estaba activa, fue cerrada automáticamente por seguridad.
    </p>
  `;

  const extraContent = `
    <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin-top: 24px;">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #6B7280; text-align: center;">
        <strong>💡 Tip de seguridad:</strong>
      </p>
      <p style="margin: 0; font-size: 13px; color: #6B7280; text-align: center; line-height: 1.5;">
        Usa una contraseña única con al menos 8 caracteres, incluyendo mayúsculas y caracteres especiales.
      </p>
    </div>
  `;

  const templateOptions: BaseTemplateOptions = {
    tenantName,
    tenantLogo: "", // Will be populated by EmailService
    title: "Contraseña Restablecida",
    subtitle: "Un administrador ha generado una nueva contraseña temporal para tu cuenta",
    badge: {
      text: "🔄 CONTRASEÑA RESTABLECIDA",
      color: "yellow",
    },
    content,
    cta: {
      text: "🚀 Iniciar Sesión Ahora",
      url: loginUrl,
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
