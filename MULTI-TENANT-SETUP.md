# 🏢 Setup Multi-Empresa: Lucitours + Alma Nova

**Fecha:** 30 de abril de 2026  
**Estrategia:** Monorepo con configuración por empresa

---

## 📋 Arquitectura Elegida

### **1 Repo → 2 Deployments**

```
contratos-system (GitHub)
    ↓
    ├─→ Deploy Lucitours  (Vercel + DigitalOcean)
    └─→ Deploy Alma Nova  (Vercel + DigitalOcean)
```

**Principio:** 
- ✅ Código compartido en `src/`
- ✅ Configuración por empresa en `.env.{empresa}.production`
- ✅ Branding por empresa en `themes/` y `public/assets/{empresa}/`
- ✅ Deploy automático con GitHub Actions

---

## 🛠️ Implementación

### **PASO 1: Preparar Backend para Multi-Empresa**

#### **A. Crear archivos de entorno por empresa**

```bash
cd backend

# Copiar .env actual como template
cp .env .env.lucitours.production
cp .env .env.almanova.production
```

**Editar `.env.lucitours.production`:**

```bash
# Database
DATABASE_URL="postgresql://user:pass@lucitours-db.ondigitalocean.com:25060/lucitours?sslmode=require"

# DigitalOcean Spaces
DO_SPACES_ENDPOINT=sfo3.digitaloceanspaces.com
DO_SPACES_REGION=sfo3
DO_SPACES_BUCKET=lucitours-operations
DO_SPACES_KEY=XXXXX
DO_SPACES_SECRET=XXXXX

# JWT
JWT_SECRET=lucitours_jwt_secret_32_chars_min

# Email (Resend)
RESEND_API_KEY=re_XXXXX
RESEND_FROM_EMAIL=contratos@lucitour.com
RESEND_FROM_NAME=Viajes Lucitours

# OpenAI
OPENAI_API_KEY=sk-proj-XXXXX

# App URLs
PUBLIC_APP_BASE_URL=https://contratos.lucitour.com
ALLOWED_ORIGIN=https://contratos.lucitour.com

# Environment
NODE_ENV=production
COMPANY_NAME=Lucitours
COMPANY_BRAND=lucitours
```

**Editar `.env.almanova.production`:**

```bash
# Database
DATABASE_URL="postgresql://user:pass@almanova-db.ondigitalocean.com:25060/almanova?sslmode=require"

# DigitalOcean Spaces
DO_SPACES_ENDPOINT=sfo3.digitaloceanspaces.com
DO_SPACES_REGION=sfo3
DO_SPACES_BUCKET=almanova-operations
DO_SPACES_KEY=XXXXX
DO_SPACES_SECRET=XXXXX

# JWT
JWT_SECRET=almanova_jwt_secret_32_chars_min

# Email (Resend)
RESEND_API_KEY=re_XXXXX
RESEND_FROM_EMAIL=contratos@almanova.com
RESEND_FROM_NAME=Viajes Alma Nova

# OpenAI
OPENAI_API_KEY=sk-proj-XXXXX

# App URLs
PUBLIC_APP_BASE_URL=https://contratos.almanova.com
ALLOWED_ORIGIN=https://contratos.almanova.com

# Environment
NODE_ENV=production
COMPANY_NAME=Alma Nova
COMPANY_BRAND=almanova
```

#### **B. Modificar código para usar branding dinámico**

**Crear archivo de configuración por empresa:**

```typescript
// backend/src/config/company-branding.ts

export interface CompanyBranding {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  logo: string;
  colors: {
    primary: string;
    secondary: string;
  };
}

export const COMPANY_CONFIGS: Record<string, CompanyBranding> = {
  lucitours: {
    name: 'Viajes Lucitours',
    legalName: 'VIAJES LUCITOURS TURISMO INTERNACIONAL S.A.',
    email: 'contratos@lucitour.com',
    phone: '+506 2222-3333',
    website: 'https://lucitour.com',
    logo: '/assets/lucitours/logo.png',
    colors: {
      primary: '#8b5cf6',  // Morado
      secondary: '#a855f7',
    },
  },
  almanova: {
    name: 'Viajes Alma Nova',
    legalName: 'VIAJES ALMA NOVA S.A.',
    email: 'contratos@almanova.com',
    phone: '+506 4444-5555',
    website: 'https://almanova.com',
    logo: '/assets/almanova/logo.png',
    colors: {
      primary: '#3b82f6',  // Azul
      secondary: '#60a5fa',
    },
  },
};

export function getCurrentCompanyBranding(): CompanyBranding {
  const brand = process.env.COMPANY_BRAND || 'lucitours';
  return COMPANY_CONFIGS[brand] || COMPANY_CONFIGS.lucitours;
}
```

**Usar en servicios:**

```typescript
// backend/src/billing/billing.service.ts

import { getCurrentCompanyBranding } from '../config/company-branding';

export class BillingService {
  // ...
  
  async sendReceiptEmail(receipt: Receipt) {
    const company = getCurrentCompanyBranding();
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: company.email,  // ← Dinámico por empresa
      to: [clientEmail],
      subject: `Recibo #${receipt.receiptNumber} - ${company.name}`,  // ← Dinámico
      html: `
        <div>
          <img src="${company.logo}" alt="${company.name}" />
          <h1>Recibo Aprobado</h1>
          <p>Gracias por su pago a ${company.name}</p>
          <footer>
            ${company.legalName}<br>
            ${company.phone} | ${company.email}
          </footer>
        </div>
      `,
    });
  }
}
```

---

### **PASO 2: Preparar Frontend para Multi-Empresa**

#### **A. Crear archivos de entorno por empresa**

```bash
cd frontend-next

# Crear envs de producción
cp .env.local .env.lucitours.production
cp .env.local .env.almanova.production
```

**Editar `.env.lucitours.production`:**

```bash
NEXT_PUBLIC_API_BASE_URL=https://lucitours-api.ondigitalocean.app
NEXT_PUBLIC_COMPANY_BRAND=lucitours
NEXT_PUBLIC_COMPANY_NAME=Viajes Lucitours
```

**Editar `.env.almanova.production`:**

```bash
NEXT_PUBLIC_API_BASE_URL=https://almanova-api.ondigitalocean.app
NEXT_PUBLIC_COMPANY_BRAND=almanova
NEXT_PUBLIC_COMPANY_NAME=Viajes Alma Nova
```

#### **B. Crear sistema de theming**

```typescript
// frontend-next/src/themes/index.ts

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  logo: string;
  favicon: string;
}

export const THEMES: Record<string, Theme> = {
  lucitours: {
    name: 'Lucitours',
    colors: {
      primary: '#8b5cf6',    // Morado
      secondary: '#a855f7',
      accent: '#c084fc',
    },
    logo: '/assets/lucitours/logo.png',
    favicon: '/assets/lucitours/favicon.ico',
  },
  almanova: {
    name: 'Alma Nova',
    colors: {
      primary: '#3b82f6',    // Azul
      secondary: '#60a5fa',
      accent: '#93c5fd',
    },
    logo: '/assets/almanova/logo.png',
    favicon: '/assets/almanova/favicon.ico',
  },
};

export function getCurrentTheme(): Theme {
  const brand = process.env.NEXT_PUBLIC_COMPANY_BRAND || 'lucitours';
  return THEMES[brand] || THEMES.lucitours;
}
```

**Usar en componentes:**

```typescript
// frontend-next/src/components/header.tsx

import { getCurrentTheme } from '@/themes';

export function Header() {
  const theme = getCurrentTheme();
  
  return (
    <header style={{ backgroundColor: theme.colors.primary }}>
      <img src={theme.logo} alt={theme.name} />
      <h1>{theme.name}</h1>
    </header>
  );
}
```

#### **C. Organizar assets por empresa**

```bash
frontend-next/public/
├── assets/
│   ├── lucitours/
│   │   ├── logo.png
│   │   ├── logo-white.png
│   │   ├── favicon.ico
│   │   └── email-header.png
│   └── almanova/
│       ├── logo.png
│       ├── logo-white.png
│       ├── favicon.ico
│       └── email-header.png
└── config.js
```

---

### **PASO 3: Scripts de Deploy por Empresa**

#### **A. Script de deploy backend**

```bash
# scripts/deploy-backend-lucitours.sh

#!/bin/bash
set -e

echo "🚀 Deploying Backend: LUCITOURS"

# 1. Copiar env específico
cp backend/.env.lucitours.production backend/.env

# 2. Build
cd backend
npm install
npm run build

# 3. Run migrations
npx prisma migrate deploy

echo "✅ Backend Lucitours deployed"
```

```bash
# scripts/deploy-backend-almanova.sh

#!/bin/bash
set -e

echo "🚀 Deploying Backend: ALMA NOVA"

# 1. Copiar env específico
cp backend/.env.almanova.production backend/.env

# 2. Build
cd backend
npm install
npm run build

# 3. Run migrations
npx prisma migrate deploy

echo "✅ Backend Alma Nova deployed"
```

#### **B. Script de deploy frontend**

```bash
# scripts/deploy-frontend-lucitours.sh

#!/bin/bash
set -e

echo "🚀 Deploying Frontend: LUCITOURS"

# 1. Copiar env específico
cp frontend-next/.env.lucitours.production frontend-next/.env.production

# 2. Build
cd frontend-next
npm install
npm run build

echo "✅ Frontend Lucitours ready for deploy"
```

---

### **PASO 4: GitHub Actions para Deploy Automático**

```yaml
# .github/workflows/deploy-lucitours.yml

name: Deploy Lucitours

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'frontend-next/**'
      - '.env.lucitours.*'

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Deploy to DigitalOcean
        run: |
          ./scripts/deploy-backend-lucitours.sh
        env:
          DATABASE_URL: ${{ secrets.LUCITOURS_DATABASE_URL }}
          DO_SPACES_KEY: ${{ secrets.LUCITOURS_SPACES_KEY }}
          DO_SPACES_SECRET: ${{ secrets.LUCITOURS_SPACES_SECRET }}
          JWT_SECRET: ${{ secrets.LUCITOURS_JWT_SECRET }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.LUCITOURS_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./frontend-next
```

```yaml
# .github/workflows/deploy-almanova.yml

name: Deploy Alma Nova

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'frontend-next/**'
      - '.env.almanova.*'

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Deploy to DigitalOcean
        run: |
          ./scripts/deploy-backend-almanova.sh
        env:
          DATABASE_URL: ${{ secrets.ALMANOVA_DATABASE_URL }}
          DO_SPACES_KEY: ${{ secrets.ALMANOVA_SPACES_KEY }}
          DO_SPACES_SECRET: ${{ secrets.ALMANOVA_SPACES_SECRET }}
          JWT_SECRET: ${{ secrets.ALMANOVA_JWT_SECRET }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.ALMANOVA_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./frontend-next
```

---

## 🔄 Workflow Diario

### **Escenario 1: Cambio que aplica a AMBAS empresas**

```bash
# 1. Hacer cambios en código compartido
vim backend/src/contracts/contracts.service.ts

# 2. Commit + Push
git add .
git commit -m "feat: agregar validación de fechas en contratos"
git push origin main

# 3. GitHub Actions despliega AUTOMÁTICAMENTE a:
#    - Lucitours (con su config/branding)
#    - Alma Nova (con su config/branding)
```

✅ **1 commit → 2 empresas actualizadas**

---

### **Escenario 2: Cambio SOLO para Lucitours**

```bash
# 1. Modificar archivo específico de Lucitours
vim backend/.env.lucitours.production
# Cambiar: RESEND_FROM_EMAIL=nuevo@lucitour.com

# 2. Commit + Push
git add backend/.env.lucitours.production
git commit -m "config: cambiar email Lucitours"
git push origin main

# 3. GitHub Actions despliega SOLO Lucitours
#    (porque el workflow tiene path filter)
```

✅ **Solo afecta a Lucitours**

---

### **Escenario 3: Personalización de branding**

```bash
# 1. Modificar theme de Alma Nova
vim frontend-next/src/themes/index.ts
# Cambiar color primary de Alma Nova

# 2. Commit + Push
git add frontend-next/src/themes/index.ts
git commit -m "style: actualizar color primario Alma Nova"
git push origin main

# 3. Ambas empresas se rebuildan
#    - Lucitours usa su theme (sin cambios)
#    - Alma Nova usa nuevo color
```

✅ **Código compartido, resultado diferente por tema**

---

## 🎯 Ventajas de Esta Arquitectura

| Aspecto | Repos Separados | Monorepo (Esta solución) |
|---------|----------------|--------------------------|
| **Sincronizar cambios** | Manual (cherry-pick) | Automático (1 commit) |
| **Deploy ambas empresas** | 2 comandos | 1 push |
| **Ver diferencias** | Difícil | Git diff claro |
| **Personalizar por empresa** | Fácil | Fácil (themes + env) |
| **Escalar a empresa 3** | Clonar repo de nuevo | Agregar .env + theme |
| **Mantenimiento** | 2x trabajo | 1x trabajo |

---

## 📊 Comparación de Opciones

### **Opción A: Repos Separados** (Tu idea original)

```bash
# Flujo de trabajo:
1. Cambio en lucitours-contratos
2. git commit + push
3. git cherry-pick abc123 (copiar commit)
4. cd ../almanova-contratos
5. git cherry-pick abc123
6. git push

# Resultado: 6 pasos para sincronizar
```

### **Opción B: Monorepo** (Esta guía)

```bash
# Flujo de trabajo:
1. Cambio en contratos-system
2. git commit + push

# Resultado: 2 pasos, ambas empresas actualizadas
```

---

## 🚀 Plan de Migración

### **AHORA (Repo actual → Monorepo)**

```bash
# 1. Renombrar repo actual
# GitHub: contratoslucitour-temp → contratos-system

# 2. Crear estructura
mkdir -p frontend-next/public/assets/{lucitours,almanova}
mkdir -p scripts

# 3. Crear archivos de config
touch backend/.env.lucitours.production
touch backend/.env.almanova.production
touch frontend-next/.env.lucitours.production
touch frontend-next/.env.almanova.production

# 4. Crear system de theming
touch frontend-next/src/themes/index.ts
touch backend/src/config/company-branding.ts

# 5. Crear scripts de deploy
touch scripts/deploy-backend-lucitours.sh
touch scripts/deploy-backend-almanova.sh
touch scripts/deploy-frontend-lucitours.sh
touch scripts/deploy-frontend-almanova.sh

# 6. Crear GitHub Actions
mkdir -p .github/workflows
touch .github/workflows/deploy-lucitours.yml
touch .github/workflows/deploy-almanova.yml
```

### **DESPUÉS (Deploy infraestructura)**

```bash
# Para Lucitours (ya existe):
# ✅ Vercel: contratos.lucitour.com
# ✅ DO App: Actualizar con nuevo env

# Para Alma Nova (crear nuevo):
# 1. DigitalOcean: Crear DB almanova-contratos-prod
# 2. DigitalOcean: Crear App almanova-api-prod
# 3. Vercel: Crear proyecto almanova-contratos
# 4. DNS: Configurar contratos.almanova.com
```

---

## 🎓 Respuesta a tu Pregunta

> "¿Cómo haríamos para que cuando ya tengamos más cambios se vean reflejados en ambas empresas?"

**Con Monorepo:** 
```bash
git commit -m "feat: nueva funcionalidad"
git push
# ✅ Automáticamente desplegado en ambas empresas
```

**Con Repos Separados:**
```bash
# Repo 1:
git commit -m "feat: nueva funcionalidad"
git push

# Repo 2:
cd ../almanova
git cherry-pick abc123
git push

# ❌ Manual, propenso a errores
```

---

## 📋 Próximos Pasos

1. ✅ Leer esta guía completa
2. ✅ Decidir: ¿Monorepo o Repos Separados?
3. ✅ Si eliges Monorepo: Implementar pasos de migración
4. ✅ Crear infraestructura de Alma Nova (DB, App, Vercel)
5. ✅ Configurar GitHub Actions
6. ✅ Deploy de prueba

---

**¿Quieres que implemente el setup del monorepo ahora?** 

Puedo crear todos los archivos necesarios:
- Sistema de theming
- Configuración por empresa
- Scripts de deploy
- GitHub Actions

¿Vamos con eso? 🚀
