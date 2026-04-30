import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@viajesalmanova.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "Cambiar123!";
  const fullName = process.env.SEED_ADMIN_NAME || "Administrador Viajes Alma Nova";

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`✅ Usuario admin ya existe: ${email} (contraseña preservada)`);
    return;
  }

  // Create new admin user
  const passwordHash = await hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      isActive: true,
      role: "ADMIN",
    },
  });

  console.log(`✅ Usuario admin creado: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
