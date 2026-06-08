# Plan de Implementación: Viajes Programados

## Principio Guía
**No romper el formulario actual de contratos.** Todos los cambios son aditivos y retrocompatibles.

---

## Flujo General del Agente

```
Login
  ↓
Marcar Reloj (timeclock - feature futuro)
  ↓
Página de Viajes /trips  ← HOME del agente
  ↓
Seleccionar viaje disponible
  ↓
Formulario de contrato /contracts/new?travelPackageId=xxx
  (fechas prellenadas y bloqueadas, resto del flujo igual al actual)
  ↓
Contrato generado y vinculado al viaje
```

**Para contratos personalizados (sin viaje programado):**
```
Formulario de contrato /contracts/new  ← sin parámetro
  (formulario idéntico al actual, fechas libres)
```

---

## URLs del Sistema

```
/trips                              → Página de viajes (HOME del agente)
/trips/:id                          → Detalle de un viaje (participantes, etc.) - fase futura
/contracts/new?travelPackageId=xxx  → Formulario con viaje preseleccionado (fechas bloqueadas)
/contracts/new                      → Formulario libre (contrato personalizado, flujo actual)
/admin/travel-packages              → Gestión de viajes (solo ADMIN)
```

---

## Fase 1: Base de Datos (Migración)

### Nuevas tablas:

**`TravelPackage` (el viaje en sí):**
- `id` - PK
- `name` - nombre del viaje (ej: "Tour Costa Rica Mayo 2026")
- `destination` - destino
- `departureDate` - fecha de salida
- `returnDate` - fecha de retorno
- `capacity` - capacidad máxima de personas
- `occupiedSlots` - personas actualmente asignadas (se actualiza automáticamente)
- `status` - `OPEN` | `CLOSED` | `CANCELLED`
- `createdByUserId` - quien lo creó
- `createdAt`, `updatedAt`

### Cambios a tabla `Contract` (solo agregar columnas, no modificar nada existente):
- `contractType` - `SCHEDULED` | `CUSTOM` (default: `CUSTOM` para no romper contratos existentes)
- `travelPackageId` - FK opcional a `TravelPackage` (null si es CUSTOM)
- `participantCount` - número de personas de este contrato que cuentan al cupo (titular + acompañantes)

### Regla de migración:
- Todos los contratos existentes → `contractType = "CUSTOM"`, `travelPackageId = null`
- Sin impacto en datos actuales

---

## Fase 2: Backend - API de Viajes

### Nuevo módulo: `travel-packages`

**Endpoints:**
```
POST   /travel-packages              → Crear viaje (ADMIN)
GET    /travel-packages              → Listar todos los viajes (ADMIN, AGENT, OPERATIONS)
GET    /travel-packages/available    → Solo viajes OPEN con cupo disponible (AGENT)
GET    /travel-packages/:id          → Detalle de un viaje
PATCH  /travel-packages/:id          → Editar viaje (ADMIN) - con validación de capacidad
DELETE /travel-packages/:id          → Cancelar viaje (ADMIN) - soft delete
```

**Lógica de validación al editar capacidad:**
- Si `nuevaCapacidad < occupiedSlots` → error: "No puedes reducir la capacidad por debajo de las personas ya asignadas (X personas)"
- Si `nuevaCapacidad === occupiedSlots` → el viaje pasa a `CLOSED` automáticamente

**Lógica al vincular contrato con viaje:**
- Validar que el viaje esté `OPEN`
- Validar que `occupiedSlots + participantCount <= capacity`
- Actualizar `occupiedSlots` con `+= participantCount`
- Si `occupiedSlots === capacity` → cambiar status a `CLOSED`

---

## Fase 3: Backend - Modificar Contratos (con cuidado)

### Cambios mínimos y seguros al endpoint de crear contrato:

1. Recibir campo opcional `travelPackageId` en el DTO
2. Recibir campo `contractType` (`SCHEDULED` | `CUSTOM`)
3. Si `contractType === "SCHEDULED"`:
   - Validar que `travelPackageId` existe y está `OPEN`
   - Calcular `participantCount` = 1 titular + N acompañantes del payload
   - Actualizar `occupiedSlots` del viaje en la misma transacción `$transaction`
4. Si `contractType === "CUSTOM"`:
   - Comportamiento **idéntico al actual**, sin cambios

**Importante:** Todo dentro de `$transaction` para garantizar atomicidad. Si el contrato falla, el cupo no se resta.

---

## Fase 4: Frontend Admin - Viajes Programados

### Nueva página: `/admin/travel-packages`

**UI:**
- Grid de tarjetas de viaje
- Cada tarjeta muestra:
  - Nombre del viaje
  - Destino
  - Fechas (salida / retorno)
  - Barra de progreso: `occupiedSlots / capacity`
    - Verde (0-60%) → Amarillo (61-85%) → Rojo (86-100%)
    - "X de Y personas" como texto
  - Badge de status: `ABIERTO` (verde) | `LLENO` (rojo) | `CANCELADO` (gris)
- Botón "Nuevo Viaje"
- Botón "Editar" en cada tarjeta (admin)

**Modal Crear/Editar:**
- Nombre del viaje
- Destino
- Fecha de salida (date picker)
- Fecha de retorno (date picker)
- Capacidad (número)
- Precio  se debe actualiza manualmente. eb esta parte es importante discutir un poco, porque se alimena desde una tabla aparte de costos  fijos y variables. 
- status=  Active check verde, stand by Naranja, inactive  Rojo, 
- Al editar: validación si nueva capacidad < ocupados actuales

---

## Fase 5: Frontend Agente - Página de Viajes (Home)

### Nueva página: `/trips` — HOME del agente tras login

**Esta es la primera pantalla que ve el agente después de marcar el reloj  cuando el modulo timeclock este implementado, por ahora sera la primera pantalla que veran al ingresar del login.**

**Cabecera de la página:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ✈ Viajes Disponibles                                            │
│                                                                  │
│  [✏ Viaje Personalizado]   [📋 Solicitud de Cotización]         │
│   → → Modal "Próximamente"          → Modal "Próximamente"               │
└──────────────────────────────────────────────────────────────────┘
```

- **Botón "Viaje Personalizado":** visible pero deshabilitado → muestra modal/tooltip "Módulo en construcción
- **Botón "Solicitud de Cotización":** visible pero deshabilitado → muestra modal/tooltip "Módulo en construcción — Próximamente" (fase futura con rol VENTAS)

**Grid de tarjetas:**
- Todos los viajes: `OPEN` primero, `CLOSED` al final
- Cada tarjeta muestra:
  - Nombre del viaje
  - Destino
  - Fechas (salida / retorno)
  - Barra de progreso: `occupiedSlots / capacity`
    - Verde (0-60%) → Amarillo (61-85%) → Rojo (86-100%)
    - "X de Y personas" como texto
  - Badge de status: `ABIERTO` (verde) | `LLENO` (rojo) | `CANCELADO` (gris)
- Filtros opcionales: por destino, por fecha, por disponibilidad
- Tarjetas `OPEN` son clickeables → redirige a `/contracts/new?travelPackageId=xxx`
- Tarjetas `CLOSED` o `CANCELLED` se muestran pero no son clickeables

**Al seleccionar un viaje:**
- Redirige a `/contracts/new?travelPackageId=xxx`
- El formulario de contratos detecta el parámetro y prelleana fechas automáticamente

---

## Fase 6: Frontend Formulario de Contratos - Cambio Mínimo

### Cambio en `/contracts/new` (mínimo y seguro):

**Si llega con `?travelPackageId=xxx` en la URL:**
1. Fetch del viaje para obtener fechas y nombre
2. `startDate` y `endDate` se llenan automáticamente → campos **deshabilitados**
3. Se muestra badge del viaje seleccionado: "✈ Tour Costa Rica Mayo 2026 — 12 cupos disponibles"
4. El resto del formulario funciona **exactamente igual que hoy**
5. Al guardar: `contractType = "SCHEDULED"`, `travelPackageId` incluido en el payload

**Si llega SIN `?travelPackageId` (contrato personalizado):**
- Formulario **idéntico al actual**, sin ningún cambio visible
- `contractType = "CUSTOM"`, `travelPackageId = null`
- Fechas editables normalmente

---

## Orden de Implementación Recomendado

```
1. Migración de BD (Fase 1)               ← sin riesgo, solo agrega columnas
2. Módulo backend travel-packages (Fase 2) ← nuevo módulo, no toca nada existente
3. Frontend Admin - CRUD de viajes (Fase 4)← nueva página, no toca nada existente
4. Frontend Agente - Página /trips (Fase 5)← nueva página, no toca nada existente
5. Modificar endpoint de contratos (Fase 3)← aquí está el mayor riesgo, hacerlo con cuidado
6. Ajuste mínimo en formulario (Fase 6)   ← solo leer URL param y prellenar fechas
```

---

## Puntos de Riesgo y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Romper formulario actual de contratos | Switch default = "Personalizado" → flujo actual intacto |
| Race condition: dos agentes reservan el último cupo | `$transaction` + validación atómica en DB |
| Contratos existentes sin viaje | `contractType = CUSTOM` por defecto en migración |
| Cupo incorrecto si contrato falla | Todo en `$transaction`, si falla el contrato, el cupo no se modifica |
| Admin reduce capacidad por debajo de ocupados | Validación server-side antes de guardar |

---

## Roles del Sistema

### Roles actuales:
| Rol | Acceso |
|-----|--------|
| `ADMIN` | Todo: usuarios, viajes, contratos, facturación |
| `AGENT` | Página `/trips`, crear contratos |
| `CONTADOR` | Facturación y pagos |

### Roles futuros (preparar en BD, activar en fases posteriores):
| Rol | Propósito | Fase |
|-----|-----------|------|
| `OPERATIONS` | Ver participantes por viaje, coordinación logística | Fase siguiente |
| `VENTAS` | Solicitudes de cotización, pre-propuestas | Fase posterior |
| `FACTURACION` | Módulo de facturación dedicado (separado de CONTADOR) | Fase posterior |

### Plan para roles futuros:
- Agregar los valores a la tabla `User.role` en el enum/schema desde ahora
- Los botones "Solicitud de Cotización" ya están en la UI con estado "Próximamente"
- Cuando llegue la fase, solo se activa el backend y se habilita el botón
- Sin rediseño de UI ni migraciones complejas
