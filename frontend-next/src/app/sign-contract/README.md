# Página Pública de Firma de Contratos

## Estado

**Completado ✅**

La página pública de firma de contratos utiliza exclusivamente **Next.js App Router**.

Toda la implementación anterior basada en HTML fue eliminada durante el proceso de refactorización, dejando una única implementación para el flujo público de firma.

---

# Arquitectura

```
src/app/sign-contract/
├── layout.tsx
├── page.tsx
├── SignatureCanvas.tsx
└── styles.css

src/lib/
└── public-signing-api.ts
```

---

# Funcionalidad

La página implementa el flujo completo de firma pública:

* Carga de sesión de firma mediante token.
* Visualización del contrato.
* Marcado del contrato como leído.
* Captura de firma mediante canvas.
* Envío de la firma al backend.
* Confirmación de firma.
* Manejo de errores y expiración de enlaces.

---

# Estados de la Página

* Loading
* Error
* Read
* Sign
* Success

Toda la navegación entre estados es administrada mediante React State.

---

# Canvas de Firma

El componente `SignatureCanvas.tsx` implementa:

* Pointer Events (mouse + touch)
* Limpieza del canvas
* Detección de firma vacía
* Recorte automático de la firma (`findInkBounds`)
* Exportación PNG Base64

El algoritmo fue preservado durante el refactor para mantener exactamente el mismo comportamiento de la implementación original.

---

# Comunicación con Backend

La página consume únicamente los endpoints públicos existentes:

```
GET
/contracts/public/signing-session

POST
/contracts/public/mark-viewed

POST
/contracts/public/finalize-signature
```

No fue necesario modificar el backend.

---

# Configuración

Toda la resolución del backend utiliza exclusivamente:

```
runtime-config.ts
```

mediante:

```
resolveApiBase()
```

No existen mecanismos alternativos de configuración.

---

# Flujo de Firma

```
Usuario abre enlace

        │

        ▼

Obtiene sesión de firma

        │

        ▼

Visualiza contrato

        │

        ▼

Marca contrato como leído

        │

        ▼

Firma en canvas

        │

        ▼

Envía firma

        │

        ▼

Backend registra firma

        │

        ▼

Generación de PDF

        │

        ▼

Correos automáticos

        │

        ▼

Confirmación al usuario
```

---

# Testing Local

Configurar:

```
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

Levantar frontend:

```bash
cd frontend-next
pnpm dev
```

Abrir:

```
http://localhost:3000/sign-contract?token=TOKEN
```

---

# Validaciones Realizadas

## Local

* Build de producción
* Lectura del contrato
* Canvas de firma
* Registro de firma
* Generación de PDF
* Correo final
* Bloqueo de segunda firma

## DEV

Validado con contratos reales:

* Crear contrato
* Aprobar pago
* Enviar correo
* Abrir enlace
* Leer contrato
* Firmar
* Generación de PDF
* Envío de correos
* Flujo con múltiples firmantes

---

# Arquitectura Final

La implementación pública de firma utiliza únicamente:

```
/sign-contract
        │
        ▼
Next.js App Router
        │
        ▼
public-signing-api.ts
        │
        ▼
runtime-config.ts
```

---

# Deuda Técnica Eliminada

El proceso de refactor eliminó completamente:

* `public/sign-contract.html`
* `public/sign-contract.v3.js`
* `public/sign-contract.v3.css`
* `public/config.js`
* `window.__APP_ENV__`
* `next.config.ts` rewrite hacia `sign-contract.html`

No existe código duplicado ni múltiples implementaciones para la página pública de firma.

---

# Restricciones Cumplidas

* No se modificó el backend.
* No se modificó Prisma.
* No se modificó la API pública.
* No se modificó la base de datos.
* Se mantuvo el comportamiento funcional del flujo original.

---

# Estado Final

**Implementación finalizada.**

La página pública de firma utiliza una única implementación basada en Next.js App Router y una única estrategia de resolución del backend mediante `runtime-config.ts`.
