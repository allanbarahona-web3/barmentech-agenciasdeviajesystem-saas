import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";

const normalizeDatabaseUrl = () => {
  const raw = String(process.env.DATABASE_URL || "");
  const trimmed = raw.trim();
  if (!trimmed) {
    return;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  // Some deployment UIs accidentally persist values like:
  // DATABASE_URL="postgresql://..."
  // We recover the first postgres URL to keep boot resilient.
  const recoveredMatch = unquoted.match(/postgres(?:ql)?:\/\/[^\s"']+/i);
  const normalized = recoveredMatch ? recoveredMatch[0].trim() : unquoted;

  process.env.DATABASE_URL = normalized;
};

const normalizeOrigin = (value: string) => String(value || "").trim().replace(/\/+$/, "");

const parseAllowedOrigins = (rawValue: string, publicAppBaseUrl: string) => {
  const value = String(rawValue || "").trim();
  const publicOrigin = normalizeOrigin(publicAppBaseUrl || "");

  if (!value || value === "*") {
    return {
      mode: "all" as const,
      list: new Set<string>(publicOrigin ? [publicOrigin] : []),
    };
  }

  const list = value
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  if (publicOrigin) {
    list.push(publicOrigin);
  }

  return {
    mode: "list" as const,
    list: new Set<string>(list),
  };
};

async function bootstrap() {
  normalizeDatabaseUrl();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  
  const allowedOrigins = parseAllowedOrigins(
    configService.get<string>("ALLOWED_ORIGIN", "*"),
    configService.get<string>("PUBLIC_APP_BASE_URL", ""),
  );

  const nodeEnv = configService.get<string>("NODE_ENV", "development");
  const frontendBaseDomain = configService.get<string>("FRONTEND_BASE_DOMAIN", ""); // ej: agenciasdeviaje.barmentech.com

  // Cache de tenants activos para validación CORS (actualizar cada 5 minutos)
  let cachedTenants: { subdomain: string | null; customDomain: string | null }[] = [];
  let lastTenantsRefresh = 0;
  const TENANTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  const refreshTenants = async () => {
    const now = Date.now();
    if (now - lastTenantsRefresh < TENANTS_CACHE_TTL) {
      return; // Cache aún válido
    }
    
    cachedTenants = await prisma.tenant.findMany({
      where: { 
        isActive: true,
        subdomain: { not: null }, // Solo tenants con subdomain válido
      },
      select: { subdomain: true, customDomain: true },
    });
    
    lastTenantsRefresh = now;
    console.log(`[CORS] Tenants cache actualizado: ${cachedTenants.length} tenants activos`);
  };

  // Cargar tenants al inicio
  await refreshTenants();

  // Accept larger JSON/form payloads for base64 PDF attachments.
  app.use(json({ limit: "20mb" }));
  app.use(urlencoded({ limit: "20mb", extended: true }));
  app.use(helmet());

  app.enableCors({
    origin: async (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Requests without Origin (curl/postman/server-to-server) are allowed.
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalized = normalizeOrigin(origin);
      
      // 1. En desarrollo: permitir subdominios de localhost automáticamente
      // Soporta: http://localhost:3000, http://almanova.localhost:3000, http://empresa.localhost:3000, etc.
      if (nodeEnv === "development" && normalized.match(/^https?:\/\/([^.]+\.)?localhost(:\d+)?$/)) {
        callback(null, true);
        return;
      }
      
      // 2. Verificar contra lista explícita de ALLOWED_ORIGIN
      if (allowedOrigins.mode === "all" || allowedOrigins.list.has(normalized)) {
        callback(null, true);
        return;
      }

      // 3. Validación dinámica contra tenants en DB (para subdominios y dominios personalizados)
      try {
        await refreshTenants(); // Actualizar cache si es necesario
        
        // Extraer host del origin (sin protocolo ni puerto)
        const originHost = normalized.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
        
        // Verificar dominios personalizados (customDomain)
        if (cachedTenants.some(t => t.customDomain && t.customDomain.toLowerCase() === originHost)) {
          callback(null, true);
          return;
        }
        
        // Verificar subdominios (ej: almanova.agenciasdeviaje.barmentech.com)
        if (frontendBaseDomain) {
          const subdomainPattern = new RegExp(`^([^.]+)\\.${frontendBaseDomain.replace(/\./g, '\\.')}$`);
          const match = originHost.match(subdomainPattern);
          
          if (match) {
            const subdomain = match[1];
            if (cachedTenants.some(t => t.subdomain && t.subdomain === subdomain)) {
              callback(null, true);
              return;
            }
          }
        }
      } catch (error) {
        console.error('[CORS] Error validando tenant:', error);
      }

      console.warn(`[CORS] Origin bloqueado: ${normalized}`);
      callback(new Error(`CORS origin not allowed: ${normalized}`), false);
    },
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(configService.get<string>("PORT", "3001"));
  await app.listen(port);
  console.log(`[bootstrap] Server listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error("[bootstrap] FATAL - server failed to start:", error);
  process.exit(1);
});
