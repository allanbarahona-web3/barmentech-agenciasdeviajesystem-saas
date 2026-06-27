# Página Pública de Firma - Nueva Implementación Next.js

## Sprint 2 - Implementación Completada

Esta es la nueva implementación de la página pública de firma de contratos utilizando Next.js.

## Archivos Creados

```
src/app/sign-contract/
├── layout.tsx              # Layout sin navegación (página pública)
├── page.tsx                # Componente principal con todos los estados
├── SignatureCanvas.tsx     # Componente del canvas de firma
└── styles.css              # Estilos reutilizados de sign-contract.v3.css

src/lib/
└── public-signing-api.ts   # Cliente API para los 3 endpoints públicos
```

## Funcionalidad Implementada

✅ **Estado Loading** - Carga inicial del contrato  
✅ **Estado Error** - Manejo de errores con variantes (token inválido, expirado, etc.)  
✅ **Estado Read** - Visualización del contrato en iframe  
✅ **Estado Sign** - Canvas de firma con eventos touch/pointer  
✅ **Estado Success** - Confirmación de firma exitosa  
✅ **Canvas de firma** - Reutiliza algoritmo exacto de sign-contract.v3.js  
✅ **Integración API** - Consume los 3 endpoints existentes  
✅ **Configuración** - Usa `runtime-config.ts` y `resolveApiBase()`  

## Lógica Reutilizada

Del archivo `public/sign-contract.v3.js`:

- ✅ Algoritmo `findInkBounds` (recorte automático de firma)
- ✅ Sistema de eventos pointer (down, move, up, leave, cancel)
- ✅ Exportación a PNG base64
- ✅ Validaciones de firma vacía
- ✅ Flujo completo de estados
- ✅ Manejo de errores

## Testing Local

### 1. Configurar Variable de Entorno

Asegúrate de tener en `.env.local`:

```bash
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

O para subdominios:
```bash
NEXT_PUBLIC_API_BASE=http://almanova.localhost:3001
```

### 2. Iniciar Servidor de Desarrollo

```bash
cd frontend-next
pnpm dev
```

### 3. Obtener un Token de Prueba

**Opción A:** Genera un contrato desde el dashboard y copia el enlace de firma del correo.

**Opción B:** Obtén un token directamente desde la base de datos (desarrollo).

### 4. Abrir la Página

```
http://localhost:3000/sign-contract?token=PASTE_TOKEN_HERE
```

## Flujo Completo

```
1. Usuario abre URL con token
   ↓
2. GET /contracts/public/signing-session
   ↓
3. Muestra contrato en iframe
   ↓
4. Usuario presiona "Firmar contrato"
   ↓
5. POST /contracts/public/mark-viewed (non-blocking)
   ↓
6. Muestra canvas de firma
   ↓
7. Usuario dibuja firma
   ↓
8. Usuario presiona "Enviar firma"
   ↓
9. POST /contracts/public/finalize-signature
   ↓
10. Muestra confirmación de éxito
```

## Diferencias con Implementación HTML

| Aspecto | HTML Original | Nueva Implementación Next.js |
|---------|---------------|------------------------------|
| Configuración | `config.js` (fallido) | `runtime-config.ts` (funcional) |
| Routing | `/sign-contract.html` | `/sign-contract` |
| Framework | Vanilla JS | React + Next.js |
| Estados | Manipulación DOM directa | React state management |
| Canvas | Eventos globales | Eventos React |
| Estilos | CSS global | CSS importado en ruta |

## Ventajas de la Nueva Implementación

✅ Reutiliza `runtime-config.ts` (única fuente de verdad)  
✅ No depende de `window.__APP_ENV__` (que nunca existió)  
✅ TypeScript con tipos seguros  
✅ Mejor mantenibilidad  
✅ Misma UX/UI  
✅ No requiere cambios en backend  

## Problemas Conocidos

Ninguno detectado todavía. Requiere testing con tokens reales.

## Pendientes para Sprint 3

- [ ] Testing con tokens reales en todos los estados
- [ ] Validación en móviles (iOS Safari, Android Chrome)
- [ ] Testing responsive en diferentes tamaños
- [ ] Validación de canvas en dispositivos touch
- [ ] Performance testing (bundle size, tiempo de carga)
- [ ] Actualizar backend para generar URLs a `/sign-contract` en lugar de `.html`
- [ ] Deprecación gradual de archivos HTML legacy

## Restricciones Cumplidas

✅ **NO se modificó Backend** - Solo consumo de endpoints existentes  
✅ **NO se modificó Prisma** - Base de datos intacta  
✅ **NO se modificaron endpoints** - Mismos contratos de API  
✅ **NO se eliminó HTML** - Ambas implementaciones conviven  
✅ **Estructura simple** - Sin sobre-arquitecturizar  

## Notas Técnicas

- Canvas usa Pointer Events (compatibilidad touch + mouse)
- Algoritmo de recorte es pixel-perfect del original
- Estados UI mapean exactamente a los del HTML
- Errores se categorizan para mostrar mensajes específicos
- Layout sin navegación vertical (página completamente pública)

---

**Implementado en:** Sprint 2  
**Fecha:** 27 de junio de 2026  
**Estado:** Funcional - Pendiente testing con tokens reales
