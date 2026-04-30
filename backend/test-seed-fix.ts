import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@lucitour.com";
  
  console.log("🔍 TEST: Verificando que el seed NO sobrescriba contraseñas\n");
  
  // Get current password hash
  const userBefore = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      fullName: true,
      passwordHash: true,
      updatedAt: true,
    },
  });

  if (!userBefore) {
    console.log("❌ Usuario no encontrado");
    return;
  }

  console.log("📋 ANTES del seed:");
  console.log(`   Email: ${userBefore.email}`);
  console.log(`   Nombre: ${userBefore.fullName}`);
  console.log(`   Hash: ${userBefore.passwordHash.substring(0, 20)}...`);
  console.log(`   Última actualización: ${userBefore.updatedAt}`);
  
  return {
    email: userBefore.email,
    hashBefore: userBefore.passwordHash,
  };
}

main()
  .then((result) => {
    console.log("\n✅ Datos guardados para comparación");
    console.log("\n▶️  Ahora ejecuta: npm run prisma:seed");
    console.log("▶️  Después ejecuta: npx tsx test-seed-fix-verify.ts");
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
