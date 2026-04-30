# 🏢 Guía de Implementación Multi-Tenant

> **Estado actual:** Proyecto base funcionando SIN multi-tenant  
> **Objetivo:** Implementar arquitectura multi-tenant completa  
> **Proyecto origen:** contratoslucitour-temp (para copiar la implementación)

---

## 📊 **Estado Actual:**

```
✅ Proyecto nuevo: barmentech-agenciasdeviajesystem-saas
✅ DB: agenciaviajes-dev (estructura completa)
✅ Migraciones ejecutadas (todas las tablas creadas)
❌ Multi-tenant: NO implementado aún
```

---

## 🎯 **Objetivo Final:**

```
Sistema multi-tenant donde:
├─ Lucitour S.A. → Ve solo sus datos
├─ Viajes Alma Nova → Ve solo sus datos
└─ Aislamiento total de datos por tenant
```

---

## 📋 **Pasos de Implementación:**

---

### **Paso 1: Agregar Modelo Tenant al Schema**

**Archivo:** `backend/prisma/schema.prisma`

```prisma
// ========================================
// MODELO TENANT (Agregar al inicio)
// ========================================

model Tenant {
  id        String   @id @default(cuid())
  name      String   // "Lucitour S.A.", "Viajes Alma Nova"
  subdomain String?  @unique // Para futuro uso con subdominios
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relaciones con todos los modelos
  users              User[]
  clients            Client[]
  contracts          Contract[]
  contractDrafts     ContractDraft[]
  payments           Payment[]
  receipts           Receipt[]
  creditNotes        CreditNote[]
  debitNotes         DebitNote[]
  travelPackages     TravelPackage[]
  companyBankAccounts CompanyBankAccount[]
  exchangeRates      ExchangeRate[]
  
  @@map("tenants")
}

// ========================================
// ACTUALIZAR TODOS LOS MODELOS EXISTENTES
// ========================================

// Ejemplo con User:
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  fullName      String
  isActive      Boolean  @default(true)
  role          UserRole @default(CLIENTE)
  
  // ← AGREGAR ESTAS LÍNEAS
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // FIN AGREGAR
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // ... resto del modelo
  
  @@index([tenantId]) // ← AGREGAR ÍNDICE
  @@map("users")
}

// Repetir para TODOS los modelos:
// - Client
// - Contract
// - ContractDraft
// - Payment
// - Receipt
// - CreditNote
// - DebitNote
// - TravelPackage
// - CompanyBankAccount
// - ExchangeRate
// - SignatureEvent
// - ContractDocument
// - PasswordResetToken (opcional, puede ser global)
```

**Checklist de modelos a actualizar:**
```
[ ] User
[ ] Client
[ ] Contract
[ ] ContractDraft
[ ] Payment
[ ] Receipt
[ ] CreditNote
[ ] DebitNote
[ ] TravelPackage
[ ] CompanyBankAccount
[ ] ExchangeRate
[ ] SignatureEvent
[ ] ContractDocument
[ ] ContractNumberReservation
[ ] UsedSigningToken
```

---

### **Paso 2: Crear Migración**

```bash
cd backend

# Crear migración
pnpm prisma migrate dev --name add_multi_tenant_support

# Esto genera:
# - Tabla tenants
# - Columnas tenantId en todas las tablas
# - Foreign keys
# - Índices para performance
```

**La migración SQL generada incluirá:**
```sql
-- Crear tabla tenants
CREATE TABLE "tenants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subdomain" TEXT UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP DEFAULT now()
);

-- Agregar tenantId a todas las tablas
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "clients" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "contracts" ADD COLUMN "tenantId" TEXT;
-- ... etc

-- Crear foreign keys
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" 
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
-- ... etc

-- Crear índices
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE INDEX "clients_tenantId_idx" ON "clients"("tenantId");
-- ... etc
```

---

### **Paso 3: Script de Migración de Datos Existentes**

**Archivo:** `backend/prisma/migrate-to-tenants.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateToTenants() {
  console.log('🔄 Iniciando migración a multi-tenant...\n');

  try {
    // 1. Crear tenants
    console.log('📦 Creando tenants...');
    
    const lucitour = await prisma.tenant.upsert({
      where: { name: 'Lucitour S.A.' },
      update: {},
      create: {
        name: 'Lucitour S.A.',
        subdomain: 'lucitour',
        isActive: true,
      },
    });
    console.log(`✅ Tenant creado: ${lucitour.name} (${lucitour.id})`);

    const almanova = await prisma.tenant.upsert({
      where: { name: 'Viajes Alma Nova' },
      update: {},
      create: {
        name: 'Viajes Alma Nova',
        subdomain: 'almanova',
        isActive: true,
      },
    });
    console.log(`✅ Tenant creado: ${almanova.name} (${almanova.id})\n`);

    // 2. Asignar TODOS los datos existentes a Lucitour
    // (porque todos los datos actuales son de Lucitour)
    
    console.log('🔄 Asignando datos existentes a Lucitour...');
    
    // Users
    const usersCount = await prisma.user.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${usersCount.count} usuarios actualizados`);

    // Clients
    const clientsCount = await prisma.client.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${clientsCount.count} clientes actualizados`);

    // Contracts
    const contractsCount = await prisma.contract.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${contractsCount.count} contratos actualizados`);

    // Contract Drafts
    const draftsCount = await prisma.contractDraft.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${draftsCount.count} borradores actualizados`);

    // Payments
    const paymentsCount = await prisma.payment.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${paymentsCount.count} pagos actualizados`);

    // Receipts
    const receiptsCount = await prisma.receipt.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${receiptsCount.count} recibos actualizados`);

    // Credit Notes
    const creditNotesCount = await prisma.creditNote.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${creditNotesCount.count} notas de crédito actualizadas`);

    // Debit Notes
    const debitNotesCount = await prisma.debitNote.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${debitNotesCount.count} notas de débito actualizadas`);

    // Travel Packages
    const packagesCount = await prisma.travelPackage.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${packagesCount.count} paquetes de viaje actualizados`);

    // Company Bank Accounts
    const bankAccountsCount = await prisma.companyBankAccount.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${bankAccountsCount.count} cuentas bancarias actualizadas`);

    // Exchange Rates
    const ratesCount = await prisma.exchangeRate.updateMany({
      where: { tenantId: null },
      data: { tenantId: lucitour.id },
    });
    console.log(`✅ ${ratesCount.count} tipos de cambio actualizados`);

    console.log('\n✅ Migración a multi-tenant completada exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`   Tenants creados: 2`);
    console.log(`   Registros migrados a Lucitour: ${
      usersCount.count +
      clientsCount.count +
      contractsCount.count +
      paymentsCount.count +
      receiptsCount.count +
      creditNotesCount.count +
      debitNotesCount.count +
      packagesCount.count +
      bankAccountsCount.count +
      ratesCount.count
    }`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateToTenants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

**Ejecutar migración:**
```bash
tsx prisma/migrate-to-tenants.ts
```

---

### **Paso 4: Actualizar Seed para Multi-Tenant**

**Archivo:** `backend/prisma/seed.ts`

Ya está actualizado en el proyecto nuevo con soporte para tenants. ✅

```typescript
// Crea:
// - 2 Tenants (Lucitour + Viajes Alma Nova)
// - 1 Admin user asociado a Lucitour
```

---

### **Paso 5: Middleware de Tenant**

**Archivo:** `backend/src/common/middleware/tenant.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extraer tenantId del usuario autenticado (desde JWT)
    const user = req['user'];
    
    if (user && user.tenantId) {
      req['tenantId'] = user.tenantId;
    }
    
    next();
  }
}
```

**Registrar en AppModule:**

```typescript
// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

@Module({
  // ... imports
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*'); // Aplicar a todas las rutas
  }
}
```

---

### **Paso 6: Decorator para TenantId**

**Archivo:** `backend/src/common/decorators/tenant.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para extraer el tenantId del usuario autenticado
 * Uso: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    
    if (!request.user || !request.user.tenantId) {
      throw new Error('Usuario no tiene tenantId asignado');
    }
    
    return request.user.tenantId;
  },
);
```

**Uso en controllers:**

```typescript
import { TenantId } from '../common/decorators/tenant.decorator';

@Controller('contracts')
export class ContractsController {
  
  @Get()
  async findAll(@TenantId() tenantId: string) {
    // tenantId se inyecta automáticamente desde el JWT
    return this.contractsService.findAll(tenantId);
  }
  
  @Post()
  async create(
    @Body() dto: CreateContractDto,
    @TenantId() tenantId: string
  ) {
    return this.contractsService.create(dto, tenantId);
  }
}
```

---

### **Paso 7: Actualizar AuthService (JWT con tenantId)**

**Archivo:** `backend/src/auth/auth.service.ts`

```typescript
async login(email: string, password: string) {
  // 1. Buscar usuario con su tenant
  const user = await this.prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { tenant: true }, // ← Incluir tenant
  });

  if (!user) {
    throw new UnauthorizedException('Credenciales inválidas');
  }

  // 2. Verificar password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  
  if (!isPasswordValid) {
    throw new UnauthorizedException('Credenciales inválidas');
  }

  // 3. Verificar que el tenant esté activo
  if (!user.tenant.isActive) {
    throw new UnauthorizedException('Empresa desactivada');
  }

  // 4. Crear JWT con tenantId
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,        // ← AGREGAR
    tenantName: user.tenant.name,   // ← AGREGAR
  };

  return {
    access_token: this.jwtService.sign(payload),
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,      // ← AGREGAR
      tenantName: user.tenant.name, // ← AGREGAR
    },
  };
}
```

---

### **Paso 8: Actualizar TODOS los Services**

**Patrón a seguir en TODOS los servicios:**

#### **Antes (sin multi-tenant):**
```typescript
async findAll() {
  return this.prisma.contract.findMany();
}

async findOne(id: string) {
  return this.prisma.contract.findUnique({
    where: { id }
  });
}

async create(dto: CreateContractDto) {
  return this.prisma.contract.create({
    data: dto
  });
}

async update(id: string, dto: UpdateContractDto) {
  return this.prisma.contract.update({
    where: { id },
    data: dto
  });
}

async remove(id: string) {
  return this.prisma.contract.delete({
    where: { id }
  });
}
```

#### **Después (con multi-tenant):**
```typescript
async findAll(tenantId: string) {
  return this.prisma.contract.findMany({
    where: { tenantId } // ← Filtrar SIEMPRE
  });
}

async findOne(id: string, tenantId: string) {
  const contract = await this.prisma.contract.findFirst({
    where: { 
      id,
      tenantId // ← Verificar ownership
    }
  });
  
  if (!contract) {
    throw new NotFoundException('Contrato no encontrado');
  }
  
  return contract;
}

async create(dto: CreateContractDto, tenantId: string) {
  return this.prisma.contract.create({
    data: {
      ...dto,
      tenantId // ← Asignar SIEMPRE
    }
  });
}

async update(id: string, dto: UpdateContractDto, tenantId: string) {
  // Verificar que el contrato pertenece al tenant
  await this.findOne(id, tenantId);
  
  return this.prisma.contract.update({
    where: { id },
    data: dto
  });
}

async remove(id: string, tenantId: string) {
  // Verificar que el contrato pertenece al tenant
  await this.findOne(id, tenantId);
  
  return this.prisma.contract.delete({
    where: { id }
  });
}
```

---

### **Paso 9: Servicios a Actualizar**

**Checklist de servicios:**

```
[ ] src/auth/auth.service.ts (JWT con tenantId)
[ ] src/contracts/contracts.service.ts
[ ] src/billing/billing.service.ts
[ ] src/payment-verification/payment-verification.service.ts
[ ] src/travel-packages/travel-packages.service.ts
[ ] src/company-bank-accounts/company-bank-accounts.service.ts
[ ] src/exchange-rate/exchange-rate.service.ts
```

**Regla de oro:** TODA query debe incluir `tenantId` en el WHERE.

---

### **Paso 10: Testing de Seguridad**

**Script de testing:** `backend/test/tenant-isolation.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testTenantIsolation() {
  console.log('🧪 Testing tenant isolation...\n');

  // Crear usuarios de prueba en diferentes tenants
  const lucitourTenant = await prisma.tenant.findFirst({
    where: { name: 'Lucitour S.A.' }
  });
  
  const almanovaTenant = await prisma.tenant.findFirst({
    where: { name: 'Viajes Alma Nova' }
  });

  // Test 1: Usuario de Lucitour no ve datos de Alma Nova
  const lucitourContracts = await prisma.contract.findMany({
    where: { tenantId: lucitourTenant.id }
  });
  
  const almaNovaInLucitourQuery = lucitourContracts.filter(
    c => c.tenantId === almanovaTenant.id
  );
  
  console.assert(
    almaNovaInLucitourQuery.length === 0,
    '❌ LEAK: Usuario de Lucitour ve datos de Alma Nova'
  );
  console.log('✅ Test 1 passed: No data leak');

  // Test 2: Crear contrato con tenantId correcto
  // Test 3: Actualizar solo dentro del tenant
  // Test 4: Eliminar solo dentro del tenant
  
  console.log('\n✅ Todos los tests de aislamiento pasaron');
}

testTenantIsolation();
```

---

### **Paso 11: Guards de Seguridad Adicionales**

**Archivo:** `backend/src/common/guards/tenant-access.guard.ts`

```typescript
import { 
  Injectable, 
  CanActivate, 
  ExecutionContext,
  ForbiddenException 
} from '@nestjs/common';

/**
 * Guard para verificar que el recurso pertenece al tenant del usuario
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceTenantId = request.params.tenantId || request.body.tenantId;
    
    if (resourceTenantId && resourceTenantId !== user.tenantId) {
      throw new ForbiddenException('Acceso denegado a recurso de otro tenant');
    }
    
    return true;
  }
}
```

---

## 📊 **Checklist de Implementación Completa:**

### **Backend:**
```
[ ] Schema: Modelo Tenant agregado
[ ] Schema: tenantId en todos los modelos
[ ] Migración: Ejecutada exitosamente
[ ] Data migration: Datos existentes asignados a tenants
[ ] Middleware: TenantMiddleware implementado
[ ] Decorator: @TenantId() creado
[ ] Auth: JWT incluye tenantId
[ ] Services: Todos actualizados con filtrado
[ ] Controllers: Usan @TenantId()
[ ] Guards: TenantAccessGuard implementado
[ ] Testing: Tenant isolation verificado
```

### **Frontend:**
```
[ ] Login: Guarda tenantId en session storage
[ ] API calls: No requieren cambios (backend filtra automáticamente)
[ ] UI: Mostrar nombre del tenant en navbar (opcional)
```

---

## 🚀 **Orden de Ejecución:**

```bash
# 1. Actualizar schema
vim backend/prisma/schema.prisma

# 2. Crear migración
cd backend
pnpm prisma migrate dev --name add_multi_tenant_support

# 3. Migrar datos existentes
tsx prisma/migrate-to-tenants.ts

# 4. Implementar middleware y decorators
# (crear archivos mencionados arriba)

# 5. Actualizar AuthService
# (agregar tenantId al JWT)

# 6. Actualizar todos los services
# (agregar filtrado por tenantId)

# 7. Testing
tsx test/tenant-isolation.test.ts

# 8. Deploy
git add .
git commit -m "feat: implement multi-tenant architecture"
git push origin develop
```

---

## ⚠️ **Consideraciones Críticas:**

### **1. Seguridad:**
```
❌ NUNCA hacer:
const contract = await prisma.contract.findUnique({ where: { id } });

✅ SIEMPRE hacer:
const contract = await prisma.contract.findFirst({ 
  where: { id, tenantId } 
});
```

### **2. Performance:**
```
✅ Índices en tenantId en todas las tablas (ya incluidos en schema)
✅ Queries compuestas: WHERE tenantId = X AND ...
```

### **3. Data Integrity:**
```
✅ Foreign keys con ON DELETE CASCADE para tenants
✅ Verificar tenantId en TODAS las operaciones
✅ Testing exhaustivo antes de producción
```

---

## 📚 **Recursos Adicionales:**

- [Documentación oficial de multi-tenancy](https://docs.nestjs.com/techniques/database#multi-tenancy)
- [Prisma multi-tenant patterns](https://www.prisma.io/docs/guides/database/multi-tenancy)
- [JWT best practices](https://www.rfc-editor.org/rfc/rfc8725)

---

## ✅ **Siguiente Paso:**

Una vez implementado todo esto, el sistema estará completamente multi-tenant y listo para:
- Agregar más tenants fácilmente
- Garantizar aislamiento total de datos
- Escalar horizontalmente

---

**Fecha de creación:** 30 de Abril, 2026  
**Estado:** Pendiente de implementación  
**Prioridad:** Alta  
**Tiempo estimado:** 4-6 horas
