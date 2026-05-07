import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listTables() {
  await prisma.$executeRaw`SET LOCAL row_security = off`;
  
  const tables = await prisma.$queryRaw<Array<{tablename: string}>>`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;
  
  console.log('\n📋 Tablas en la base de datos:');
  console.log('═══════════════════════════════\n');
  tables.forEach(t => console.log(`  - ${t.tablename}`));
  
  // Verificar RLS
  const rlsStatus = await prisma.$queryRaw<Array<{tablename: string, rowsecurity: boolean}>>`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;
  
  console.log('\n🔒 Estado de RLS:');
  console.log('═══════════════════════════════\n');
  rlsStatus.forEach(t => console.log(`  - ${t.tablename}: ${t.rowsecurity ? '✅ ENABLED' : '❌ DISABLED'}`));
  
  await prisma.$disconnect();
}

listTables().catch(console.error);
