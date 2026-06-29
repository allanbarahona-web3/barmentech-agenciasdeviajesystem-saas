import { InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Tipo mínimo requerido para la resolución de URLs del tenant.
 * Solo requiere el subdomain para construir la URL correcta.
 */
export type TenantWithSubdomain = {
  subdomain: string | null;
} | null | undefined;

/**
 * Genera la URL base pública del frontend para un tenant específico.
 * 
 * Esta función centraliza la lógica de resolución de URLs para el frontend,
 * asegurando que todos los servicios generen URLs consistentes.
 * 
 * Estrategia de resolución (en orden de prioridad):
 * 1. PUBLIC_APP_BASE_URL - Override explícito (útil para desarrollo local)
 * 2. Subdomain del tenant + FRONTEND_BASE_DOMAIN (producción multi-tenant)
 *    - Detecta automáticamente prefijos de ambiente (dev, staging, etc.)
 * 3. ALLOWED_ORIGIN - Fallback a orígenes permitidos
 * 
 * @param configService - Servicio de configuración de NestJS
 * @param tenant - Información del tenant (solo requiere subdomain)
 * @returns URL base pública sin trailing slash
 * @throws InternalServerErrorException si no se puede resolver la URL
 * 
 * @example
 * // Con PUBLIC_APP_BASE_URL configurado (desarrollo)
 * getPublicAppBaseUrl(configService, tenant)
 * // => "http://localhost:3000"
 * 
 * @example
 * // Con tenant subdomain en producción
 * getPublicAppBaseUrl(configService, { subdomain: "almanova" })
 * // => "https://almanova.dev.viajes.system.barmentech.com"
 */
export function getPublicAppBaseUrl(
  configService: ConfigService,
  tenant?: TenantWithSubdomain
): string {
  // PRIMERO: Revisar override explícito (para testing local)
  const explicit = configService.get<string>("PUBLIC_APP_BASE_URL", "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  // SEGUNDO: Si hay tenant con subdomain, construir URL específica (producción)
  const baseDomain = configService.get<string>("FRONTEND_BASE_DOMAIN", "").trim();
  if (tenant?.subdomain && baseDomain) {
    // Obtener prefijo de ambiente (dev, staging, prod) desde FRONTEND_URL
    const frontendUrl = configService.get<string>("FRONTEND_URL", "").trim();
    const match = frontendUrl.match(/^https?:\/\/([^.]+)\./);
    const envPrefix = match ? match[1] : "";
    
    // Construir: almanova.dev.viajes.system.barmentech.com
    if (envPrefix && envPrefix !== tenant.subdomain) {
      return `https://${tenant.subdomain}.${envPrefix}.${baseDomain}`;
    }
    
    // Sin prefijo: almanova.viajes.system.barmentech.com
    return `https://${tenant.subdomain}.${baseDomain}`;
  }

  // TERCERO: Otros fallbacks

  const allowedOrigin = configService.get<string>("ALLOWED_ORIGIN", "").trim();
  const origins = allowedOrigin
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"));

  const preferredOrigin =
    origins.find((item) => item.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(item)) ||
    origins.find((item) => !/localhost|127\.0\.0\.1/i.test(item)) ||
    origins[0];

  if (preferredOrigin) {
    return preferredOrigin.replace(/\/+$/, "");
  }

  throw new InternalServerErrorException("No se pudo resolver PUBLIC_APP_BASE_URL para generar links de firma.");
}
