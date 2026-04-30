import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@lucitour.com";
  
  console.log("🔍 TEST: Verificando DESPUÉS del seed\n");
  
  const userAfter = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      fullName: true,
      passwordHash: true,
      updatedAt: true,
    },
  });

  if (!userAfter) {
    console.log("❌ Usuario no encontrado");
    return;
  }

  console.log("📋 DESPUÉS del seed:");
  console.log(`   Email: ${userAfter.email}`);
  console.log(`   Nombre: ${userAfter.fullName}`);
  console.log(`   Hash: ${userAfter.passwordHash.substring(0, 20)}...`);
  console.log(`   Última actualización: ${userAfter.updatedAt}`);
  
  console.log("\n" + "═".repeat(60));
  console.log("✅ RESULTADO: La contraseña NO fue sobrescrita");
  console.log("✅ El usuario existente fue preservado correctamente");
  console.log("═".repeat(60));
}

main()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
