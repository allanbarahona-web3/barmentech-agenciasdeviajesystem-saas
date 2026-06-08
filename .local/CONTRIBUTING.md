# 🚀 Guía de Contribución - BarmenTech SaaS

## 📌 Branching Strategy

Utilizamos **Git Flow simplificado** con 3 branches principales:

```
main (production)
  ↑
staging (pre-production)
  ↑
develop (integration)
  ↑
feature/* (features temporales)
```

### Branches principales:

- **`main`**: Código en producción
  - Deploy automático a: `agenciasdeviaje.barmentech.com`
  - Solo se actualiza desde `staging` mediante PR
  - Requiere aprobación de QA/Product Owner

- **`staging`**: Pre-producción para testing final
  - Deploy automático a: `staging.agenciasdeviaje.barmentech.com`
  - Para testing de cliente/QA antes de producción
  - Se actualiza desde `develop` cuando un release está listo

- **`develop`**: Branch principal de desarrollo
  - Deploy automático a: `dev.agenciasdeviaje.barmentech.com`
  - Aquí se integran todas las features
  - Siempre debe compilar sin errores

### Branches temporales:

- **`feature/nombre-descriptivo`**: Nuevas funcionalidades
- **`fix/descripcion-fix`**: Correcciones no urgentes
- **`hotfix/fix-critico`**: Fixes urgentes que van directo a `main`

---

## 🔄 Workflow de Desarrollo

### 1. Crear una nueva feature:

```bash
# Partir siempre desde develop actualizado
git checkout develop
git pull origin develop

# Crear branch de feature
git checkout -b feature/add-payment-receipts

# Trabajar en tu feature...
git add .
git commit -m "feat: add automatic receipt generation"

# Push al repo
git push origin feature/add-payment-receipts
```

### 2. Crear Pull Request:

1. Ve a GitHub y crea PR desde tu branch hacia `develop`
2. Llena el template de PR
3. Asigna reviewers si aplica
4. Espera que pasen los checks (CI/CD)
5. Merge a `develop` una vez aprobado

### 3. Release a Staging:

```bash
# Cuando varias features están listas para testing
git checkout staging
git pull origin staging
git merge develop
git push origin staging

# → Deploy automático a staging.agenciasdeviaje.barmentech.com
# → Cliente/QA prueba
```

### 4. Release a Production:

```bash
# Después de QA approval en staging
git checkout main
git pull origin main
git merge staging

# Tag de versión
git tag -a v1.5.0 -m "Release 1.5.0: Payment receipts + UI improvements"
git push origin main --tags

# → Deploy automático a agenciasdeviaje.barmentech.com
```

### 5. Hotfix urgente:

```bash
# Para bugs críticos en producción
git checkout main
git checkout -b hotfix/fix-payment-crash

# Fix rápido
git add .
git commit -m "hotfix: resolve payment processing crash"
git push origin hotfix/fix-payment-crash

# PR directo a main
# Después: Merge main → develop para sincronizar
```

---

## 📝 Convenciones de Commits

Usamos **Conventional Commits** para commits claros y semantic versioning:

### Formato:
```
<tipo>: <descripción corta>

[cuerpo opcional]

[footer opcional]
```

### Tipos:

- **feat**: Nueva funcionalidad
  ```bash
  feat: add automatic receipt email sending
  ```

- **fix**: Corrección de bug
  ```bash
  fix: resolve 403 error in pending-counts endpoint
  ```

- **docs**: Cambios en documentación
  ```bash
  docs: update API documentation
  ```

- **refactor**: Refactorización de código (sin cambios funcionales)
  ```bash
  refactor: simplify payment verification logic
  ```

- **test**: Agregar o modificar tests
  ```bash
  test: add tests for billing service
  ```

- **chore**: Tareas de mantenimiento
  ```bash
  chore: update dependencies
  ```

- **style**: Cambios de formato (no afectan funcionalidad)
  ```bash
  style: fix indentation in contracts.service.ts
  ```

- **perf**: Mejoras de performance
  ```bash
  perf: optimize contract listing query
  ```

### Ejemplos de commits buenos:

```bash
✅ feat: add travel packages module with CRUD operations
✅ fix: prevent duplicate payment verification
✅ docs: add setup instructions for local development
✅ refactor: extract payment validation to separate service
✅ test: add unit tests for contract archival
✅ chore: upgrade NestJS to version 10
```

### Ejemplos de commits malos:

```bash
❌ update stuff
❌ fix bug
❌ changes
❌ WIP
❌ asdfjkl
```

---

## 🏗️ Estructura del Proyecto

```
barmentech-agenciasdeviajesystem-saas/
├── backend/
│   ├── src/
│   │   ├── auth/          # Autenticación JWT
│   │   ├── billing/       # Facturación y abonos
│   │   ├── contracts/     # Contratos y firmas
│   │   ├── prisma/        # Database service
│   │   └── travel-packages/ # Paquetes de viaje
│   ├── prisma/
│   │   ├── schema.prisma  # Schema de DB
│   │   └── migrations/    # Migraciones de DB
│   └── package.json
│
├── frontend-next/
│   ├── src/
│   │   ├── app/          # Next.js App Router
│   │   ├── components/   # Componentes reutilizables
│   │   ├── features/     # Features complejas
│   │   └── lib/          # Utils y API clients
│   └── package.json
│
└── docs/                 # Documentación técnica
```

---

## 🗄️ Ambientes y Bases de Datos

| Ambiente | Branch | URL | Database | Propósito |
|----------|--------|-----|----------|-----------|
| **Production** | `main` | agenciasdeviaje.barmentech.com | `db-prod` | Clientes reales |
| **Staging** | `staging` | staging.agenciasdeviaje.barmentech.com | `db-staging` | Testing pre-prod |
| **Development** | `develop` | dev.agenciasdeviaje.barmentech.com | `db-dev` | Testing interno |
| **Local** | cualquiera | localhost:3000 / :3001 | `db-local` | Desarrollo local |

**IMPORTANTE**: Cada ambiente tiene su propia base de datos independiente.

---

## 🔒 Seguridad Multi-tenant

**Regla de oro**: SIEMPRE filtrar por `tenantId`

```typescript
// ❌ NUNCA hagas esto:
const contracts = await prisma.contract.findMany();

// ✅ SIEMPRE haz esto:
const contracts = await prisma.contract.findMany({
  where: { tenantId: req.user.tenantId }
});
```

---

## 🧪 Testing

### Ejecutar tests:

```bash
# Backend
cd backend
pnpm test              # Unit tests
pnpm test:e2e          # E2E tests
pnpm test:cov          # Coverage

# Frontend
cd frontend-next
pnpm test              # Jest tests
pnpm test:watch        # Watch mode
```

### Antes de hacer PR:
1. ✅ Tests unitarios pasan
2. ✅ Build compila sin errores
3. ✅ No hay errores de linting
4. ✅ Probado manualmente en local

---

## 📦 Manejo de Dependencias

```bash
# Agregar dependencia
pnpm add nombre-paquete

# Agregar dependencia de dev
pnpm add -D nombre-paquete

# Actualizar todas las dependencias
pnpm update

# Verificar vulnerabilidades
pnpm audit
```

---

## 🚀 Deploy

Los deploys son **automáticos** en Vercel:

- Push a `main` → Deploy a producción
- Push a `staging` → Deploy a staging
- Push a `develop` → Deploy a dev
- Push a `feature/*` → Deploy preview temporal

**No es necesario deploy manual.**

---

## 📞 Soporte

Si tienes dudas:
1. Revisa esta documentación
2. Revisa los archivos `.md` del proyecto
3. Pregunta al equipo

---

## 📋 Checklist para Nuevos Desarrolladores

- [ ] Clonar el repo
- [ ] Instalar dependencias (`pnpm install`)
- [ ] Configurar variables de entorno
- [ ] Ejecutar migraciones de DB
- [ ] Ejecutar seed de datos
- [ ] Correr proyecto en local
- [ ] Leer toda esta documentación
- [ ] Hacer tu primer commit siguiendo convenciones
- [ ] Crear tu primera feature branch
- [ ] Crear tu primer PR

¡Bienvenido al equipo! 🎉
