# 🛡️ Plan de Prevención de Pérdida de Datos

**Última actualización:** 30 de abril de 2026  
**Criticidad:** 🔴 ALTA

---

## 📊 Evaluación de Riesgo Actual

### **Riesgo de Pérdida de Datos: MEDIO-ALTO** ⚠️

---

## 🗄️ 1. Base de Datos PostgreSQL

### **¿Qué puede perderse?**
- Contratos completos (clientes, fechas, montos)
- Historial de pagos y recibos
- Firmas digitales (registros, no archivos)
- Auditoría completa de transacciones
- Cuentas bancarias registradas
- Usuarios y permisos

### **Causas de pérdida:**
1. ❌ **Borrado accidental** - Alguien ejecuta `DELETE` sin `WHERE`
2. ❌ **onDelete: Cascade** - Borrar un contrato borra TODO lo relacionado
3. ❌ **Migración fallida** - Error en script de Prisma
4. ❌ **Corrupción de disco** - Fallo de hardware (RARO en DO)
5. ❌ **Ataque malicioso** - Acceso no autorizado a DB

### **Protecciones actuales:**
✅ **DigitalOcean Managed Database tiene:**
- Backups automáticos diarios (últimos 7 días)
- Alta disponibilidad (réplicas automáticas)
- Encriptación en reposo
- Firewall restringido por IP

❌ **NO tienen:**
- Soft-delete (registros borrados NO son recuperables)
- Restricciones para prevenir Cascade delete accidental
- Backups locales adicionales

---

### **⚡ Acciones Inmediatas (ANTES DE PRODUCCIÓN)**

#### **A. Verificar Backups Automáticos**

```bash
# 1. Ir a DigitalOcean Panel
https://cloud.digitalocean.com/databases/

# 2. Seleccionar tu base de datos
lucitour → Settings → Backups

# 3. Verificar:
✅ Daily Backups: Enabled
✅ Retention: 7 days (mínimo)
✅ Point-in-time recovery: 24 hours (opcional pero recomendado)

# 4. Crear backup manual AHORA
Backups → Create Backup Now
```

#### **B. Probar Restauración (CRÍTICO)**

```bash
# 1. Crear backup manual
# 2. Crear DB de prueba en DigitalOcean
# 3. Restaurar backup en DB de prueba
# 4. Conectar backend a DB de prueba
# 5. Verificar que datos estén intactos

# Comando de prueba:
DATABASE_URL="postgresql://test_user:test_pass@test-db.ondigitalocean.com:25060/lucitour_test?schema=contracts_temp" npm run start:dev

# Si puedes ver contratos/clientes → ✅ Backup funciona
```

**⏱️ Tiempo estimado:** 30 minutos  
**Importancia:** 🔴 CRÍTICA - Si no puedes restaurar, NO tienes backup real

---

#### **C. Implementar Soft-Delete en Tablas Críticas**

**Modificar schema.prisma:**

```prisma
model Contract {
  id                String             @id @default(cuid())
  contractNumber    String             @unique
  // ... campos existentes ...
  
  // 🆕 Soft delete
  deletedAt         DateTime?
  deletedBy         String?
  deletedReason     String?
  
  // ... resto del modelo ...
}

model Client {
  id           String      @id @default(cuid())
  fullName     String
  // ... campos existentes ...
  
  // 🆕 Soft delete
  deletedAt    DateTime?
  deletedBy    String?
  
  // ... resto del modelo ...
}

model BillingInvoice {
  id              String   @id @default(cuid())
  // ... campos existentes ...
  
  // 🆕 Soft delete
  deletedAt       DateTime?
  deletedBy       String?
  
  // ... resto del modelo ...
}

model BillingPayment {
  id            String   @id @default(cuid())
  // ... campos existentes ...
  
  // 🆕 Soft delete
  deletedAt     DateTime?
  deletedBy     String?
  
  // ... resto del modelo ...
}
```

**Crear migración:**

```bash
cd backend
npx prisma migrate dev --name add_soft_delete_fields
```

**Modificar servicios para usar soft-delete:**

```typescript
// ❌ ANTES (PELIGROSO):
await this.prisma.contract.delete({
  where: { id: contractId }
});

// ✅ DESPUÉS (SEGURO):
await this.prisma.contract.update({
  where: { id: contractId },
  data: {
    deletedAt: new Date(),
    deletedBy: user.fullName,
    deletedReason: 'Usuario solicitó eliminación'
  }
});

// Modificar todas las queries para excluir borrados:
await this.prisma.contract.findMany({
  where: {
    deletedAt: null,  // Solo traer NO borrados
    // ... otros filtros
  }
});
```

**⏱️ Tiempo estimado:** 3-4 horas  
**Beneficio:** 🛡️ Registros "borrados" pueden recuperarse

---

#### **D. Cambiar Cascade → Restrict en Relaciones Críticas**

**Problema actual:**

```prisma
// ☠️ PELIGROSO:
model ContractDocument {
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id], onDelete: Cascade)
}

// Si borras el Contract → Se borran TODOS los documentos automáticamente
```

**Solución:**

```prisma
// ✅ SEGURO:
model ContractDocument {
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id], onDelete: Restrict)
}

// Ahora NO puedes borrar un Contract si tiene documentos
// Tendrías que borrar documentos primero (o usar soft-delete)
```

**Cambios recomendados:**

```prisma
// backend/prisma/schema.prisma

model ContractDocument {
  contract Contract @relation(fields: [contractId], references: [id], onDelete: Restrict)  // Era: Cascade
}

model ContractSignatureEvent {
  contract Contract @relation(fields: [contractId], references: [id], onDelete: Restrict)  // Era: Cascade
}

model ContractUsedToken {
  contract Contract @relation(fields: [contractId], references: [id], onDelete: Restrict)  // Era: Cascade
}

model BillingPayment {
  contract Contract @relation(fields: [contractId], references: [id], onDelete: Restrict)  // Era: Restrict ✅
}

model BillingReceipt {
  invoice  BillingInvoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)  // Era: Restrict ✅
}

model BillingPaymentAttachment {
  payment BillingPayment @relation(fields: [paymentId], references: [id], onDelete: Restrict)  // Agregar si no existe
}
```

**Crear migración:**

```bash
cd backend
npx prisma migrate dev --name prevent_cascade_deletes
```

**⚠️ IMPORTANTE:** Después de esto, no podrás borrar un contrato sin borrar manualmente sus dependencias. **Pero eso es BUENO** - previene borrados accidentales.

**⏱️ Tiempo estimado:** 1 hora  
**Beneficio:** 🛡️ Imposible borrar datos por accidente

---

## 📁 2. Archivos en DigitalOcean Spaces

### **¿Qué puede perderse?**
- PDFs de contratos firmados
- Comprobantes de pago (imágenes/PDFs)
- Recibos generados
- Notas de crédito
- Firmas digitales (imágenes PNG)
- Estados de cuenta

### **Causas de pérdida:**
1. ❌ **Sobrescritura accidental** - Subir archivo con mismo nombre
2. ❌ **Borrado manual** - Alguien borra desde panel de DO
3. ❌ **Conversión a WebP sin backup** - Original se pierde
4. ❌ **Bucket eliminado** - Error catastrófico (RARO)

### **Protecciones actuales:**
✅ **DigitalOcean Spaces tiene:**
- 99.9% uptime SLA
- Redundancia automática entre servidores
- Encriptación en tránsito (HTTPS)

❌ **NO tienen:**
- Versioning habilitado (sobrescritura es permanente)
- Backup de archivos originales antes de WebP
- Replicación a segundo bucket

---

### **⚡ Acciones Inmediatas (ANTES DE PRODUCCIÓN)**

#### **A. Habilitar Versioning en Spaces**

```bash
# 1. Ir a DigitalOcean Panel
https://cloud.digitalocean.com/spaces/

# 2. Seleccionar bucket: lucitouroperations
# 3. Settings → Versioning → Enable

# ✅ Resultado:
# - Si subes archivo con nombre existente, versión anterior se conserva
# - Puedes restaurar versiones antiguas desde el panel
# - Ligero incremento en costo de almacenamiento (vale la pena)
```

**⏱️ Tiempo:** 2 minutos  
**Costo adicional:** ~5-10% más almacenamiento (despreciable)  
**Beneficio:** 🛡️ Archivos sobrescritos son recuperables

---

#### **B. Conservar Archivos Originales (No solo WebP)**

**Problema actual:**

```typescript
// backend/src/billing/billing.service.ts

async convertImageToWebP(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<...> {
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
    const webpBuffer = await sharp(file.buffer)
      .webp({ quality: 85 })
      .toBuffer();
    
    // ☠️ PROBLEMA: Original se pierde aquí
    return {
      buffer: webpBuffer,
      mimetype: 'image/webp',
      originalname: file.originalname.replace(/\.(jpg|jpeg|png)$/i, '.webp'),
      size: webpBuffer.length
    };
  }
  return file;
}
```

**Solución:**

```typescript
// Modificar para guardar AMBOS: original + WebP

async uploadPaymentAttachment(
  payment: Payment,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number }
) {
  const timestamp = Date.now();
  const sanitized = this.sanitizeSegment(file.originalname);
  
  // 1. Subir ORIGINAL (sin modificar)
  const originalKey = [
    'payment-attachments',
    'originals',  // 🆕 Carpeta para originales
    payment.id,
    `${timestamp}-${sanitized}`
  ].join('/');
  
  await this.uploadToSpaces({
    objectKey: originalKey,
    contentType: file.mimetype,
    body: file.buffer
  });
  
  // 2. Subir OPTIMIZADO (WebP)
  const optimized = await this.convertImageToWebP(file);
  const webpKey = [
    'payment-attachments',
    'optimized',  // 🆕 Carpeta para optimizados
    payment.id,
    `${timestamp}-${sanitized.replace(/\.(jpg|jpeg|png)$/i, '.webp')}`
  ].join('/');
  
  await this.uploadToSpaces({
    objectKey: webpKey,
    contentType: optimized.mimetype,
    body: optimized.buffer
  });
  
  // 3. Guardar ambas referencias en DB
  await this.prisma.billingPaymentAttachment.create({
    data: {
      paymentId: payment.id,
      objectKey: webpKey,            // Usamos WebP por defecto (rápido)
      objectKeyOriginal: originalKey, // 🆕 Backup del original
      originalFileName: file.originalname,
      mimeType: optimized.mimetype,
      mimeTypeOriginal: file.mimetype, // 🆕
      size: optimized.size,
      sizeOriginal: file.size         // 🆕
    }
  });
}
```

**Modificar schema.prisma:**

```prisma
model BillingPaymentAttachment {
  id                 String   @id @default(cuid())
  paymentId          String
  objectKey          String   // WebP optimizado
  objectKeyOriginal  String?  // 🆕 Original sin modificar
  originalFileName   String
  mimeType           String   // image/webp
  mimeTypeOriginal   String?  // 🆕 image/jpeg original
  size               Int      // Tamaño del WebP
  sizeOriginal       Int?     // 🆕 Tamaño del original
  createdAt          DateTime @default(now())
  
  payment BillingPayment @relation(fields: [paymentId], references: [id], onDelete: Restrict)
}
```

**Crear migración:**

```bash
cd backend
npx prisma migrate dev --name add_original_file_backup_fields
```

**⏱️ Tiempo estimado:** 2-3 horas  
**Costo adicional:** ~2x almacenamiento en Spaces (pero son céntimos)  
**Beneficio:** 🛡️ Documentos originales NUNCA se pierden

---

#### **C. Script de Backup Manual (Opcional pero Recomendado)**

```typescript
// backend/scripts/backup-spaces-to-s3.ts

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Backup de DigitalOcean Spaces a S3 externo (o local)
 * 
 * USO:
 * cd backend
 * npx ts-node scripts/backup-spaces-to-s3.ts
 */

async function backupSpacesToS3() {
  const sourceClient = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    },
  });

  const destClient = new S3Client({
    region: 'us-west-2', // AWS S3 de backup
    credentials: {
      accessKeyId: process.env.AWS_BACKUP_KEY!,
      secretAccessKey: process.env.AWS_BACKUP_SECRET!,
    },
  });

  const sourceBucket = process.env.DO_SPACES_BUCKET!;
  const destBucket = 'lucitour-backup'; // Tu bucket de backup

  console.log(`🔄 Iniciando backup de ${sourceBucket}...`);

  // Listar todos los archivos
  let continuationToken: string | undefined = undefined;
  let fileCount = 0;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: sourceBucket,
      ContinuationToken: continuationToken,
    });

    const listResult = await sourceClient.send(listCommand);

    for (const object of listResult.Contents || []) {
      const key = object.Key!;
      
      // Descargar de DO Spaces
      const getCommand = new GetObjectCommand({
        Bucket: sourceBucket,
        Key: key,
      });
      
      const getResult = await sourceClient.send(getCommand);
      const bodyBuffer = await streamToBuffer(getResult.Body as any);

      // Subir a S3 backup
      const putCommand = new PutObjectCommand({
        Bucket: destBucket,
        Key: key,
        Body: bodyBuffer,
        ContentType: object.ContentType,
      });

      await destClient.send(putCommand);

      fileCount++;
      console.log(`✅ ${fileCount}: ${key}`);
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);

  console.log(`🎉 Backup completado: ${fileCount} archivos`);
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

backupSpacesToS3().catch(console.error);
```

**Configurar Cron Job semanal:**

```bash
# En servidor de producción o GitHub Actions

# Opción 1: Cron manual en servidor
crontab -e

# Ejecutar cada domingo a las 3am
0 3 * * 0 cd /home/app/backend && npm run backup:spaces

# Opción 2: GitHub Actions (mejor)
# .github/workflows/backup-spaces.yml
name: Backup Spaces
on:
  schedule:
    - cron: '0 3 * * 0'  # Cada domingo 3am UTC
  workflow_dispatch:  # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: cd backend && npm install
      - run: cd backend && npm run backup:spaces
        env:
          DO_SPACES_ENDPOINT: ${{ secrets.DO_SPACES_ENDPOINT }}
          DO_SPACES_KEY: ${{ secrets.DO_SPACES_KEY }}
          DO_SPACES_SECRET: ${{ secrets.DO_SPACES_SECRET }}
          DO_SPACES_BUCKET: ${{ secrets.DO_SPACES_BUCKET }}
          AWS_BACKUP_KEY: ${{ secrets.AWS_BACKUP_KEY }}
          AWS_BACKUP_SECRET: ${{ secrets.AWS_BACKUP_SECRET }}
```

**⏱️ Tiempo estimado:** 4-5 horas (setup + testing)  
**Costo adicional:** ~$5-10/mes en S3 de backup  
**Beneficio:** 🛡️ Redundancia completa fuera de DigitalOcean

---

## 🎯 Resumen de Prioridades

### 🔴 **HACER HOY (Antes de producción):**
1. ✅ Verificar backups automáticos de DB están activos
2. ✅ Probar restauración de backup (CRÍTICO)
3. ✅ Habilitar versioning en Spaces

### 🟡 **PRIMERA SEMANA:**
4. Implementar soft-delete en Contract/Client/Invoice
5. Cambiar Cascade → Restrict en relaciones críticas
6. Modificar código para guardar archivos originales + WebP

### 🟢 **PRIMER MES:**
7. Script de backup automático a S3 externo
8. Cron job semanal de backup
9. Documentar proceso de recuperación

---

## 📊 Nivel de Riesgo Después de Implementar Todo

| Escenario | Riesgo Actual | Riesgo Post-Implementación |
|-----------|---------------|----------------------------|
| Borrado accidental en DB | 🔴 ALTO | 🟢 BAJO (soft-delete) |
| Corrupción de DB | 🟡 MEDIO | 🟢 BAJO (backups probados) |
| Archivos sobrescritos | 🔴 ALTO | 🟢 BAJO (versioning) |
| Pérdida de originales | 🔴 ALTO | 🟢 BAJO (dual upload) |
| Desastre total DO | 🟡 MEDIO | 🟢 BAJO (backup externo) |

---

## 📞 Plan de Emergencia

### **Si pierdes datos de la base de datos:**

```bash
# 1. NO PÁNICO - Detener aplicación inmediatamente
# 2. En DigitalOcean Panel:
#    Databases → lucitour → Backups → Select backup → Restore

# 3. Crear nueva DB temporal desde backup
# 4. Validar integridad de datos
# 5. Redirigir aplicación a DB restaurada
# 6. Investigar causa raíz
```

### **Si pierdes archivos de Spaces:**

```bash
# 1. Verificar si versioning está habilitado
# 2. Panel Spaces → File → Show versions → Restore

# Si no hay versioning y archivo está perdido:
# 3. Restaurar desde backup externo (S3)
# 4. Si no hay backup externo → PÉRDIDA PERMANENTE ☠️

# Por eso es CRÍTICO habilitar versioning AHORA
```

---

**Conclusión:** Con estas medidas, el riesgo de pérdida de datos pasa de **MEDIO-ALTO** a **BAJO**.

**Tiempo total de implementación:** 1-2 días  
**Inversión:** $5-15/mes adicionales  
**ROI:** 🛡️ INCALCULABLE - Protege el negocio completo
