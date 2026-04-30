# 🚀 BarmenTech - Sistema de Gestión para Agencias de Viaje

> **SaaS Multi-tenant** para gestión de contratos, pagos, facturación y paquetes de viaje

[![Production](https://img.shields.io/badge/Production-Live-success)](https://agenciasdeviaje.barmentech.com)
[![Staging](https://img.shields.io/badge/Staging-Testing-yellow)](https://staging.agenciasdeviaje.barmentech.com)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tech Stack](#-tech-stack)
- [Arquitectura Multi-tenant](#-arquitectura-multi-tenant)
- [Quick Start](#-quick-start)
- [Ambientes](#-ambientes)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Contribuir](#-contribuir)
- [Documentación](#-documentación)

---

## ✨ Características

### 🔐 **Autenticación & Roles**
- Sistema JWT multi-tenant
- Roles: ADMIN, CONTADOR, AGENTE, CLIENTE
- Protección por tenant (aislamiento de datos)

### 📝 **Gestión de Contratos**
- Creación y edición de contratos
- Firma digital de contratos
- Archivo de contratos (soft delete)
- Historial completo de eventos
- Generación automática de PDFs

### 💰 **Módulo de Facturación**
- Registro de abonos por agentes
- Verificación de pagos con adjuntos
- Generación automática de recibos PDF
- Notas de crédito y débito
- Estado de cuenta en tiempo real
- Notificaciones automáticas por email

### ✈️ **Paquetes de Viaje**
- CRUD completo de paquetes
- Códigos únicos auto-generados
- Asociación con contratos

### 📊 **Dashboard Administrativo**
- Métricas en tiempo real
- Pagos pendientes de verificación
- Navegación vertical inteligente
- Auto-refresh para agentes

### 🔔 **Sistema de Notificaciones**
- Emails transaccionales automáticos
- Notificaciones de estado de pagos
- Envío de recibos aprobados

---

## 🛠️ Tech Stack

### **Backend**
- **Framework**: NestJS 10
- **Database**: PostgreSQL 14
- **ORM**: Prisma 5
- **Auth**: JWT + bcrypt
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Email**: Nodemailer
- **PDF**: PDFKit
- **Image Processing**: Sharp (WebP conversion)

### **Frontend**
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **HTTP Client**: Fetch API
- **State**: React hooks

### **DevOps**
- **Hosting**: Vercel (Frontend + Backend)
- **Database**: DigitalOcean Managed PostgreSQL
- **CI/CD**: Vercel (automático)
- **Monitoring**: Vercel Analytics

---

## 🏢 Arquitectura Multi-tenant

### **Modelo**: Single Database + Tenant Isolation

```typescript
// Todos los modelos tienen tenantId
model Contract {
  id        String   @id
  tenantId  String   // FK a Tenant
  // ... otros campos
  
  @@index([tenantId])
}
```

### **Seguridad por Tenant**

Todas las queries filtran automáticamente por `tenantId`:

```typescript
const contracts = await prisma.contract.findMany({
  where: { tenantId: req.user.tenantId }
});
```

### **Login Multi-tenant**

```
URL única: agenciasdeviaje.barmentech.com

juan@lucitour.com → Tenant: Lucitour S.A.
maria@almanova.com → Tenant: Viajes Alma Nova

Cada usuario ve SOLO los datos de su empresa
```

---

## 🚀 Quick Start

### **Prerequisitos**

- Node.js 20+
- pnpm 8+
- PostgreSQL 14+
- Git

### **1. Clonar el repositorio**

```bash
git clone https://github.com/allanbarahona-web3/barmentech-agenciasdeviajesystem-saas.git
cd barmentech-agenciasdeviajesystem-saas
```

### **2. Instalar dependencias**

```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend-next
pnpm install
```

### **3. Configurar variables de entorno**

```bash
# Backend: backend/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/barmentech_dev"
JWT_SECRET="your-secret-key"
SPACES_ENDPOINT="https://nyc3.digitaloceanspaces.com"
SPACES_KEY="your-spaces-key"
SPACES_SECRET="your-spaces-secret"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email"
SMTP_PASS="your-password"

# Frontend: frontend-next/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### **4. Setup de base de datos**

```bash
cd backend

# Generar Prisma Client
pnpm prisma:generate

# Ejecutar migraciones
pnpm prisma:migrate:dev

# Seed inicial (crea tenant de prueba + usuarios)
pnpm prisma:seed
```

### **5. Iniciar servidores de desarrollo**

```bash
# Terminal 1 - Backend
cd backend
pnpm start:dev
# → http://localhost:3001

# Terminal 2 - Frontend
cd frontend-next
pnpm dev
# → http://localhost:3000
```

### **6. Login de prueba**

```
Email: admin@lucitour.com
Password: admin123
```

---

## 🌐 Ambientes

| Ambiente | Branch | URL | Database | Deploy |
|----------|--------|-----|----------|--------|
| **Production** | `main` | [agenciasdeviaje.barmentech.com](https://agenciasdeviaje.barmentech.com) | `db-prod` | Auto (Vercel) |
| **Staging** | `staging` | [staging.agenciasdeviaje.barmentech.com](https://staging.agenciasdeviaje.barmentech.com) | `db-staging` | Auto (Vercel) |
| **Development** | `develop` | [dev.agenciasdeviaje.barmentech.com](https://dev.agenciasdeviaje.barmentech.com) | `db-dev` | Auto (Vercel) |
| **Local** | cualquiera | localhost:3000 | `db-local` | Manual |

**Deploy automático**: Push a cualquier branch → Deploy automático en Vercel

---

## 📁 Estructura del Proyecto

```
barmentech-agenciasdeviajesystem-saas/
│
├── backend/                      # API NestJS
│   ├── src/
│   │   ├── auth/                # JWT authentication
│   │   ├── billing/             # Facturación y abonos
│   │   ├── contracts/           # Contratos y firmas
│   │   ├── payment-verification/ # Verificación de pagos
│   │   ├── travel-packages/     # Paquetes de viaje
│   │   ├── exchange-rate/       # Tipos de cambio
│   │   ├── company-bank-accounts/ # Cuentas bancarias
│   │   └── prisma/              # Database service
│   │
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema
│   │   ├── migrations/          # DB migrations
│   │   └── seed.ts              # Seed data
│   │
│   └── package.json
│
├── frontend-next/                # Next.js App
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── admin/           # Admin pages
│   │   │   ├── billing/         # Billing pages
│   │   │   ├── contracts/       # Contract pages
│   │   │   └── history/         # Client history
│   │   │
│   │   ├── components/          # Reusable components
│   │   ├── features/            # Complex features
│   │   └── lib/                 # Utils & API clients
│   │
│   └── package.json
│
├── .github/
│   └── pull_request_template.md # PR template
│
├── docs/                         # Documentation
│   ├── CONTRIBUTING.md          # How to contribute
│   ├── MULTI-TENANT-SETUP.md    # Multi-tenant guide
│   ├── SECURITY-AUDIT.md        # Security checklist
│   └── PRODUCTION-CHECKLIST.md  # Production readiness
│
└── README.md                     # This file
```

---

## 🤝 Contribuir

Antes de contribuir, lee la [Guía de Contribución](./CONTRIBUTING.md).

### **Workflow rápido:**

```bash
# 1. Crear feature branch desde develop
git checkout develop
git pull origin develop
git checkout -b feature/mi-nueva-feature

# 2. Hacer cambios con commits convencionales
git add .
git commit -m "feat: add new feature"

# 3. Push y crear PR
git push origin feature/mi-nueva-feature
# → Crear PR en GitHub hacia develop
```

### **Convenciones de commits:**

- `feat:` - Nueva funcionalidad
- `fix:` - Corrección de bug
- `docs:` - Cambios en documentación
- `refactor:` - Refactorización de código
- `test:` - Agregar/modificar tests
- `chore:` - Tareas de mantenimiento

---

## 📚 Documentación

- 📖 [Guía de Contribución](./CONTRIBUTING.md)
- 🏗️ [Setup Multi-tenant](./MULTI-TENANT-SETUP.md)
- 🔒 [Auditoría de Seguridad](./SECURITY-AUDIT.md)
- ✅ [Checklist de Producción](./PRODUCTION-CHECKLIST.md)
- 🧪 [Guía de Testing](./TESTING-GUIDE.md)
- 💰 [Blueprint de Facturación](./BILLING_MVP_BLUEPRINT.md)
- 🔄 [Procesamiento de Recibos](./RECEIPT-PROCESSING-GUIDE.md)

---

## 📞 Soporte

Para soporte o preguntas:
- Abre un [Issue](https://github.com/allanbarahona-web3/barmentech-agenciasdeviajesystem-saas/issues)
- Contacta al equipo de desarrollo

---

## 📄 Licencia

Este proyecto es **propietario** y confidencial. Todos los derechos reservados.

**© 2026 BarmenTech. All rights reserved.**

---

Made with ❤️ by BarmenTech Team

Ver `backend/.env.example` para variables requeridas.
