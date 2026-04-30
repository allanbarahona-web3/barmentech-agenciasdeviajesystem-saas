import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de base de datos...\n");

  // ========================================
  // 1. CREAR TENANTS (Empresas)
  // ========================================
  
  console.log("📦 Creando tenants...");
  
  // Tenant 1: Lucitour
  let lucitourTenant = await prisma.tenant.findFirst({
    where: { name: "Lucitour S.A." },
  });

  if (!lucitourTenant) {
    lucitourTenant = await prisma.tenant.create({
      data: {
        name: "Lucitour S.A.",
        // subdomain: "lucitour", // Para futuro uso con subdominios
      },
    });
    console.log("✅ Tenant creado: Lucitour S.A.");
  } else {
    console.log("⏭️  Tenant ya existe: Lucitour S.A.");
  }

  // Tenant 2: Viajes Alma Nova
  let almanovaTenant = await prisma.tenant.findFirst({
    where: { name: "Viajes Alma Nova" },
  });

  if (!almanovaTenant) {
    almanovaTenant = await prisma.tenant.create({
      data: {
        name: "Viajes Alma Nova",
        // subdomain: "almanova", // Para futuro uso
      },
    });
    console.log("✅ Tenant creado: Viajes Alma Nova");
  } else {
    console.log("⏭️  Tenant ya existe: Viajes Alma Nova");
  }

  console.log("");

  // ========================================
  // 2. CREAR USUARIO ADMIN
  // ========================================
  
  console.log("👤 Creando usuario admin...");
  
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@lucitour.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const fullName = process.env.SEED_ADMIN_NAME || "Administrador Sistema";

  // Verificar si ya existe
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`⏭️  Usuario admin ya existe: ${email}`);
    console.log("");
  } else {
    // Crear admin asociado a Lucitour
    const passwordHash = await hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        isActive: true,
        role: "ADMIN",
        tenantId: lucitourTenant.id,
      },
    });

    console.log(`✅ Usuario admin creado: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Tenant: Lucitour S.A.`);
    console.log("");
  }

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
  users.forEach((u) => console.log(`   - ${u.email} (${u.role}) → ${u.tenant.name}`));
  
  console.log("\n✅ Seed completado exitosamente!\n");
  console.log("🔑 Credenciales de acceso:");
  console.log("═══════════════════════════════════════");
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
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
