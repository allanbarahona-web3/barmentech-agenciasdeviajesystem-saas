# ✅ Checklist de Producción - MVP Lucitour

**Fecha:** 30 de abril de 2026  
**Estado actual:** ⚠️ VIABLE pero requiere ajustes críticos

---

## 🚨 CRÍTICO - Antes de lanzar

### 1. **Backups de Base de Datos** 🔴
- [ ] **Verificar backups automáticos en DigitalOcean**
  - Panel → Databases → Settings → Backups
  - Frecuencia recomendada: Diaria
  - Retención: Mínimo 7 días
  
- [ ] **Probar restauración de backup**
  - Hacer backup manual ahora
  - Restaurar en DB de prueba
  - Verificar integridad de datos

- [ ] **Implementar soft-delete en tablas críticas**
  ```prisma
  model Contract {
    deletedAt DateTime?
    deletedBy String?
  }
  ```
  - Tablas prioritarias: Contract, Client, BillingInvoice, BillingPayment

- [ ] **Cambiar onDelete: Cascade → Restrict en relaciones críticas**
  ```prisma
  // ANTES (PELIGROSO):
  contract Contract @relation(onDelete: Cascade)
  
  // DESPUÉS (SEGURO):
  contract Contract @relation(onDelete: Restrict)
  ```

**Impacto si no se hace:** ☠️ Pérdida permanente de datos críticos

---

### 2. **Documentos/Archivos en DigitalOcean Spaces** 🔴

**Estado actual:**
- ✅ Almacenamiento en Spaces (S3-compatible)
- ❌ NO se conservan originales al convertir a WebP
- ❌ NO hay redundancia/replicación

- [ ] **Verificar configuración de Spaces**
  - Panel → Spaces → Settings
  - CDN: Habilitado (mejora velocidad)
  - CORS: Configurado correctamente
  
- [ ] **Habilitar Object Versioning**
  - Protege contra sobrescritura accidental
  - Panel → Spaces → Settings → Enable Versioning
  
- [ ] **Conservar archivos originales al convertir a WebP**
  ```typescript
  // ACTUAL: Solo guarda WebP
  await this.convertImageToWebP(file);
  
  // RECOMENDADO: Guardar ambos
  await this.uploadOriginal(file);  // Original
  await this.uploadWebP(file);      // Versión optimizada
  ```

- [ ] **Plan de recuperación de archivos**
  - Exportar lista de objectKeys críticos
  - Script de backup manual a S3 externo (opcional)

**Impacto si no se hace:** ☠️ Documentos legales perdidos sin forma de recuperarlos

---

### 3. **Monitoreo y Alertas** 🟡

- [ ] **Configurar logs centralizados**
  - Opciones: Logtail, Datadog, Sentry
  - Capturar errores de backend automáticamente
  
- [ ] **Alertas críticas**
  - Email si base de datos cae
  - Email si Spaces no responde
  - Email si hay >10 errores 500 en 1 hora

- [ ] **Monitoreo de uptime**
  - UptimeRobot (gratis) o Pingdom
  - Alertar si frontend o backend caen

**Impacto si no se hace:** 🔥 No sabrás si algo está roto hasta que usuarios reporten

---

## 🟡 IMPORTANTE - Primeras semanas en producción

### 4. **Ambiente de Staging**

- [ ] **Crear base de datos de staging**
  - Clonar schema de producción
  - Datos de prueba realistas
  
- [ ] **Deploy de staging**
  - Frontend: Vercel preview branch
  - Backend: DigitalOcean App (env diferente)
  
- [ ] **Probar cambios en staging antes de producción**

**Impacto si no se hace:** 🔥 Cambios rotos van directo a producción

---

### 5. **Variables de Entorno - Validación**

- [ ] **Verificar todas las variables en producción**
  ```bash
  # Backend (DigitalOcean App)
  DATABASE_URL=postgresql://...
  DO_SPACES_ENDPOINT=sfo3.digitaloceanspaces.com
  DO_SPACES_REGION=sfo3
  DO_SPACES_BUCKET=lucitouroperations
  DO_SPACES_KEY=...
  DO_SPACES_SECRET=...
  JWT_SECRET=(mínimo 32 caracteres aleatorios)
  RESEND_API_KEY=re_...
  OPENAI_API_KEY=sk-proj-...
  PUBLIC_APP_BASE_URL=https://contratos.lucitour.com
  ALLOWED_ORIGIN=https://contratos.lucitour.com
  ```

- [ ] **Frontend (Vercel)**
  ```bash
  NEXT_PUBLIC_API_BASE_URL=https://contratostempapi-h5ppc.ondigitalocean.app
  ```

- [ ] **Probar en producción ANTES de anunciar a usuarios**
  - Login
  - Crear contrato de prueba
  - Firmar contrato
  - Reportar pago
  - Aprobar pago
  - Descargar recibo

**Impacto si no se hace:** 💥 Sistema no funciona en producción

---

### 6. **Límites y Rate Limiting**

- [ ] **Verificar límites de ThrottlerModule**
  ```typescript
  // backend/src/app.module.ts
  ThrottlerModule.forRoot([{
    ttl: 60000,  // 60 segundos
    limit: 100,  // ¿Es suficiente?
  }])
  ```

- [ ] **Límites de archivo ajustados**
  ```typescript
  // payment-verification.service.ts
  maxReceiptSizeBytes = 10 * 1024 * 1024; // 10MB - ¿OK?
  ```

- [ ] **Límites de Spaces**
  - DigitalOcean: 250GB incluidos
  - Monitorear uso mensual

**Impacto si no se hace:** 🐌 DDoS o abuso pueden tumbar el sistema

---

## 🟢 RECOMENDADO - Próximos 30 días

### 7. **Tests Automatizados**

- [ ] **Tests unitarios para lógica crítica**
  - BillingService.calculateBalance()
  - BillingService.verifyPayment()
  - ContractsService.generatePDF()
  
- [ ] **Tests de integración**
  - Flujo completo: Crear contrato → Firmar → Pagar → Aprobar

**Impacto si no se hace:** 🪲 Bugs descubiertos por usuarios en producción

---

### 8. **Documentación Operativa**

- [ ] **Runbook para emergencias**
  - Cómo restaurar backup de DB
  - Cómo revertir deploy malo
  - Contactos de emergencia (DigitalOcean, Vercel)
  
- [ ] **Manual de usuario**
  - Para agentes
  - Para admin/contador

**Impacto si no se hace:** 😰 Pánico cuando algo falla

---

### 9. **Optimizaciones de Performance**

- [ ] **Índices de base de datos**
  - Verificar que existan en campos de búsqueda frecuente
  - Prisma ya genera algunos automáticamente
  
- [ ] **CDN para assets estáticos**
  - Imágenes en frontend/public/
  - DigitalOcean Spaces CDN ya habilitado

- [ ] **Compresión de respuestas backend**
  - NestJS compression middleware

**Impacto si no se hace:** 🐌 Sistema lento con muchos usuarios

---

### 10. **Seguridad Adicional**

- [ ] **HTTPS forzado**
  - Frontend: Vercel lo hace automáticamente ✅
  - Backend: DigitalOcean App también ✅
  
- [ ] **Headers de seguridad**
  ```typescript
  // backend/src/main.ts
  app.use(helmet()); // Agregar helmet
  ```

- [ ] **Validación de inputs más estricta**
  - class-validator ya instalado ✅
  - Revisar DTOs tienen decoradores @IsString, @IsEmail, etc.

- [ ] **Auditar dependencias**
  ```bash
  cd backend && npm audit
  cd frontend-next && npm audit
  ```

**Impacto si no se hace:** 🔓 Vulnerabilidades explotables

---

## 📋 Resumen de Prioridades

### 🔴 **ANTES DE LANZAR (Hoy - Mañana):**
1. ✅ Verificar backups de DB
2. ✅ Habilitar versioning en Spaces
3. ✅ Probar restauración de backup
4. ✅ Validar todas las variables de entorno en producción
5. ✅ Test end-to-end completo en producción

### 🟡 **PRIMERA SEMANA:**
6. Implementar soft-delete en Contract/Client
7. Cambiar Cascade → Restrict en relaciones críticas
8. Configurar alertas básicas (Sentry o similar)
9. Crear ambiente de staging

### 🟢 **PRIMER MES:**
10. Escribir tests críticos
11. Documentar runbook de emergencias
12. Monitorear y optimizar performance

---

## 🎯 ¿Está listo el MVP?

**SÍ, CON CONDICIONES:**

✅ **Pueden lanzar SI:**
- Verifican que backups automáticos están activos
- Habilitan versioning en Spaces
- Prueban el flujo completo en producción ANTES de anunciar
- Tienen plan de respaldo si algo falla

❌ **NO lancen SI:**
- No han verificado que pueden restaurar un backup
- No tienen forma de monitorear si el sistema está caído
- No han probado el sistema en producción

---

## 💡 Recomendación Final

**Estrategia de Lanzamiento Seguro:**

1. **Hoy:** Checklist 🔴 completo
2. **Mañana:** Deploy a producción + test exhaustivo
3. **Día 3:** Invitar 2-3 agentes de confianza (beta interna)
4. **Semana 1:** Monitorear logs, arreglar bugs menores
5. **Semana 2:** Abrir a todos los agentes
6. **Mes 1:** Implementar checklist 🟡 y 🟢

**Riesgo estimado con este plan:** 🟢 BAJO

**Sin este plan:** 🔴 ALTO (posible pérdida de datos)

---

**Fecha de actualización:** 2026-04-30  
**Próxima revisión:** Antes del lanzamiento oficial
