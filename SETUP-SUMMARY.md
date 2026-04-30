# 🚀 Plan de Setup Inicial - BarmenTech SaaS

> **Fecha:** 30 de Abril, 2026
> **Estado:** Proyecto migrado y configurado ✅

---

## ✅ **Completado Hasta Ahora:**

### **1. Migración del Proyecto**
- ✅ Proyecto original preservado en: `/home/allanb/contratoslucitour-temp`
- ✅ Código completo copiado a GitHub
- ✅ Nuevo proyecto clonado en: `/home/allanb/barmentech-agenciasdeviajesystem-saas`

### **2. Estructura de Branches (Git Flow)**
```
main (production)
  ↑
staging (pre-production)  
  ↑
develop (development) ← Trabajarás aquí
  ↑
feature/* (features temporales)
```

### **3. Documentación Profesional**
- ✅ README.md completo y profesional
- ✅ CONTRIBUTING.md con workflow detallado
- ✅ PR Template de GitHub configurado
- ✅ Convenciones de commits documentadas

### **4. GitHub Repository**
```
https://github.com/allanbarahona-web3/barmentech-agenciasdeviajesystem-saas.git

Branches en GitHub:
✅ main
✅ staging
✅ develop
```

---

## 🎯 **Próximos Pasos (Pendientes):**

### **Paso 6: Configurar Vercel**

1. **Conectar GitHub con Vercel:**
   - Ir a: https://vercel.com
   - New Project → Import from GitHub
   - Seleccionar: `barmentech-agenciasdeviajesystem-saas`

2. **Configurar Production Branch:**
   ```
   Settings → Git
   Production Branch: main ✓
   ```

3. **Configurar Preview Deployments:**
   ```
   Deploy Previews:
   ☑️ Enable preview deployments
   ☑️ Preview branches: develop, staging, feature/*
   ```

4. **Configurar Dominios:**
   ```
   Production (main):
   - agenciasdeviaje.barmentech.com
   
   Staging (staging):
   - staging.agenciasdeviaje.barmentech.com
   
   Development (develop):
   - dev.agenciasdeviaje.barmentech.com
   ```

5. **Variables de Entorno por Ambiente:**
   ```
   Production (main):
   DATABASE_URL=postgresql://prod-db
   JWT_SECRET=prod-secret
   SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
   SPACES_KEY=prod-key
   SPACES_SECRET=prod-secret
   SMTP_HOST=smtp.gmail.com
   
   Preview (staging):
   DATABASE_URL=postgresql://staging-db
   JWT_SECRET=staging-secret
   ...
   
   Development (develop):
   DATABASE_URL=postgresql://dev-db
   JWT_SECRET=dev-secret
   ...
   ```

---

### **Paso 7: Configurar Bases de Datos**

**Crear 3 DBs en DigitalOcean:**

1. **DB de Producción:**
   ```
   Nombre: barmentech-prod
   Tier: Production
   Backup: Daily automático
   ```

2. **DB de Staging:**
   ```
   Nombre: barmentech-staging
   Tier: Development
   Backup: Weekly
   Restore desde prod (datos sanitizados)
   ```

3. **DB de Development:**
   ```
   Nombre: barmentech-dev
   Tier: Development
   Backup: No necesario
   Seed data fake
   ```

**Ejecutar migraciones en cada DB:**
```bash
# Production
DATABASE_URL="postgresql://prod..." pnpm prisma:migrate:deploy

# Staging
DATABASE_URL="postgresql://staging..." pnpm prisma:migrate:deploy
DATABASE_URL="postgresql://staging..." pnpm prisma:seed

# Development
DATABASE_URL="postgresql://dev..." pnpm prisma:migrate:deploy
DATABASE_URL="postgresql://dev..." pnpm prisma:seed
```

---

### **Paso 8: Primer Feature (Workflow Profesional)**

```bash
# 1. Asegurarte de estar en develop
cd /home/allanb/barmentech-agenciasdeviajesystem-saas
git checkout develop
git pull origin develop

# 2. Crear feature branch
git checkout -b feature/nombre-descriptivo

# 3. Hacer cambios...
# ... editar código ...

# 4. Commit con convenciones
git add .
git commit -m "feat: descripción de la feature"

# 5. Push al repo
git push origin feature/nombre-descriptivo

# 6. Crear PR en GitHub
# GitHub → Pull Requests → New PR
# Base: develop ← Compare: feature/nombre-descriptivo
# Llenar template de PR
# Merge cuando esté aprobado

# 7. Deploy automático
# Vercel detecta el push y deploya automáticamente
```

---

## 🏗️ **Arquitectura Decidida:**

### **Multi-tenancy:**
- ✅ **Modelo:** Single Database + Tenant Isolation
- ✅ **Acceso:** Dominio único con login por email
- ✅ **URL:** `agenciasdeviaje.barmentech.com`
- ✅ **Seguridad:** Todas las queries filtran por `tenantId`

### **Ambientes y DBs:**
- ✅ **3 ambientes separados:** Production, Staging, Development
- ✅ **3 DBs independientes:** Una por ambiente
- ✅ **Deploy automático:** Push a branch → Deploy a Vercel

### **Branching Strategy:**
- ✅ **Git Flow simplificado**
- ✅ **main:** Producción (solo desde staging)
- ✅ **staging:** Pre-producción (cliente prueba aquí)
- ✅ **develop:** Desarrollo (integración de features)
- ✅ **feature/*:** Features temporales

---

## 📚 **Documentación Clave:**

- 📖 [README.md](./README.md) - Overview completo del proyecto
- 🤝 [CONTRIBUTING.md](./CONTRIBUTING.md) - Workflow y convenciones
- 🏢 [MULTI-TENANT-SETUP.md](./MULTI-TENANT-SETUP.md) - Arquitectura multi-tenant
- 🔒 [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) - Checklist de seguridad
- ✅ [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) - Pre-deploy checklist

---

## 🎓 **Convenciones Importantes:**

### **Commits:**
```bash
feat: nueva funcionalidad
fix: corrección de bug
docs: cambios en documentación
refactor: refactorización sin cambios funcionales
test: agregar/modificar tests
chore: tareas de mantenimiento
```

### **Branches:**
```bash
feature/nombre-descriptivo
fix/descripcion-fix
hotfix/fix-critico
```

### **Seguridad Multi-tenant:**
```typescript
// ❌ NUNCA
const data = await prisma.contract.findMany();

// ✅ SIEMPRE
const data = await prisma.contract.findMany({
  where: { tenantId: req.user.tenantId }
});
```

---

## 🚀 **Comandos Útiles:**

### **Desarrollo Local:**
```bash
# Backend
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm prisma:seed
pnpm start:dev  # → http://localhost:3001

# Frontend
cd frontend-next
pnpm install
pnpm dev  # → http://localhost:3000
```

### **Git Workflow:**
```bash
# Ver branches
git branch -a

# Cambiar de branch
git checkout develop

# Crear feature
git checkout -b feature/nueva-feature

# Ver status
git status

# Commit
git add .
git commit -m "feat: descripción"

# Push
git push origin nombre-branch
```

---

## 📞 **Contexto para la Nueva Conversación:**

Cuando abras el nuevo proyecto en VS Code, puedes decirle a Copilot:

> "Este es el proyecto BarmenTech SaaS multi-tenant. Ya está configurado con Git Flow profesional (main/staging/develop). Lee el archivo SETUP-SUMMARY.md para el contexto completo. Estamos en el Paso 6: necesito configurar Vercel para deploy automático de los 3 ambientes."

---

## ✅ **Resumen Ejecutivo:**

1. ✅ Proyecto migrado exitosamente
2. ✅ Branches profesionales creados (main/staging/develop)
3. ✅ Documentación completa agregada
4. ⏳ Pendiente: Configurar Vercel
5. ⏳ Pendiente: Configurar 3 DBs
6. ⏳ Pendiente: Primer deploy

---

**¡Listo para continuar el desarrollo profesional! 🎉**
