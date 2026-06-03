import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

// 🔒 Seed DEBE conectarse como doadmin (tiene BYPASSRLS) para crear datos iniciales
// La aplicación usa app_user_dev (sin BYPASSRLS) para respetar RLS en queries normales
const DOADMIN_URL = process.env.DOADMIN_DATABASE_URL;

if (!DOADMIN_URL) {
  throw new Error("DOADMIN_DATABASE_URL no está configurado en .env");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DOADMIN_URL
    }
  }
});

async function main() {
  console.log("🌱 Iniciando seed de base de datos...\n");
  console.log("🔑 Conectando como doadmin (con BYPASSRLS)...\n");

  // 🔓 BYPASS RLS para crear tenants (operación de sistema)
  console.log("🔓 Bypassando RLS para operaciones de seed...");
  await prisma.$executeRawUnsafe(`SET LOCAL row_security = off`);

    // ========================================
    // 1. CREAR TENANTS (Empresas)
    // ========================================
    
  console.log("📦 Creando tenants...");
  
  // Tenant 1: Viajes Alma Nova (PRINCIPAL)
  const almanovaTenant = await prisma.tenant.upsert({
    where: { name: "Viajes Alma Nova" },
    create: {
      name: "Viajes Alma Nova",
      subdomain: "almanova",
      customDomain: "system.viajesalmanova.com",
      contractPrefix: "ALM",
      isActive: true,
      // Assets de Alma Nova en DigitalOcean Spaces
      logoUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/logos/Almanova%20azul%2Bdorado.png",
      signatureUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/firmas/Firma%20Karen.png",
      emailLogoUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/logos/Almanova%20azul%2Bdorado.png",
      primaryColor: "#1E40AF",   // Azul Alma Nova
      secondaryColor: "#D97706",  // Dorado Alma Nova
      // Información legal de la empresa
      legalName: "VIAJES ALMA NOVA",
      legalId: "3-101-960028",
      representativeName: "KAREN KEITLYN CAMPOS CANTILLO",
      representativeId: "3-0522-0023",
      representativeTitle: "administradora de agencia de viajes",
      representativeMaritalStatus: "soltera",
      representativeAddress: "Cartago",
      representativePowers: "apoderado generalísimo sin límite de suma",
    },
    update: {
      customDomain: "system.viajesalmanova.com",
      logoUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/logos/Almanova%20azul%2Bdorado.png",
      signatureUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/firmas/Firma%20Karen.png",
      emailLogoUrl: "https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/logos/Almanova%20azul%2Bdorado.png",
      primaryColor: "#1E40AF",
      secondaryColor: "#D97706",
      legalName: "VIAJES ALMA NOVA",
      legalId: "3-101-960028",
      representativeName: "KAREN KEITLYN CAMPOS CANTILLO",
      representativeId: "3-0522-0023",
      representativeTitle: "administradora de agencia de viajes",
      representativeMaritalStatus: "soltera",
      representativeAddress: "Cartago",
      representativePowers: "apoderado generalísimo sin límite de suma",
    },
  });
  console.log("✅ Tenant listo: Viajes Alma Nova (ALM)");

  // Tenant 2: Lucitours (FUTURO)
  const lucitourTenant = await prisma.tenant.upsert({
    where: { name: "Lucitours" },
    create: {
      name: "Lucitours",
      subdomain: "lucitours",
      customDomain: "system.lucitour.com",
      contractPrefix: "LUC",
      isActive: true,
      // Assets de Lucitours (por configurar cuando estén listos)
      logoUrl: null,
      signatureUrl: null,
      emailLogoUrl: null,
      primaryColor: null,
      secondaryColor: null,
    },
    update: {
      customDomain: "system.lucitour.com",
    },
  });
  console.log("✅ Tenant listo: Lucitours (LUC)");

  console.log("");

  // ========================================
  // 2. CREAR USUARIOS ADMIN (UNO POR TENANT)
  // ========================================
  
  console.log("👤 Creando usuarios admin...");
  
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const passwordHash = await hash(password, 10);

  // Admin para Alma Nova
  await prisma.user.upsert({
    where: { email: "admin@viajesalmanova.com" },
    create: {
      email: "admin@viajesalmanova.com",
      fullName: "Administrador Alma Nova",
      passwordHash,
      isActive: true,
      role: UserRole.ADMIN,
      tenantId: almanovaTenant.id,
    },
    update: {},
  });
  console.log(`✅ Admin listo: admin@viajesalmanova.com → Viajes Alma Nova`);

  // Admin para Lucitours
  await prisma.user.upsert({
    where: { email: "admin@lucitour.com" },
    create: {
      email: "admin@lucitour.com",
      fullName: "Administrador Lucitours",
      passwordHash,
      isActive: true,
      role: UserRole.ADMIN,
      tenantId: lucitourTenant.id,
    },
    update: {},
  });
  console.log(`✅ Admin listo: admin@lucitour.com → Lucitours`);

  // ========================================
  // SUPER ADMIN (sin tenant - tenantId = NULL)
  // ========================================
  console.log("\n🔐 Creando Super Admin...");
  
  await prisma.user.upsert({
    where: { email: "superadmin@platform.com" },
    create: {
      email: "superadmin@platform.com",
      fullName: "Super Administrador",
      passwordHash,
      isActive: true,
      role: UserRole.SUPER_ADMIN,
      tenantId: null, // Super admin NO pertenece a ningún tenant
    },
    update: {},
  });
  console.log(`✅ Super Admin listo: superadmin@platform.com (NO TENANT)`);

  console.log("");

  // ========================================
  // 3. RESUMEN
  // ========================================
  
  console.log("📊 Resumen del seed:");
  console.log("═══════════════════════════════════════");
  
  const tenants = await prisma.tenant.findMany();
  const users = await prisma.user.findMany({ include: { tenant: true } });
  
  console.log(`\n🏢 Tenants creados: ${tenants.length}`);
  tenants.forEach((t) => console.log(`   - ${t.name}`));
  
  console.log(`\n👥 Usuarios creados: ${users.length}`);
  users.forEach((u) => console.log(`   - ${u.email} (${u.role}) → ${u.tenant ? u.tenant.name : 'NO TENANT (Super Admin)'}`));
  
  console.log("\n✅ Seed completado exitosamente!\n");
  console.log("🔑 Credenciales de acceso:");
  console.log("═══════════════════════════════════════");
  console.log(`   Super Admin:  superadmin@platform.com / ${password}`);
  console.log(`   Alma Nova:    admin@viajesalmanova.com / ${password}`);
  console.log(`   Lucitours:    admin@lucitour.com / ${password}`);
  console.log("═══════════════════════════════════════\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
