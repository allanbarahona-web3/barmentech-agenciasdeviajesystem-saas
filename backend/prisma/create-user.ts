import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.USER_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.USER_PASSWORD || "");
  const fullName = String(process.env.USER_NAME || "").trim();
  const isActive = String(process.env.USER_ACTIVE || "true").toLowerCase() !== "false";
  const roleInput = String(process.env.USER_ROLE || "AGENT").trim().toUpperCase();
  const tenantIdOrName = String(process.env.TENANT_ID || process.env.TENANT_NAME || "Viajes Alma Nova").trim();

  // Mapear string a enum UserRole
  const validRoles: Record<string, UserRole> = {
    'SUPER_ADMIN': UserRole.SUPER_ADMIN,
    'ADMIN': UserRole.ADMIN,
    'CONTADOR': UserRole.CONTADOR,
    'FACTURACION_COBROS': UserRole.FACTURACION_COBROS,
    'VENTAS': UserRole.VENTAS,
    'OPERACIONES': UserRole.OPERACIONES,
    'AGENT': UserRole.AGENT,
  };
  
  const role = validRoles[roleInput] || UserRole.AGENT;

  if (!email || !password || !fullName) {
    console.error("Faltan variables. Usa USER_EMAIL, USER_PASSWORD, USER_NAME y opcional USER_ACTIVE.");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("La contrasena debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  // Buscar tenant por ID o por nombre
  let tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { id: tenantIdOrName },
        { name: tenantIdOrName },
      ],
    },
  });

  if (!tenant) {
    console.error(`Tenant no encontrado: ${tenantIdOrName}`);
    console.error('Usa TENANT_ID o TENANT_NAME con un valor válido (ej: "Viajes Alma Nova" o "Lucitours")');
    process.exit(1);
  }

  console.log(`Usando tenant: ${tenant.name} (${tenant.id})`);

  const passwordHash = await hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      isActive,
      role,
    },
    create: {
      email,
      fullName,
      passwordHash,
      isActive,
      role,
      tenantId: tenant.id,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
    },
  });

  console.log("Usuario listo:", user);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
