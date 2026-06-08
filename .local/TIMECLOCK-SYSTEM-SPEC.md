# 🕒 Sistema de Planillas - Especificación Completa

**Proyecto**: Viajes Alma Nova - Sistema de Control de Tiempo  
**Fecha**: 22 de Abril, 2026  
**Versión**: 1.0 - MVP  

---

## � Porcentajes de Nómina - Costa Rica

**DEDUCCIONES (se retienen del salario):**
- **CCSS Empleado**: 10.83% *(se deduce en planilla)*

**APROVISIONAMIENTOS (se acumulan, NO se deducen):**
- **Aguinaldo**: 8.33% *(se paga completo en Diciembre)*
- **Cesantía**: 5.33% *(se paga al finalizar relación laboral)*
- **Vacaciones**: 4.17% *(se usa cuando empleado toma vacaciones)*

**CCSS PATRONAL (costo empleador, NO se deduce):**
- **CCSS Patrono**: 26.83% *(costo adicional del empleador)*

---

## �📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Objetivos del Sistema](#objetivos-del-sistema)
3. [Estados y Flujo de Marcaje](#estados-y-flujo-de-marcaje)
4. [Horarios y Tiempos](#horarios-y-tiempos)
5. [Lógica de Cálculos](#lógica-de-cálculos)
6. [Reglas de Negocio](#reglas-de-negocio)
7. [Bloqueo del Sistema](#bloqueo-del-sistema)
8. [Horas Extra (OT)](#horas-extra-ot)
9. [Dashboard Personal](#dashboard-personal)
10. [Panel de Administración](#panel-de-administración)
11. [Reportes y Análisis](#reportes-y-análisis)
12. [Casos Especiales](#casos-especiales)
13. [Estructura de Base de Datos](#estructura-de-base-de-datos)
14. [Fases de Implementación](#fases-de-implementación)

---

## 1. Resumen Ejecutivo

Sistema de control de tiempo y planillas para gestionar la jornada laboral de empleados con:
- Control de entrada/salida
- Registro de breaks y lunch
- Gestión de tiempo de reuniones/capacitaciones
- Control de horas extra
- Bloqueo de acceso cuando no está marcado
- Dashboard personal para cada usuario
- Reportes de productividad y tiempo efectivo

---

## 2. Objetivos del Sistema

### Objetivos Principales:
1. **Control de tiempo preciso**: Registrar todas las marcas de entrada/salida con timestamp exacto
2. **Transparencia**: Usuarios ven sus propios tiempos en tiempo real
3. **Bloqueo funcional**: Sistema se bloquea cuando no está en estado "Working" o "Meeting"
4. **Análisis de productividad**: Distinguir entre tiempo pagado y tiempo efectivo
5. **Gestión de OT**: Control de horas extra con límites configurables
6. **Auditoría completa**: Admin puede corregir errores con registro de cambios

### Beneficios:
- ✅ Automatización de planillas
- ✅ Reducción de errores de cálculo
- ✅ Visibilidad para empleados
- ✅ Control de costos laborales
- ✅ Detección de patrones de ausentismo

---

## 3. Estados y Flujo de Marcaje

### Estados Disponibles:

#### **Estados Regulares (siempre disponibles):**

| Estado | Icono | Descripción | Cuenta como pagado |
|--------|-------|-------------|-------------------|
| `WORKING` | ⚙️ | Tiempo de trabajo efectivo | ✅ Sí |
| `MEETING` | 💼 | Reuniones/capacitaciones | ✅ Sí |
| `BREAK1` | ☕ | Primer break de la jornada (15min) | ✅ Sí |
| `LUNCH` | 🍽️ | Almuerzo (60min) | ❌ No |
| `BREAK2` | ☕ | Segundo break de la jornada (15min) | ✅ Sí |
| `OFF` | 🏠 | Fin de jornada | ❌ No |

#### **Estados Especiales:**

| Estado | Icono | Descripción | Condición |
|--------|-------|-------------|-----------|
| `BREAK3` | ☕ | Break adicional | Solo si OT > 2 horas |

### Flujo Típico de un Día:

```
08:00 AM → WORKING (entrada)
          ↓
10:15 AM → BREAK1 (15 min permitido)
          ↓
10:30 AM → WORKING (regreso de break)
          ↓
12:00 PM → LUNCH (60 min permitido)
          ↓
01:00 PM → WORKING (regreso de lunch)
          ↓
03:00 PM → BREAK2 (15 min permitido)
          ↓
03:15 PM → WORKING (regreso de break)
          ↓
05:00 PM → Completa 8h efectivas
          ↓
          [Modal: ¿Activar OT?]
          ↓
          [Sí] → Continúa Working (OT)
          [No] → Marca OFF
```

### Flujo con Meeting:

```
08:00 AM → WORKING
          ↓
09:00 AM → MEETING (capacitación)
          ↓
10:30 AM → BREAK1 (puede ir directo desde Meeting)
          ↓
10:45 AM → MEETING (continúa capacitación)
          ↓
12:00 PM → LUNCH
          ↓
01:00 PM → WORKING
```

---

## 4. Horarios y Tiempos

### Horarios Generales:

| Concepto | Horario/Duración |
|----------|-----------------|
| **Disponibilidad del sistema** | 8:00 AM - 8:00 PM (Lun-Dom) |
| **Jornada regular** | 8 horas efectivas |
| **Horas extra máximas** | 4 horas por día |

### Tiempos Permitidos por Actividad:

| Actividad | Tiempo Permitido | ¿Pagado? | Exceso genera alerta |
|-----------|-----------------|----------|---------------------|
| Break 1 | 15 minutos | ✅ Sí | ⚠️ Sí (badge rojo) |
| Lunch | 60 minutos | ❌ No | ⚠️ Sí (badge amarillo) |
| Break 2 | 15 minutos | ✅ Sí | ⚠️ Sí (badge rojo) |
| Break 3 | 15 minutos | ✅ Sí (solo en OT) | ⚠️ Sí (badge rojo) |
| Working | Sin límite | ✅ Sí | - |
| Meeting | Sin límite | ✅ Sí | - |

### Ejemplo de Exceso:

```
Break1: 10:15 AM - 10:40 AM (25 minutos)
Permitido: 15 min
Exceso: 10 min
Badge: 🔴 "Excedido: 25 min"
Efecto: Se paga completo, pero se registra como "tiempo no efectivo"
```

---

## 5. Lógica de Cálculos

### 5.1 Tiempo Pagado vs Tiempo Efectivo

#### **Tiempo PAGADO** (cuenta para las 8 horas):
```
Working + Meeting + Break1 + Break2 + Break3
```

**Lunch NO se incluye** (no es tiempo pagado)

#### **Tiempo EFECTIVO** (trabajo real):
```
Working + Meeting
```

**Breaks NO se incluyen** (aunque se pagan)

### 5.2 Ejemplo de Cálculo Completo:

```
Marcas del día:
08:00 AM → Working (start)
10:00 AM → Break1 (2h working)
10:25 AM → Working (break de 25min, excedió 10min)
12:00 PM → Lunch (3h 35min working acumulado)
01:10 PM → Working (lunch de 70min, excedió 10min, pero lunch no se paga)
03:00 PM → Break2 (5h 25min working acumulado)
03:20 PM → Working (break de 20min, excedió 5min)
05:45 PM → OFF (8h working acumulado)

CÁLCULOS:
─────────────────────────────────
Tiempo PAGADO:
  Working:  8h 00min  ✅
  Break1:   25min     ✅ (excedido pero se paga)
  Break2:   20min     ✅ (excedido pero se paga)
  Lunch:    70min     ❌ (NO se paga)
  ─────────────────
  Total pagado: 8h 45min

Tiempo EFECTIVO:
  Working:  8h 00min  ✅
  Breaks:   ---       ❌ (no es tiempo efectivo)
  ─────────────────
  Total efectivo: 8h 00min

Análisis de Productividad:
  Jornada contratada: 8h
  Tiempo efectivo: 8h
  Tiempo en breaks: 45min (15min exceso)
  Eficiencia: 100% (trabajó las 8h completas)
  
Reporte de "Job Avoidance":
  ⚠️ Exceso en Break1: 10 min
  ⚠️ Exceso en Break2: 5 min
  Total excesos: 15 min de breaks
```

### 5.3 Ejemplo con Meeting:

```
08:00 AM → Working (2h)
10:00 AM → Meeting (3h) - capacitación
01:00 PM → Lunch (1h)
02:00 PM → Working (3h)
05:00 PM → OFF

CÁLCULOS:
─────────────────────────────────
Tiempo PAGADO:
  Working:  5h 00min  ✅
  Meeting:  3h 00min  ✅
  Breaks:   0h        ✅
  ─────────────────
  Total pagado: 8h 00min

Tiempo EFECTIVO:
  Working:  5h 00min  ✅
  Meeting:  3h 00min  ✅
  ─────────────────
  Total efectivo: 8h 00min

Análisis:
  Eficiencia: 100%
  Meeting time: 3h (37.5% del día en capacitación)
```

---

## 6. Reglas de Negocio

### 6.1 Orden de Marcas

#### **Reglas Estrictas (validadas por sistema):**

❌ **NO permitido:**
- Marcar `LUNCH` sin haber marcado `BREAK1` antes
- Marcar `MEETING` durante OT (solo en horario regular)
- Marcar `BREAK3` si no está en OT > 2 horas

✅ **Permitido:**
- `MEETING` → `BREAK1` → `MEETING` (directo)
- `MEETING` → `LUNCH` → `MEETING` (directo)
- `WORKING` → `BREAK1` → `WORKING` → `LUNCH` → `WORKING` (normal)
- Múltiples ciclos de `WORKING` durante el día

#### **Reglas Flexibles (no validadas, solo educación):**

⚠️ **Desaconsejado pero no bloqueado:**
- Tomar Break1 + Lunch juntos (ej: 11:45 AM - 1:00 PM)
- Es responsabilidad del usuario espaciar correctamente

### 6.2 Validación de Estados

```javascript
// Validaciones automáticas del sistema:

if (user.currentState === null && action === 'LUNCH') {
  throw Error("Debes tomar Break1 antes de Lunch");
}

if (user.currentState === 'OT' && action === 'MEETING') {
  throw Error("Meeting no permitido durante OT");
}

if (user.otTime < 120 && action === 'BREAK3') {
  throw Error("Break3 solo disponible después de 2h de OT");
}

if (user.effectiveTime >= 480 && !user.otActivated) {
  // Mostrar modal de OT
  showOtModal();
}
```

### 6.3 Estado "OFF" - Reglas Especiales

#### **OFF Flexible:**
✅ Usuario puede marcar `OFF` en **cualquier momento** (emergencias)

```
Caso 1 - Salida temprana (emergencia):
08:00 AM → Working
11:30 AM → OFF (emergencia familiar)
Total: 3h 30min pagadas

Caso 2 - Se sintió mal:
08:00 AM → Working
09:00 AM → Break1
09:15 AM → Working
10:45 AM → OFF (se fue enfermo)
Total: 2h 30min pagadas (incluyendo 15min de break)
```

#### **OFF Obligatorio:**
❌ Si completa jornada (8h efectivas) y **no marca OFF**, después de **5 minutos**:

```
[Modal automático - NO se puede cerrar]

✅ Jornada Completada

Has trabajado 8 horas efectivas.

[🚀 Activar OT (máx 4h)]  [🏠 Marcar Off]
```

### 6.4 Bloqueo durante Procesos Activos

❌ **NO puede marcar OFF si:**
- Tiene un modal/formulario abierto
- Está guardando/procesando datos
- Hay un loading activo
- Está en medio de una transacción

```javascript
// Frontend mantiene estado global
const [isProcessActive, setIsProcessActive] = useState(false);

// Botón OFF deshabilitado:
<button disabled={isProcessActive}>Marcar Off</button>

// Mensaje:
"Termina el proceso actual para marcar salida"
```

---

## 7. Bloqueo del Sistema

### 7.1 Modal de Entrada Obligatorio

Al entrar sin haber marcado `WORKING`:

```
[Modal overlay bloqueando toda la UI]

⏰ Marca tu entrada para comenzar

Para acceder al sistema, registra tu 
entrada al horario de trabajo.

[Botón: Marcar Entrada (Working)]
```

**Características:**
- No se puede cerrar el modal
- No se puede navegar a otras páginas
- Backend rechaza requests si no está en Working/Meeting
- Solo puede marcar `WORKING` o `MEETING` para empezar

### 7.2 Bloqueo Funcional durante Breaks/Lunch

Cuando usuario marca `BREAK1`, `BREAK2`, `BREAK3` o `LUNCH`:

**Frontend:**
- Overlay semi-transparente sobre toda la UI
- Mensaje: "En descanso - Sistema bloqueado"
- Solo puede marcar regreso (`WORKING` o `MEETING`)
- Contador visible: "Break1: 05:23 / 15:00"

**Backend:**
- Endpoints rechazan requests: `403 Forbidden`
- Mensaje: "Usuario en descanso, acción no permitida"
- Solo endpoints de timeclock activos

### 7.3 Estados que Permiten Trabajar

✅ Sistema desbloqueado:
- `WORKING`
- `MEETING`

❌ Sistema bloqueado:
- `BREAK1`
- `BREAK2`
- `BREAK3`
- `LUNCH`
- `OFF`
- Sin marca inicial

---

## 8. Horas Extra (OT)

### 8.1 Activación de OT

Al completar **8 horas efectivas** de trabajo:

```
[Modal automático - aparece 5 min después de completar 8h]

✅ Jornada Regular Completada

Has trabajado 8 horas efectivas.

🌙 Horas Extra Disponibles
Puedes trabajar hasta 4 horas extra hoy.

[🚀 Activar OT]  [🏠 Marcar Off]
```

### 8.2 Control de OT por Admin

**Configuración global:**
```
Panel Admin → Configuración de Planillas

☑ Habilitar Horas Extra
   Máximo por día: [4] horas
   
Si deshabilitado:
  ☐ El modal de OT no se muestra
  ☐ Solo aparece botón "Marcar Off"
```

**OT puede deshabilitarse:**
- Globalmente (para toda la empresa)
- Por fechas/horarios (futuro)
- Por usuario individual (futuro)

### 8.3 Reglas durante OT

✅ **Permitido en OT:**
- `WORKING` (normal)
- `BREAK1`, `BREAK2` (si no los tomó en horario regular)
- `BREAK3` (solo si OT > 2 horas)
- `OFF` (en cualquier momento)

❌ **NO permitido en OT:**
- `MEETING` (solo en horario regular)
- `LUNCH` (ya debió haberlo tomado)

### 8.4 Break3 Automático

```
Lógica de activación:

otTime = 0

usuario activa OT → continúa Working
otTime = 60 min → Break3 aún NO disponible
otTime = 120 min → Break3 se HABILITA automáticamente
otTime = 121 min → Botón "Break3" visible y activo

Mensaje:
"💡 Break3 disponible (llevas 2h de OT)"
```

### 8.5 Límite de OT

```
Máximo: 4 horas por día

Al alcanzar 4h de OT:
otTime = 240 min → Modal automático

[Modal - NO se puede cerrar]

⏰ Límite de OT Alcanzado

Has trabajado 4 horas extra (máximo permitido).
Debes marcar tu salida.

[🏠 Marcar Off]
```

---

## 9. Dashboard Personal

### 9.1 Ubicación y Acceso

**Ruta:** `/my-timesheet` o `/mi-planilla`  
**Acceso:** Todos los roles (cada usuario ve solo su información)  
**Icono en Navbar:** 📊 "Mi Planilla"

### 9.2 Vista Diaria - Tabla de Marcajes

```
┌─────────────────────────────────────────────────────┐
│ 📅 Martes, 22 Abril 2026                            │
├──────────┬──────────────┬─────────────┬────────────┤
│ Hora     │ Marca        │ Duración    │ Estado     │
├──────────┼──────────────┼─────────────┼────────────┤
│ 08:00 AM │ Entrada      │ -           │ ✅         │
│ 10:15 AM │ Break 1      │ -           │ ☕         │
│ 10:30 AM │ Regreso      │ 15 min      │ ✅         │
│ 12:00 PM │ Lunch        │ -           │ 🍽️         │
│ 01:00 PM │ Regreso      │ 1h 00min    │ ✅         │
│ 03:00 PM │ Break 2      │ -           │ ☕         │
│ 03:20 PM │ Regreso      │ 20 min 🔴  │ ⚠️ Exceso  │
│ 05:45 PM │ Salida       │ -           │ 🏠         │
└──────────┴──────────────┴─────────────┴────────────┘
```

### 9.3 Totales del Día

```
┌─────────────────────────────────────────┐
│ TOTALES DEL DÍA:                        │
├─────────────────────────────────────────┤
│ 💼 Working:      7h 30min               │
│ 🎓 Meeting:      0h 00min               │
│ ☕ Breaks:        35min (Break1+Break2)  │
│    └─ Exceso:    5min 🔴                │
│ 🍽️ Lunch:        1h 00min               │
│                                         │
│ ─────────────────────────────────       │
│ ✅ Tiempo efectivo:    7h 30min         │
│ 💰 Tiempo pagado:      8h 05min         │
│ ⏱️ Tiempo total:       9h 35min         │
│                                         │
│ 📊 Eficiencia: 93.75% (7.5h / 8h)      │
└─────────────────────────────────────────┘
```

### 9.4 Acumulados - Vista Quincenal

```
┌─────────────────────────────────────────┐
│ 📅 Quincena Actual (15-30 Abril)        │
├─────────────────────────────────────────┤
│ Días trabajados:  9 de 11               │
│                                         │
│ 💼 Working:       52h 30min             │
│ 🎓 Meeting:        3h 15min             │
│ 🌙 OT:             2h 00min             │
│ ☕ Breaks:         2h 45min             │
│    └─ Exceso:     45min 🔴              │
│                                         │
│ ─────────────────────────────────       │
│ ✅ Tiempo efectivo:   57h 45min         │
│ 💰 Tiempo pagado:     60h 30min         │
│                                         │
│ 📊 Eficiencia promedio: 95.5%          │
│                                         │
│ [Ver detalles por día]                  │
└─────────────────────────────────────────┘
```

### 9.5 Acumulados - Vista Mensual

```
┌─────────────────────────────────────────┐
│ 📅 Mes Actual (Abril 2026)              │
├─────────────────────────────────────────┤
│ Días trabajados:  18 de 22              │
│                                         │
│ 💼 Working:      134h 15min             │
│ 🎓 Meeting:       12h 30min             │
│ 🌙 OT:             8h 15min             │
│ ☕ Breaks:         5h 30min             │
│    └─ Exceso:     1h 30min 🔴          │
│                                         │
│ ─────────────────────────────────       │
│ ✅ Tiempo efectivo:  155h 00min         │
│ 💰 Tiempo pagado:    160h 30min         │
│                                         │
│ 📊 Eficiencia promedio: 96.8%          │
│                                         │
│ [📄 Exportar PDF] [📊 Ver gráficas]     │
└─────────────────────────────────────────┘
```

### 9.6 Gráficas de Tendencias (Opción B)

```
Working vs Meeting - Últimos 7 días
│ 8h ┤     ■■■■■■■    
│ 7h ┤   ■■░░░░░░░■    ■ Working
│ 6h ┤ ■■░░░░░░░░░░■    □ Meeting
│ 5h ┤■░░░░░░░░░░░░░■
│ 4h ┤░░░░░░░░░░░░░░░
│ 3h ┤□□░░░░░░░░░□░░░
│ 2h ┤░░□░░░░░░░░░□░░
│ 1h ┤░░░░░□░░░░░░░□░
│ 0h ┴─────────────────
     L M M J V S D

Distribución de tiempo - Esta semana
┌────────────────┐
│ Working   78% ■│
│ Meeting   12% ■│
│ Breaks     8% ■│
│ OT         2% ■│
└────────────────┘
```

### 9.7 Información NO Mostrada en Dashboard Personal

❌ **NO se muestra:**
- Salarios o montos pagados
- Deducciones
- Nómina
- Comparación con otros empleados
- Metas de productividad impuestas

✅ **Solo se muestra:**
- Tiempos registrados
- Totales por categoría
- Acumulados
- Eficiencia personal (para auto-gestión)

---

## 10. Panel de Administración

### 10.1 Configuración General

**Ruta:** `/admin/timeclock/config`  
**Acceso:** Solo rol `ADMIN`

```
┌─────────────────────────────────────────────────┐
│ ⚙️ Configuración del Sistema de Planillas       │
├─────────────────────────────────────────────────┤
│                                                 │
│ 🔐 Control por Rol                              │
│ ┌─────────────────────────────────────────┐   │
│ │ ☐ ADMIN (Exento de marcaje)            │   │
│ │ ☑ CONTADOR (Requiere marcaje)          │   │
│ │ ☑ AGENTE (Requiere marcaje)            │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ⏱️ Tiempos Permitidos                           │
│ ┌─────────────────────────────────────────┐   │
│ │ Break 1:  [15] minutos                  │   │
│ │ Lunch:    [60] minutos                  │   │
│ │ Break 2:  [15] minutos                  │   │
│ │ Break 3:  [15] minutos (solo OT > 2h)   │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ 🌙 Horas Extra                                  │
│ ┌─────────────────────────────────────────┐   │
│ │ ☑ Habilitar OT en el sistema            │   │
│ │ Regular:    [8] horas efectivas         │   │
│ │ Máximo OT:  [4] horas por día           │   │
│ │ OT requiere aprobación: ☐               │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ [💾 Guardar Configuración]                      │
└─────────────────────────────────────────────────┘
```

### 10.2 Vista de Marcajes - Todos los Usuarios

**Ruta:** `/admin/timeclock/entries`

```
┌─────────────────────────────────────────────────┐
│ 📊 Registro de Marcajes                         │
├─────────────────────────────────────────────────┤
│ Filtros:                                        │
│ Usuario: [Todos ▾]  Fecha: [Hoy ▾]  Estado: [Todos ▾] │
├─────────────────────────────────────────────────┤
│                                                 │
│ Juan Pérez - AGENTE                             │
│ 08:00 AM  Entrada      ✅                       │
│ 10:15 AM  Break 1      ☕ (15 min)              │
│ 12:00 PM  Lunch        🍽️ (60 min)              │
│ 03:00 PM  Break 2      ☕ (20 min) 🔴 Exceso    │
│ 05:45 PM  Salida       🏠                       │
│ Total: 8h 05min pagadas | 7h 30min efectivas   │
│ [✏️ Editar] [📊 Ver detalles]                   │
│                                                 │
│ ─────────────────────────────────────────────   │
│                                                 │
│ María González - CONTADOR                       │
│ 08:15 AM  Entrada      ✅                       │
│ 09:00 AM  Meeting      💼 (2h)                  │
│ 12:00 PM  Lunch        🍽️ (65 min) ⚠️ Exceso   │
│ ... En curso ...                                │
│ [⏸️ Usuario en sistema]                         │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 10.3 Corrección Manual de Marcajes

**Función:** Admin puede corregir cualquier marcaje con auditoría

```
[Modal de Corrección]
┌─────────────────────────────────────────┐
│ ✏️ Editar Marcaje                       │
├─────────────────────────────────────────┤
│ Usuario: Juan Pérez                     │
│ Fecha: 22/04/2026                       │
│                                         │
│ DATOS ORIGINALES:                       │
│ Tipo: Break1                            │
│ Entrada: 10:15 AM                       │
│ Salida: 10:40 AM                        │
│ Duración: 25 minutos                    │
│                                         │
│ ─────────────────────────────────       │
│                                         │
│ CORRECCIÓN:                             │
│ Nuevo tipo: [Lunch ▾]                   │
│ Nueva entrada: [12:00]                  │
│ Nueva salida: [13:00]                   │
│                                         │
│ Motivo de corrección (obligatorio):    │
│ ┌─────────────────────────────────┐   │
│ │ Marcó Break1 por error,         │   │
│ │ realmente fue su hora de lunch  │   │
│ └─────────────────────────────────┘   │
│                                         │
│ Corrección realizada por: Admin Allan  │
│ Timestamp: 22/04/2026 14:35:22          │
│                                         │
│ [💾 Guardar Corrección] [❌ Cancelar]   │
└─────────────────────────────────────────┘
```

**Registro de Auditoría:**
```sql
TimeclockCorrection {
  id: "corr_123"
  entryId: "entry_456"
  correctedByUserId: "admin_001"
  reason: "Marcó Break1 por error, realmente fue su hora de lunch"
  
  beforeType: "BREAK1"
  beforeClockIn: "2026-04-22 10:15:00"
  beforeClockOut: "2026-04-22 10:40:00"
  
  afterType: "LUNCH"
  afterClockIn: "2026-04-22 12:00:00"
  afterClockOut: "2026-04-22 13:00:00"
  
  createdAt: "2026-04-22 14:35:22"
}
```

---

## 11. Reportes y Análisis

### 11.1 Reporte de Productividad / Job Avoidance

**Concepto clave:** Distinguir tiempo pagado vs tiempo efectivo

```
┌─────────────────────────────────────────────────┐
│ 📊 Reporte de Productividad - Juan Pérez        │
│ Periodo: 15-21 Abril 2026                       │
├─────────────────────────────────────────────────┤
│                                                 │
│ ⏱️ TIEMPO PAGADO:                                │
│ Working:         38h 30min                      │
│ Meeting:          3h 15min                      │
│ Breaks:           1h 45min (exceso: 30min 🔴)   │
│ OT:               2h 00min                      │
│ ─────────────────────────────────               │
│ Total pagado:    45h 30min                      │
│                                                 │
│ ─────────────────────────────────               │
│                                                 │
│ 💼 TIEMPO EFECTIVO:                             │
│ Working:         38h 30min                      │
│ Meeting:          3h 15min                      │
│ ─────────────────────────────────               │
│ Total efectivo:  41h 45min                      │
│                                                 │
│ ─────────────────────────────────               │
│                                                 │
│ 📈 ANÁLISIS:                                    │
│ Jornada contratada:    40h (5 días × 8h)       │
│ Tiempo efectivo:       41h 45min                │
│ Cumplimiento:          104.4% ✅                │
│                                                 │
│ Tiempo en breaks:      1h 45min                 │
│   └─ Permitido:        1h 15min (5 × 15min)    │
│   └─ Exceso:           30min 🔴                 │
│                                                 │
│ OT trabajadas:         2h 00min                 │
│ Meeting time:          3h 15min (7.8% semana)   │
│                                                 │
│ ⚠️ Job Avoidance:      30 minutos               │
│    (tiempo pagado pero no efectivo)             │
│                                                 │
│ [📄 Exportar PDF] [📊 Ver gráfica]              │
└─────────────────────────────────────────────────┘
```

### 11.2 Reporte por Tipo de Actividad

```
┌─────────────────────────────────────────────────┐
│ 📊 Distribución de Tiempo - Abril 2026          │
│ Todos los usuarios                              │
├─────────────────────────────────────────────────┤
│                                                 │
│ Usuario        │Working│Meeting│Breaks│OT│Total│
│ ─────────────────────────────────────────────   │
│ Juan Pérez     │ 152h  │  8h   │ 6h   │5h│171h │
│ María González │ 148h  │ 18h   │ 7h   │2h│175h │
│ Carlos Ruiz    │ 159h  │  3h   │ 5h   │8h│175h │
│ Ana Torres     │ 145h  │ 22h   │ 6h   │0h│173h │
│ ─────────────────────────────────────────────   │
│ TOTALES        │ 604h  │ 51h   │24h   │15h│694h │
│                                                 │
│ Promedios por persona:                          │
│ Working:  151h/mes (94.4h/quincena)             │
│ Meeting:  12.75h/mes                            │
│ OT:       3.75h/mes                             │
│                                                 │
│ [Filtrar por departamento] [Exportar Excel]     │
└─────────────────────────────────────────────────┘
```

### 11.3 Reporte de Excesos

```
┌─────────────────────────────────────────────────┐
│ ⚠️ Reporte de Excesos en Breaks - Esta semana   │
├─────────────────────────────────────────────────┤
│                                                 │
│ Usuario        │Fecha │Break│Permitido│Exceso  │
│ ─────────────────────────────────────────────   │
│ Juan Pérez     │22/04 │ B1  │ 15min   │+10min🔴│
│ Juan Pérez     │22/04 │ B2  │ 15min   │ +5min🔴│
│ María González │21/04 │Lunch│ 60min   │ +5min⚠️│
│ Carlos Ruiz    │20/04 │ B1  │ 15min   │+20min🔴│
│ Carlos Ruiz    │21/04 │ B1  │ 15min   │+15min🔴│
│ Ana Torres     │19/04 │Lunch│ 60min   │+10min⚠️│
│                                                 │
│ Total excesos: 65 minutos esta semana           │
│   └─ Breaks: 50min (costo: se pagó pero no trabajó) │
│   └─ Lunch: 15min (no tiene costo, lunch no paga)   │
│                                                 │
│ Top usuarios con excesos:                       │
│ 1. Carlos Ruiz: 35min                           │
│ 2. Juan Pérez: 15min                            │
│ 3. María González: 5min                         │
│                                                 │
│ [📧 Enviar notificación] [📄 Exportar PDF]      │
└─────────────────────────────────────────────────┘
```

### 11.4 Exportación de Reportes

**Formatos disponibles:**
- 📄 **PDF**: Reporte formateado para imprimir
- 📊 **Excel**: Datos crudos para análisis
- 📈 **CSV**: Compatible con sistemas de nómina

**Ejemplo de columnas en Excel:**
```
| Fecha | Usuario | Working | Meeting | Break1 | Lunch | Break2 | OT | Total Pagado | Total Efectivo | Excesos | Eficiencia |
|-------|---------|---------|---------|--------|-------|--------|----|--------------|--------------------|---------|------------|
| 22/04 | Juan P. | 7h 30m  | 0h      | 15m    | 60m   | 20m    | 0h | 8h 05m       | 7h 30m             | 5min    | 93.75%     |
```

---

## 12. Casos Especiales

### 12.1 Múltiples Logins/Dispositivos

**Problema:** Usuario logueado en 2 lugares simultáneos

**Solución (Fase 2):**
- WebSocket para sincronizar estado en tiempo real
- Si marca en dispositivo A, dispositivo B se actualiza instantáneamente
- Evita marcas duplicadas o conflictos

**Fase 1 (MVP):**
- Solo sincronización al refrescar página
- Validación en backend: solo 1 marca activa a la vez

### 12.2 Pérdida de Conexión

**Problema:** Usuario marca pero no llega al servidor

**Solución:**
- Queue local (localStorage) con retry automático
- Timestamp del cliente se envía al servidor
- Servidor usa su propio timestamp pero registra el del cliente
- Si hay diferencia > 5 min, genera alerta para admin

### 12.3 Trabajo en Feriados

#### **Sistema de Feriados:**

**Catálogo de Feriados de Costa Rica:**
- Admin puede configurar días feriados del año
- Cada feriado tiene:
  - Fecha
  - Nombre (ej: "Día de la Independencia")
  - Tipo: "Obligatorio" (pago aunque no trabaje) o "Nacional" (solo si trabaja)
  - Multiplicador de pago: 2.0x si trabaja ese día

**Lógica de Pago:**

```
Feriado Obligatorio (ej: 15 de Septiembre):
- NO trabaja: Se paga 1 día completo (8h) ✅
- SÍ trabaja: Se paga 1 día + 2.0x las horas trabajadas
  
  Ejemplo:
  Trabajó 8h en feriado obligatorio
  = 8h normales (por ser feriado obligatorio)
  + 8h × 2.0 (por trabajar)
  = 24h pagadas en total (3 días de pago)

Feriado Nacional (ej: Día de la Madre):
- NO trabaja: NO se paga extra ❌
- SÍ trabaja: Se paga 2.0x las horas trabajadas
  
  Ejemplo:
  Trabajó 8h en feriado nacional
  = 8h × 2.0
  = 16h pagadas (2 días de pago)
```

**En Dashboard:**
```
┌─────────────────────────────────────┐
│ 🎉 Feriado - 15 de Septiembre       │
│ Día de la Independencia (Obligatorio)│
│                                     │
│ Trabajaste: 8h                      │
│ Pago base: 8h (feriado obligatorio)│
│ Pago extra: 16h (2.0x por trabajar)│
│ ─────────────────────────           │
│ Total: 24h pagadas 💰              │
└─────────────────────────────────────┘
```

**Tabla en BD:**
```prisma
model Holiday {
  id          String   @id @default(cuid())
  date        DateTime // Fecha del feriado
  name        String   // "Día de la Independencia"
  type        String   // "MANDATORY" | "NATIONAL"
  multiplier  Decimal  @default(2.0) // 2.0x para feriados
  year        Int      // 2026
  isPaid      Boolean  @default(true) // Si se paga sin trabajar
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([date, year])
  @@index([date])
}
```

**Configuración Admin:**
```
/admin/holidays

┌─────────────────────────────────────────┐
│ 🎉 Catálogo de Feriados 2026            │
├─────────────────────────────────────────┤
│ [+ Agregar Feriado]                     │
│                                         │
│ Fecha       │Nombre            │Tipo    │
│ ───────────────────────────────────────│
│ 01/01/2026  │Año Nuevo         │Oblig.  │
│ 11/04/2026  │Batalla de Rivas  │Oblig.  │
│ 01/05/2026  │Día del Trabajo   │Oblig.  │
│ 15/08/2026  │Día de la Madre   │Nac.    │
│ 15/09/2026  │Independencia     │Oblig.  │
│ 25/12/2026  │Navidad           │Oblig.  │
│                                         │
│ Multiplicador de pago: 2.0x             │
│ (cuando se trabaja en feriado)          │
└─────────────────────────────────────────┘
```

### 12.4 Ausencias/Incapacidades

**Fase 1:** No se registran en el sistema de timeclock

**Fase 2:**
- Sistema de solicitud de permisos
- Admin aprueba ausencias justificadas
- Registro de incapacidades con certificado
- Se refleja en dashboard: "Ausencia justificada - 8h pagadas"

### 12.5 Vacaciones

**Fase 1:** No gestionadas por el sistema

**Fase 2:**
- Cálculo automático de días acumulados
- Solicitud de vacaciones con aprobación
- Aparece en dashboard: "Vacaciones pendientes: 10 días"
- Se descuenta automáticamente de saldo al usar

---

## 13. Estructura de Base de Datos

### 13.1 Tabla: TimeclockConfig

```prisma
model TimeclockConfig {
  id                String   @id @default(cuid())
  role              String   @unique // "ADMIN" | "CONTADOR" | "AGENTE"
  
  // Control general
  requiresTimeclock Boolean  @default(true)
  otEnabled         Boolean  @default(false)
  
  // Tiempos en minutos
  break1Duration    Int      @default(15)
  lunchDuration     Int      @default(60)
  break2Duration    Int      @default(15)
  break3Duration    Int      @default(15)
  
  // Jornada
  regularHours      Int      @default(8)  // horas
  maxOtHours        Int      @default(4)  // horas
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 13.2 Tabla: TimeclockEntry

```prisma
model TimeclockEntry {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  
  date      DateTime // Solo fecha (2026-04-22)
  
  // Tipo de marca
  type      String   // "WORKING" | "MEETING" | "BREAK1" | "LUNCH" | "BREAK2" | "BREAK3" | "OFF"
  
  // Tiempos
  clockIn   DateTime // Timestamp completo (2026-04-22 08:00:00)
  clockOut  DateTime? // null si aún está en ese estado
  duration  Int?     // minutos (calculado al clockOut)
  
  // OT
  isOT      Boolean  @default(false)
  
  // Validaciones
  exceeded  Boolean  @default(false) // true si excedió tiempo permitido
  excessMin Int?     // minutos de exceso (para breaks/lunch)
  
  // Para auditoría
  duringOT  Boolean  @default(false) // true si intentó Meeting en OT
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, date])
  @@index([date])
  @@index([userId, type, date])
}
```

### 13.3 Tabla: TimeclockDailySummary

```prisma
model TimeclockDailySummary {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  date          DateTime @unique
  
  // Tiempos en minutos (separados por tipo)
  workingMin    Int      @default(0)
  meetingMin    Int      @default(0)
  otMin         Int      @default(0)
  break1Min     Int      @default(0)
  break2Min     Int      @default(0)
  break3Min     Int      @default(0)
  lunchMin      Int      @default(0)
  
  // Calculados
  effectiveMin  Int      @default(0) // working + meeting
  paidMin       Int      @default(0) // working + meeting + breaks + ot (sin lunch)
  totalMin      Int      @default(0) // todo incluido lunch
  
  // Excesos
  excessBreaksMin Int    @default(0) // suma de excesos en breaks
  excessLunchMin  Int    @default(0) // exceso en lunch (no pagado)
  
  // Estado
  isComplete    Boolean  @default(false) // true si marcó Off
  hasOT         Boolean  @default(false)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, date])
  @@index([date])
}
```

### 13.4 Tabla: TimeclockCorrection

```prisma
model TimeclockCorrection {
  id                String   @id @default(cuid())
  entryId           String
  entry             TimeclockEntry @relation(fields: [entryId], references: [id])
  
  // Quién corrigió
  correctedByUserId String
  correctedBy       User     @relation(fields: [correctedByUserId], references: [id])
  
  // Motivo obligatorio
  reason            String   // Texto libre explicando por qué
  
  // Estado original
  beforeType        String
  beforeClockIn     DateTime
  beforeClockOut    DateTime?
  beforeDuration    Int?
  
  // Estado corregido
  afterType         String
  afterClockIn      DateTime
  afterClockOut     DateTime?
  afterDuration     Int?
  
  createdAt         DateTime @default(now())

  @@index([entryId])
  @@index([correctedByUserId])
  @@index([createdAt])
}
```

### 13.5 Tabla: EmployeeCompensation

**Sistema de Salarios por Hora (Costa Rica)**

```prisma
model EmployeeCompensation {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id])
  
  // Salario base
  hourlyRate        Decimal  @db.Decimal(10, 2) // Tarifa por hora regular
  currency          String   @default("CRC") // "CRC" o "USD"
  
  // Multiplicadores (Costa Rica)
  otMultiplier      Decimal  @default(1.5) // Horas extra: 1.5x
  holidayMultiplier Decimal  @default(2.0) // Feriados: 2.0x
  
  // Estado
  effectiveFrom     DateTime // Fecha desde que aplica
  effectiveUntil    DateTime? // null si está activo
  isActive          Boolean  @default(true)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId, isActive])
  @@index([effectiveFrom])
}
```

**Ejemplo:**
```
Usuario: Juan Pérez (Agente)
hourlyRate: 3500.00 CRC
otMultiplier: 1.5
holidayMultiplier: 2.0

Día normal (8h trabajadas):
= 8h × 3500 = ₡28,000

Día con 2h OT (10h trabajadas):
= 8h × 3500 (regular) + 2h × 3500 × 1.5 (OT)
= ₡28,000 + ₡10,500 = ₡38,500

Día feriado obligatorio trabajado (8h):
= 8h × 3500 (pago base por feriado)
+ 8h × 3500 × 2.0 (por trabajar)
= ₡28,000 + ₡56,000 = ₡84,000 (3 días de pago)
```

### 13.6 Tabla: VacationBalance

**Sistema de Vacaciones (4.17% mensual del salario bruto)**

```prisma
model VacationBalance {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id])
  
  // Acumulado
  totalAccrued      Decimal  @db.Decimal(10, 2) // Monto acumulado (4.17%/mes)
  totalUsed         Decimal  @db.Decimal(10, 2) // Monto usado
  currentBalance    Decimal  @db.Decimal(10, 2) // totalAccrued - totalUsed
  
  // Fechas
  employmentDate    DateTime // Fecha de inicio laboral
  lastAccrualDate   DateTime // Última vez que se calculó acumulación
  
  updatedAt         DateTime @updatedAt

  @@index([userId])
}

model VacationRequest {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  
  // Solicitud
  startDate         DateTime
  endDate           DateTime
  days              Decimal  @db.Decimal(10, 2) // Días solicitados
  reason            String?
  
  // Aprobación
  status            String   // "PENDING" | "APPROVED" | "REJECTED"
  approvedByUserId  String?
  approvedBy        User?    @relation(fields: [approvedByUserId], references: [id], name: "ApprovedVacations")
  approvedAt        DateTime?
  rejectionReason   String?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId, status])
  @@index([startDate])
}
```

**Cálculo de Acumulación:**
```
Ejemplo: Juan Pérez
Fecha de ingreso: 2024-01-15
Hoy: 2026-05-01
Salario bruto mensual promedio: ₡600,000

Meses trabajados = 28 meses
Vacaciones acumuladas = ₡600,000 × 0.0417 × 28 = ₡700,560
Vacaciones usadas = ₡100,000
Balance actual = ₡600,560 ✅
```

### 13.7 Tabla: SickLeave (Incapacidades)

**Sistema de Incapacidades CCSS**

```prisma
model SickLeave {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  
  // Fechas
  startDate         DateTime
  endDate           DateTime
  days              Int      // Días de incapacidad
  
  // CCSS
  ccssDocNumber     String   // Número del documento CCSS
  ccssIssuedBy      String?  // Nombre del doctor/clínica
  
  // Pagos (Costa Rica)
  firstThreeDaysEmployer  Decimal  @db.Decimal(10, 2) // 60% empleador
  firstThreeDaysCCSS      Decimal  @db.Decimal(10, 2) // 40% CCSS
  remainingDaysCCSS       Decimal  @db.Decimal(10, 2) // 100% CCSS
  
  // Estado
  status            String   // "PENDING" | "APPROVED" | "REJECTED"
  approvedByUserId  String?
  approvedBy        User?    @relation(fields: [approvedByUserId], references: [id], name: "ApprovedSickLeaves")
  approvedAt        DateTime?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId, startDate])
}
```

**Cálculo de Pago:**
```
Ejemplo: Juan Pérez (tarifa ₡3,500/h)
Incapacidad: 5 días (Lunes a Viernes)

Primeros 3 días:
- Empleador paga 60%: 3 días × 8h × ₡3,500 × 0.60 = ₡50,400
- CCSS paga 40%: 3 días × 8h × ₡3,500 × 0.40 = ₡33,600

Siguientes 2 días:
- CCSS paga 100%: 2 días × 8h × ₡3,500 × 1.00 = ₡56,000

Total empleador: ₡50,400
Total CCSS: ₡89,600
Total empleado recibe: ₡140,000
```

### 13.8 Tabla: Payslip (Fase 2)

**Colilla de Pago Completa - Costa Rica**

```prisma
model Payslip {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  
  // Periodo
  period            String   // "2026-04-15_2026-04-30" (quincena)
  periodStart       DateTime
  periodEnd         DateTime
  
  // ═══════════════════════════════════
  // DEVENGADO (Ingresos)
  // ═══════════════════════════════════
  
  // Horas trabajadas
  regularHours      Decimal  @db.Decimal(10, 2) // Horas normales
  meetingHours      Decimal  @db.Decimal(10, 2) // Reuniones
  otHours           Decimal  @db.Decimal(10, 2) // Horas extra (1.5x)
  holidayHours      Decimal  @db.Decimal(10, 2) // Horas en feriado (2.0x)
  totalHoursWorked  Decimal  @db.Decimal(10, 2)
  
  // Pagos
  hourlyRate        Decimal  @db.Decimal(10, 2) // Tarifa base
  regularPay        Decimal  @db.Decimal(10, 2) // Pago regular
  meetingPay        Decimal  @db.Decimal(10, 2) // Pago reuniones
  otPay             Decimal  @db.Decimal(10, 2) // Pago OT (1.5x)
  holidayPay        Decimal  @db.Decimal(10, 2) // Pago feriados (2.0x)
  
  // Vacaciones pagadas (si usó días)
  vacationDaysPaid  Decimal  @db.Decimal(10, 2) @default(0)
  vacationPay       Decimal  @db.Decimal(10, 2) @default(0)
  
  // Incapacidades
  sickDays          Decimal  @db.Decimal(10, 2) @default(0)
  sickPayEmployer   Decimal  @db.Decimal(10, 2) @default(0) // 60% primeros 3 días
  sickPayCCSS       Decimal  @db.Decimal(10, 2) @default(0) // 40% + resto
  
  // Bonos adicionales
  bonuses           Json?    // { description: "Bono productividad", amount: 15000 }
  bonusTotal        Decimal  @db.Decimal(10, 2) @default(0)
  
  // TOTAL DEVENGADO
  grossPay          Decimal  @db.Decimal(10, 2)
  
  // ═══════════════════════════════════
  // DEDUCCIONES
  // ═══════════════════════════════════
  
  // CCSS Empleado (Obligatorio)
  ccssEmployee      Decimal  @db.Decimal(10, 2) // 10.83% del bruto
  ccssEmployeeRate  Decimal  @default(0.1083)   // 10.83%
  
  // CCSS Patrono (No se deduce, para referencia)
  ccssEmployer      Decimal  @db.Decimal(10, 2) // 26.83% del bruto
  ccssEmployerRate  Decimal  @default(0.2683)   // 26.83%
  
  // Deducciones Nominales
  valesAmount       Decimal  @db.Decimal(10, 2) @default(0) // Vales de dinero
  loansAmount       Decimal  @db.Decimal(10, 2) @default(0) // Préstamos adelantados
  unpaidDaysAmount  Decimal  @db.Decimal(10, 2) @default(0) // Días no trabajados
  otherDeductions   Json?    // Otras deducciones
  
  // TOTAL DEDUCCIONES
  totalDeductions   Decimal  @db.Decimal(10, 2)
  
  // ═══════════════════════════════════
  // APROVISIONAMIENTOS (No se pagan, se acumulan)
  // ═══════════════════════════════════
  
  aguinaldoAccrued  Decimal  @db.Decimal(10, 2) // 8.33% mensual
  cesantiaAccrued   Decimal  @db.Decimal(10, 2) // 5.33% mensual
  vacationAccrued   Decimal  @db.Decimal(10, 2) // 4.17% mensual
  
  // ═══════════════════════════════════
  // SALARIO NETO
  // ═══════════════════════════════════
  
  netPay            Decimal  @db.Decimal(10, 2) // grossPay - totalDeductions
  
  // ═══════════════════════════════════
  // Metadata
  // ═══════════════════════════════════
  
  currency          String   @default("CRC")
  
  // PDF
  pdfObjectKey      String?
  
  // Estado
  status            String   // "PENDING" | "APPROVED" | "SENT" | "PAID"
  approvedAt        DateTime?
  approvedByUserId  String?
  approvedBy        User?    @relation(fields: [approvedByUserId], references: [id], name: "ApprovedPayslips")
  sentAt            DateTime?
  paidAt            DateTime?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId, period])
  @@index([period])
  @@index([status])
}
```

**Ejemplo de Colilla Completa:**
```
═══════════════════════════════════════════════════════
              COLILLA DE PAGO - QUINCENA
═══════════════════════════════════════════════════════
Empleado: Juan Pérez
Periodo: 15/04/2026 - 30/04/2026
Tarifa base: ₡3,500/hora

───────────────────────────────────────────────────────
DEVENGADO (Ingresos)
───────────────────────────────────────────────────────
Horas regulares:        80.00h × ₡3,500 = ₡280,000
Horas reunión:           4.00h × ₡3,500 = ₡14,000
Horas extra (1.5x):      6.00h × ₡5,250 = ₡31,500
Feriado 15 de Sep (2.0x): 8.00h × ₡7,000 = ₡56,000
                                          ───────────
SUBTOTAL HORAS                           = ₡381,500

Bono productividad                       = ₡15,000
                                          ───────────
TOTAL DEVENGADO                          = ₡396,500
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
DEDUCCIONES
───────────────────────────────────────────────────────
CCSS Empleado (10.83%)                   = ₡42,951
Vale de dinero                           = ₡10,000
Préstamo adelantado                      = ₡5,000
                                          ───────────
TOTAL DEDUCCIONES                        = ₡57,951
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
APROVISIONAMIENTOS (Acumulados, no pagados)
───────────────────────────────────────────────────────
Aguinaldo (8.33%)                        = ₡33,034
Cesantía (5.33%)                         = ₡21,133
Vacaciones (4.17%)                       = ₡16,534
───────────────────────────────────────────────────────

═══════════════════════════════════════════════════════
SALARIO NETO A PAGAR:                    ₡338,549
═══════════════════════════════════════════════════════

CCSS Patrono (26.83% - No deducido):     ₡106,387
Costo total empleador:                   ₡444,936
═══════════════════════════════════════════════════════
```

---

## 14. Fases de Implementación

### FASE 1 - MVP (Implementación Inmediata) ⭐

**Objetivo:** Sistema funcional de control de tiempo básico

#### Backend:
- ✅ Migración Prisma: Tablas TimeclockEntry, TimeclockConfig, TimeclockDailySummary
- ✅ Módulo NestJS: TimeclockModule, TimeclockService, TimeclockController
- ✅ Endpoints:
  - `POST /timeclock/clock-in` - Marca entrada/cambio de estado
  - `GET /timeclock/status` - Estado actual del usuario
  - `GET /timeclock/today` - Marcajes del día actual
  - `GET /timeclock/summary/:date` - Resumen de un día específico
  - `GET /timeclock/period` - Acumulados por periodo (query: start, end)
  - `GET /admin/timeclock/config` - Configuración (solo admin)
  - `PUT /admin/timeclock/config` - Actualizar config (solo admin)
  - `GET /admin/timeclock/entries` - Todos los marcajes (filtros)
  - `PUT /admin/timeclock/entry/:id` - Corregir marcaje (solo admin)

#### Frontend:
- ✅ Modal de entrada obligatorio
- ✅ Contador en navbar (tiempo en tiempo real)
- ✅ Botones de marcaje: Working, Meeting, Break1, Lunch, Break2, Off, (Break3 si aplica)
- ✅ Dashboard personal: `/my-timesheet`
  - Vista diaria con tabla de marcajes
  - Totales del día
  - Acumulados quincenal y mensual
  - Gráficas básicas (Opción B)
- ✅ Bloqueo de UI durante breaks/lunch
- ✅ Modal de OT al completar 8h
- ✅ Página admin: `/admin/timeclock/config`
  - Control ON/OFF por rol
  - Configuración de tiempos
  - Habilitar/deshabilitar OT

#### Validaciones:
- ✅ Backend rechaza requests si no está en Working/Meeting
- ✅ No puede Lunch sin Break1
- ✅ No puede Meeting durante OT
- ✅ Break3 solo si OT > 2h
- ✅ OFF flexible pero con modal automático

#### Cálculos:
- ✅ Tiempo efectivo = Working + Meeting
- ✅ Tiempo pagado = Working + Meeting + Breaks (sin Lunch)
- ✅ Detección automática de excesos en breaks/lunch
- ✅ Cálculo de eficiencia

**Duración estimada:** 3-5 días de desarrollo

---

### FASE 2 - Reportes y Sistema de Nómina (Costa Rica)

**Objetivo:** Sistema completo de planillas con cálculos de salarios, deducciones CCSS, vacaciones, incapacidades, aguinaldo y cesantía

#### Backend - Tablas Nuevas:
- ✅ **EmployeeCompensation:** Salarios por hora (personalizados por empleado)
- ✅ **Holiday:** Catálogo de feriados (obligatorios y nacionales, multiplicador 2.0x)
- ✅ **VacationBalance:** Acumulación automática (4.17% mensual del salario bruto)
- ✅ **VacationRequest:** Solicitudes de vacaciones con aprobación
- ✅ **SickLeave:** Incapacidades CCSS (60/40% primeros 3 días, luego 100% CCSS)
- ✅ **Payslip:** Colilla de pago completa con todos los campos Costa Rica

#### Backend - Endpoints:
**Salarios:**
  - `GET /admin/compensation` - Lista de salarios de todos los empleados
  - `PUT /admin/compensation/:userId` - Actualizar tarifa por hora
  - `GET /admin/compensation/history/:userId` - Historial de cambios

**Feriados:**
  - `GET /admin/holidays` - Catálogo de feriados del año
  - `POST /admin/holidays` - Agregar feriado
  - `PUT /admin/holidays/:id` - Editar feriado
  - `DELETE /admin/holidays/:id` - Eliminar feriado
  - `GET /holidays/list/:year` - Feriados públicos (todos los usuarios)

**Vacaciones:**
  - `GET /vacations/my-balance` - Mi balance actual
  - `POST /vacations/request` - Solicitar vacaciones
  - `GET /vacations/my-requests` - Mis solicitudes
  - `GET /admin/vacations/pending` - Solicitudes pendientes (admin)
  - `POST /admin/vacations/:id/approve` - Aprobar solicitud
  - `POST /admin/vacations/:id/reject` - Rechazar solicitud
  - `GET /admin/vacations/calendar` - Calendario de vacaciones del equipo

**Incapacidades:**
  - `POST /sick-leave/report` - Reportar incapacidad (con archivo CCSS)
  - `GET /sick-leave/my-list` - Mis incapacidades
  - `GET /admin/sick-leave/pending` - Incapacidades pendientes (admin)
  - `POST /admin/sick-leave/:id/approve` - Aprobar incapacidad

**Nómina:**
  - `POST /admin/payroll/generate` - Generar planilla del periodo (quincena)
  - `GET /admin/payroll/:period` - Ver planilla del periodo
  - `POST /admin/payroll/:period/recalculate` - Recalcular (si hubo correcciones)
  - `POST /admin/payroll/:id/approve` - Aprobar planilla
  - `POST /admin/payroll/:id/send` - Enviar colillas por email
  - `GET /payroll/my-payslips` - Mis colillas (usuario)
  - `GET /payroll/payslip/:id/pdf` - Descargar PDF
  - `GET /admin/payroll/export/:period` - Exportar a Excel

#### Backend - Cálculos Automáticos:

**Salario Bruto:**
```typescript
// Horas regulares (Working + Meeting)
regularPay = regularHours × hourlyRate

// Horas extra (OT > 8h, max 4h)
otPay = otHours × hourlyRate × 1.5

// Feriados trabajados
if (trabajóEnFeriado && feriado.type === "MANDATORY") {
  holidayPay = 8h × hourlyRate (base)
             + horasTrabajadasEnFeriado × hourlyRate × 2.0
} else if (trabajóEnFeriado && feriado.type === "NATIONAL") {
  holidayPay = horasTrabajadasEnFeriado × hourlyRate × 2.0
}

// Incapacidades (primeros 3 días)
sickPayEmployer = 3 días × 8h × hourlyRate × 0.60
sickPayCCSS = 3 días × 8h × hourlyRate × 0.40

// Incapacidades (días 4+)
sickPayCCSS += (días - 3) × 8h × hourlyRate × 1.00

// TOTAL DEVENGADO
grossPay = regularPay + otPay + holidayPay + sickPayEmployer + bonuses
```

**Deducciones:**
```typescript
// CCSS Empleado (obligatorio)
ccssEmployee = grossPay × 0.1083 // 10.83%

// CCSS Patrono (no se deduce, solo para cálculo costo)
ccssEmployer = grossPay × 0.2683 // 26.83%

// Deducciones nominales
valesAmount = (del registro manual admin)
loansAmount = (del registro manual admin)
unpaidDaysAmount = díasNoTrabajados × (hourlyRate × 8h)

totalDeductions = ccssEmployee + valesAmount + loansAmount + unpaidDaysAmount
```

**Aprovisionamientos (No se pagan, se acumulan):**
```typescript
// Aguinaldo (8.33% mensual)
aguinaldoAccrued = grossPay × 0.0833

// Cesantía (5.33% mensual)
cesantiaAccrued = grossPay × 0.0533

// Vacaciones (4.17% mensual)
vacationAccrued = grossPay × 0.0417
```

**Salario Neto:**
```typescript
netPay = grossPay - totalDeductions
```

#### Frontend - Páginas Nuevas:

**Admin - Salarios:**
```
/admin/compensation

┌─────────────────────────────────────────┐
│ 💰 Tarifas por Hora                     │
├─────────────────────────────────────────┤
│ Usuario         │Tarifa/h  │Efectivo   │
│ ────────────────────────────────────────│
│ Juan Pérez      │₡3,500    │01/01/2026 │
│ María López     │₡4,200    │15/03/2026 │
│ Carlos Ruiz     │$15.00    │01/02/2026 │
│                                         │
│ [+ Agregar Nuevo Empleado]              │
│                                         │
│ Multiplicadores:                        │
│ • Horas Extra (OT): 1.5x                │
│ • Feriados: 2.0x                        │
└─────────────────────────────────────────┘
```

**Admin - Feriados:**
```
/admin/holidays

┌─────────────────────────────────────────┐
│ 🎉 Catálogo de Feriados 2026            │
├─────────────────────────────────────────┤
│ [+ Agregar Feriado]  [Importar Año]    │
│                                         │
│ Fecha       │Nombre            │Tipo    │
│ ───────────────────────────────────────│
│ 01/01/2026  │Año Nuevo         │Oblig.  │
│ 11/04/2026  │Batalla de Rivas  │Oblig.  │
│ 01/05/2026  │Día del Trabajo   │Oblig.  │
│ 15/08/2026  │Día de la Madre   │Nac.    │
│ 15/09/2026  │Independencia     │Oblig.  │
│ 25/12/2026  │Navidad           │Oblig.  │
└─────────────────────────────────────────┘
```

**Usuario - Vacaciones:**
```
/my-vacations

┌─────────────────────────────────────────┐
│ 🏖️ Mis Vacaciones                       │
├─────────────────────────────────────────┤
│ Balance actual: ₡600,560 ✅             │
│ Equivalente aprox: 29 días              │
│                                         │
│ [+ Solicitar Vacaciones]                │
│                                         │
│ Solicitudes:                            │
│ ───────────────────────────────────────│
│ 01/06 - 10/06 (5 días) - Aprobado ✅   │
│ 15/12 - 22/12 (5 días) - Pendiente ⏳  │
└─────────────────────────────────────────┘
```

**Admin - Incapacidades:**
```
/admin/sick-leave

┌─────────────────────────────────────────┐
│ 🏥 Incapacidades Pendientes             │
├─────────────────────────────────────────┤
│ Usuario         │Fecha      │Días │CCSS │
│ ───────────────────────────────────────│
│ Juan Pérez      │05-10/05   │5    │#123 │
│   [Ver Documento CCSS] [Aprobar][Rechazar]│
│                                         │
│ María López     │12-15/05   │3    │#456 │
│   [Ver Documento CCSS] [Aprobar][Rechazar]│
└─────────────────────────────────────────┘
```

**Admin - Nómina:**
```
/admin/payroll

┌─────────────────────────────────────────┐
│ 📊 Planillas por Periodo                │
├─────────────────────────────────────────┤
│ [Generar Nueva Planilla]                │
│                                         │
│ Periodo         │Estado     │Total      │
│ ───────────────────────────────────────│
│ 15-30 Abr 2026  │Pagado ✅  │₡1,250,000 │
│ 01-15 May 2026  │Aprobado ✅│₡1,380,000 │
│ 16-30 May 2026  │Pendiente ⏳│₡1,320,000│
│                 │[Revisar] [Aprobar]    │
└─────────────────────────────────────────┘

Al hacer click en "Revisar":

┌─────────────────────────────────────────┐
│ Planilla: 16-30 Mayo 2026               │
├─────────────────────────────────────────┤
│ Usuario      │Horas│Bruto  │CCSS │Neto  │
│ ───────────────────────────────────────│
│ Juan Pérez   │82h  │₡287k  │₡31k │₡256k │
│   • OT: 2h (₡10,500)                    │
│   • Deducción vale: ₡10,000             │
│   [Ver Detalle Completo]                │
│                                         │
│ María López  │88h  │₡369k  │₡40k │₡329k │
│   • OT: 4h (₡25,200)                    │
│   • Feriado 15/Sep: 8h (₡67,200)        │
│   [Ver Detalle Completo]                │
│                                         │
│ TOTAL: ₡656,000                         │
│ CCSS Patronal: ₡176,000                 │
│ COSTO TOTAL: ₡832,000                   │
│                                         │
│ [Recalcular] [Aprobar] [Enviar Emails] │
└─────────────────────────────────────────┘
```

**Usuario - Mis Colillas:**
```
/my-payslips

┌─────────────────────────────────────────┐
│ 💵 Mis Colillas de Pago                 │
├─────────────────────────────────────────┤
│ Periodo         │Bruto    │Neto      │PDF│
│ ───────────────────────────────────────│
│ 16-30 Abr 2026  │₡287,000 │₡256,000  │📄 │
│ 01-15 May 2026  │₡295,000 │₡263,000  │📄 │
│ 16-30 May 2026  │₡287,000 │₡256,000  │📄 │
│                                         │
│ Total YTD: ₡869,000 bruto               │
│ Aguinaldo acumulado: ₡72,377            │
│ Cesantía acumulada: ₡46,317             │
│ Vacaciones acumuladas: ₡36,237          │
└─────────────────────────────────────────┘
```

#### Reportes:
- ✅ **Reporte de productividad (Job Avoidance):** Tiempo efectivo vs pagado
- ✅ **Reporte de excesos en breaks:** Usuarios con más excesos
- ✅ **Reporte por tipo de actividad:** Distribución Working/Meeting/Breaks
- ✅ **Reporte de costos:** Costo real por empleado (incluyendo CCSS patronal)
- ✅ **Exportación a Excel/PDF**

#### Generación de PDF (Colilla):
```
═══════════════════════════════════════════════════════
              COLILLA DE PAGO - QUINCENA
              [LOGO EMPRESA]
═══════════════════════════════════════════════════════
Empleado: Juan Pérez Gómez
Cédula: 1-1234-5678
Puesto: Agente de Ventas
Periodo: 15/04/2026 - 30/04/2026
Tarifa base: ₡3,500/hora

───────────────────────────────────────────────────────
DEVENGADO (Ingresos)
───────────────────────────────────────────────────────
Horas regulares:        80.00h × ₡3,500 = ₡280,000.00
Horas reunión:           4.00h × ₡3,500 = ₡14,000.00
Horas extra (1.5x):      2.00h × ₡5,250 = ₡10,500.00
                                          ────────────
TOTAL DEVENGADO                           ₡304,500.00
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
DEDUCCIONES
───────────────────────────────────────────────────────
CCSS Empleado (10.83%)                    ₡32,977.00
Vale de dinero                            ₡10,000.00
                                          ────────────
TOTAL DEDUCCIONES                         ₡42,977.00
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
APROVISIONAMIENTOS (Acumulados)
───────────────────────────────────────────────────────
Aguinaldo (8.33%)                         ₡25,365.00
Cesantía (5.33%)                          ₡16,230.00
Vacaciones (4.17%)                        ₡12,698.00
───────────────────────────────────────────────────────

═══════════════════════════════════════════════════════
SALARIO NETO A PAGAR:                     ₡261,523.00
═══════════════════════════════════════════════════════

Nota: CCSS Patronal (26.83%): ₡81,697.00
      Costo total empleador: ₡343,220.00

Firma: _________________    Fecha: __________

═══════════════════════════════════════════════════════
Este documento es generado electrónicamente.
Cualquier consulta comunicarse con Recursos Humanos.
═══════════════════════════════════════════════════════
```

**Duración estimada:** 7-10 días de desarrollo

---

### FASE 3 - Gestión de Deducciones y Préstamos

**Objetivo:** Sistema completo para gestionar deducciones nominales (vales, préstamos, anticipos)

#### Backend - Tablas Nuevas:
- ✅ **EmployeeLoan:** Préstamos y anticipos
  ```prisma
  model EmployeeLoan {
    id              String   @id @default(cuid())
    userId          String
    user            User     @relation(fields: [userId], references: [id])
    
    // Préstamo
    amount          Decimal  @db.Decimal(10, 2) // Monto total
    reason          String   // "Adelanto quincenal", "Préstamo personal"
    installments    Int      // Cuotas (ej: 6 quincenas)
    installmentAmt  Decimal  @db.Decimal(10, 2) // Monto por cuota
    
    // Control
    paidInstallments Int     @default(0)
    remainingAmount  Decimal  @db.Decimal(10, 2)
    status          String   // "ACTIVE" | "PAID" | "CANCELLED"
    
    // Aprobación
    approvedByUserId String
    approvedBy      User     @relation(fields: [approvedByUserId], references: [id], name: "ApprovedLoans")
    approvedAt      DateTime
    
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt

    @@index([userId, status])
  }
  ```

- ✅ **PayrollDeduction:** Deducciones manuales
  ```prisma
  model PayrollDeduction {
    id              String   @id @default(cuid())
    userId          String
    user            User     @relation(fields: [userId], references: [id])
    
    // Deducción
    type            String   // "VALE" | "LOAN_PAYMENT" | "UNPAID_DAYS" | "OTHER"
    amount          Decimal  @db.Decimal(10, 2)
    description     String
    
    // Para cuál periodo aplica
    period          String   // "2026-04-15_2026-04-30"
    periodStart     DateTime
    periodEnd       DateTime
    
    // Estado
    status          String   // "PENDING" | "APPLIED" | "CANCELLED"
    appliedInPayslip String? // ID del Payslip donde se aplicó
    
    createdByUserId String
    createdBy       User     @relation(fields: [createdByUserId], references: [id], name: "CreatedDeductions")
    
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt

    @@index([userId, period])
    @@index([status])
  }
  ```

#### Backend - Endpoints:
**Préstamos:**
  - `GET /admin/loans` - Lista de todos los préstamos
  - `POST /admin/loans` - Crear préstamo
  - `GET /admin/loans/:userId` - Préstamos de un usuario
  - `POST /admin/loans/:id/pay-installment` - Marcar cuota como pagada manualmente
  - `POST /admin/loans/:id/cancel` - Cancelar préstamo

**Deducciones:**
  - `GET /admin/deductions/:period` - Deducciones del periodo
  - `POST /admin/deductions` - Crear deducción manual
  - `PUT /admin/deductions/:id` - Editar deducción
  - `DELETE /admin/deductions/:id` - Eliminar deducción (si no aplicada)

#### Frontend - Páginas Nuevas:

**Admin - Préstamos:**
```
/admin/loans

┌─────────────────────────────────────────┐
│ 💳 Préstamos y Anticipos                │
├─────────────────────────────────────────┤
│ [+ Nuevo Préstamo]                      │
│                                         │
│ Usuario     │Monto  │Cuotas│Pagadas│Est│
│ ───────────────────────────────────────│
│ Juan Pérez  │₡50k   │6     │3/6   │ACT │
│   Queda: ₡25,000 (3 cuotas)            │
│   [Ver Detalle] [Pagar Cuota]          │
│                                         │
│ María López │₡30k   │3     │3/3   │PAG │
│   Préstamo completado ✅                │
└─────────────────────────────────────────┘
```

**Admin - Deducciones:**
```
/admin/payroll/deductions

┌─────────────────────────────────────────┐
│ ➖ Deducciones del Periodo              │
│    16-30 Mayo 2026                      │
├─────────────────────────────────────────┤
│ [+ Nueva Deducción]                     │
│                                         │
│ Usuario      │Tipo         │Monto      │
│ ───────────────────────────────────────│
│ Juan Pérez   │Vale dinero  │₡10,000   │
│              │[Editar] [Eliminar]      │
│                                         │
│ María López  │Préstamo #12 │₡8,333    │
│              │(Auto - cuota 4/6)       │
│                                         │
│ Carlos Ruiz  │Días no trab.│₡28,000   │
│              │[Editar] [Eliminar]      │
│                                         │
│ TOTAL DEDUCCIONES: ₡46,333              │
└─────────────────────────────────────────┘
```

#### Lógica de Auto-Deducción:

Cuando se genera una planilla (`POST /admin/payroll/generate`):

1. **Detectar préstamos activos:**
   - Buscar todos los `EmployeeLoan` con `status = "ACTIVE"`
   - Por cada préstamo, crear automáticamente un `PayrollDeduction` tipo `LOAN_PAYMENT`
   - Monto = `installmentAmt`
   - Actualizar `paidInstallments++` y `remainingAmount`
   - Si `paidInstallments === installments`, marcar préstamo como `PAID`

2. **Incluir deducciones manuales:**
   - Buscar todos los `PayrollDeduction` con `period = periodoActual` y `status = "PENDING"`
   - Incluirlos en el campo `otherDeductions` del Payslip
   - Marcar como `status = "APPLIED"` y guardar `appliedInPayslip = payslipId`

3. **Calcular días no trabajados:**
   - Si admin marcó días no trabajados, calcular:
   - `unpaidDaysAmount = díasNoTrabajados × (hourlyRate × 8h)`

**Duración estimada:** 3-4 días de desarrollo

---

### FASE 4 - Avanzado y Optimizaciones

**Objetivo:** Funcionalidades premium y mejoras avanzadas

#### Features:
- ✅ **WebSocket para sincronización en tiempo real:**
  - Notificación push cuando admin aprueba vacaciones/préstamos
  - Actualización en vivo del contador en navbar
  - Sincronización entre múltiples dispositivos del mismo usuario

- ✅ **Calendario de meetings programados:**
  - Admin puede programar meetings del equipo
  - Notificación automática 10 min antes
  - Auto-switch a "Meeting" si usuario está en "Working"

- ✅ **Notificaciones push/email:**
  - Email cuando colilla de pago esté lista
  - Email cuando solicitud de vacaciones sea aprobada/rechazada
  - Push notification cuando se acerca hora de Break/Lunch

- ✅ **Metas de productividad por equipo:**
  - Admin define meta de tiempo efectivo (ej: 7.5h/día)
  - Dashboard muestra % de cumplimiento por persona
  - Alertas si alguien está consistentemente bajo la meta

- ✅ **Dashboard ejecutivo (métricas globales):**
  ```
  ┌─────────────────────────────────────────┐
  │ 📊 Dashboard Ejecutivo - Mayo 2026      │
  ├─────────────────────────────────────────┤
  │ Productividad Promedio: 87% ✅          │
  │ Tiempo Efectivo: 7.2h/día               │
  │ Horas Extra Total: 48h                  │
  │ Costo Nómina: ₡2,450,000               │
  │                                         │
  │ Top Performers:                         │
  │ 1. María López - 92% eficiencia         │
  │ 2. Juan Pérez - 89% eficiencia          │
  │ 3. Carlos Ruiz - 87% eficiencia         │
  │                                         │
  │ Necesitan Atención:                     │
  │ • Pedro Gómez - 68% eficiencia ⚠️       │
  │ • Ana Castro - Muchos excesos en break  │
  └─────────────────────────────────────────┘
  ```

- ✅ **Comparación entre periodos:**
  - Gráfica comparativa de últimos 6 meses
  - Identificar tendencias (mejora/empeoramiento)
  - Alertas automáticas si hay caída >10% en productividad

- ✅ **Detección de patrones (ML básico):**
  - "Juan siempre llega tarde los lunes (promedio 15 min)"
  - "María toma Lunch más largo los viernes"
  - "El equipo es más productivo Martes-Jueves"
  - Sugerencias automáticas para admin

- ✅ **Reportes avanzados:**
  - Costo por proyecto (si se integra con sistema de proyectos)
  - Análisis de rentabilidad por empleado
  - Predicción de costos de nómina del próximo periodo

- ✅ **Integración con otros sistemas:**
  - Sincronización con sistema de facturación (horas facturables)
  - API para integraciones externas
  - Webhooks para eventos importantes

**Duración estimada:** 10-15 días de desarrollo

---

## 15. Métricas de Éxito

### Indicadores Clave (KPIs):

1. **Adopción:**
   - % de usuarios marcando diariamente
   - Objetivo: >95%

2. **Precisión:**
   - % de días sin errores de marcaje
   - Objetivo: >90%

3. **Eficiencia:**
   - Tiempo efectivo promedio por día
   - Objetivo: >7.5h (93.75% de 8h)

4. **Excesos:**
   - Minutos de exceso en breaks por semana
   - Objetivo: <30 min por persona

5. **OT:**
   - Horas extra promedio por persona/mes
   - Objetivo: Monitorear para control de costos

---

## 16. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Usuarios olvidan marcar entrada | Alta | Medio | Modal bloqueante + notificaciones |
| Usuarios olvidan marcar OFF | Media | Alto | Modal automático a los 5min |
| Excesos sistemáticos en breaks | Media | Medio | Reportes semanales + alertas |
| Pérdida de conexión durante marca | Baja | Alto | Queue local + retry automático |
| Conflictos en múltiples dispositivos | Media | Medio | WebSocket (Fase 2) |
| Rechazo al sistema por los empleados | Media | Alto | Dashboard personal transparente |

---

## 17. Consideraciones Legales y Normativa de Costa Rica

### 17.1 Código de Trabajo - Costa Rica

**Artículos Relevantes:**

1. **Jornada máxima:** 8 horas diarias, 48 horas semanales (Art. 136-143)
2. **Descansos obligatorios:** Breaks son derecho laboral
3. **Horas extra:** Máximo 4 horas por día, pago con recargo mínimo 50% (Art. 139)
4. **Vacaciones:** 2 semanas por año trabajado (Art. 153-163)
5. **Registro obligatorio:** Empleador debe llevar control de horas (Art. 144)

**Sistema cumple con:**
- ✅ Registro preciso de horas trabajadas
- ✅ Control de descansos
- ✅ Límite de OT configurable (máx 4h/día)
- ✅ Auditoría completa con timestamp
- ✅ Transparencia para empleados (dashboard personal)
- ✅ Correcciones con motivo obligatorio

---

### 17.2 Sistema de Nómina - Costa Rica

#### **Salarios por Hora:**
- **Configuración:** Cada empleado tiene tarifa por hora personalizada
- **Variabilidad:** Dentro del mismo rol, diferentes personas pueden tener diferentes tarifas
- **Actualización:** Admin puede actualizar tarifas con fecha efectiva (historial completo)
- **Moneda:** Soporta CRC (colones) y USD (dólares)

**Ejemplo:**
```
Rol: Agente de Ventas
- Juan Pérez: ₡3,500/hora
- María López: ₡4,200/hora
- Carlos Ruiz: $15.00/hora

(Diferentes tarifas para mismo rol)
```

#### **Multiplicadores de Pago:**

**1. Horas Extra (OT) - 1.5x:**
```
Artículo 139 Código de Trabajo:
"Las horas extraordinarias se pagarán con un cincuenta por ciento
más de los sueldos o salarios estipulados"

Cálculo:
Tarifa base: ₡3,500/hora
OT (1.5x): ₡3,500 × 1.5 = ₡5,250/hora
```

**2. Feriados - 2.0x:**
```
Trabajo en día feriado se paga al doble

Feriado Obligatorio (con goce de salario):
- NO trabaja: Se paga 1 día completo (8h)
- SÍ trabaja: Se paga 1 día (base) + 2.0x las horas trabajadas
  = Total: 3 días de pago (24h)

Feriado Nacional (sin goce):
- NO trabaja: No se paga
- SÍ trabaja: Se paga 2.0x las horas trabajadas
```

**Feriados Obligatorios Costa Rica:**
- 1 de Enero (Año Nuevo)
- 11 de Abril (Batalla de Rivas)
- Jueves y Viernes Santo (móvil)
- 1 de Mayo (Día del Trabajo)
- 25 de Julio (Anexión Guanacaste)
- 15 de Agosto (Día de la Madre)
- 15 de Septiembre (Independencia)
- 25 de Diciembre (Navidad)

---

#### **Deducciones Obligatorias:**

**1. Caja Costarricense de Seguro Social (CCSS):**

**Empleado (10.83%):**
```
Desglose:
- Seguro de Enfermedad y Maternidad (SEM): 5.50%
- Invalidez, Vejez y Muerte (IVM): 2.84%
- Banco Popular: 1.00%
- Aporte Pensiones Complementarias: 1.00%
- Aporte Ley Protección Trabajador: 0.50%
- Asociación Solidarista: 0.02%
- Otros conceptos: -0.03%
────────────────────────────────────────
TOTAL EMPLEADO: 10.83%

Ejemplo:
Salario bruto: ₡300,000
CCSS empleado: ₡300,000 × 0.1083 = ₡32,490
```

**Patrono (26.83%):**
```
Desglose:
- Seguro de Enfermedad y Maternidad (SEM): 9.25%
- Invalidez, Vejez y Muerte (IVM): 5.08%
- Banco Popular: 0.25%
- Ley Protección Trabajador: 3.00%
- Cuota INA: 1.50%
- Fondo Desarrollo Social y Asignaciones: 5.00%
- IMAS: 0.50%
- FODESAF: 1.00%
- Aporte IMAS: 0.50%
- Pensiones Complementarias: 0.25%
- FCL (Fondo de Capitalización Laboral): 0.50%
────────────────────────────────────────
TOTAL PATRONO: 26.83%

Ejemplo:
Salario bruto: ₡300,000
CCSS patrono: ₡300,000 × 0.2683 = ₡80,490

NOTA: Este monto NO se deduce del empleado,
      es costo adicional del empleador
```

**Costo Total Real:**
```
Salario bruto empleado: ₡300,000
CCSS empleado (10.83%): ₡32,490 (deducido)
CCSS patrono (26.83%): ₡80,490 (costo adicional)
────────────────────────────────────────
Empleado recibe: ₡267,510 (neto)
Empleador paga: ₡380,490 (costo total real)
```

---

#### **Deducciones Nominales (Opcionales):**

**1. Vales de Dinero:**
- Adelantos en efectivo solicitados por empleado
- Admin registra monto y periodo de deducción
- Se restan del salario neto

**2. Préstamos Adelantados:**
- Préstamos internos de la empresa
- Configurables en cuotas (ej: 6 quincenas)
- Deducción automática en cada planilla
- Sistema calcula saldo restante

**3. Días No Trabajados (sin justificación):**
```
Cálculo:
Días faltados × (tarifa_hora × 8h)

Ejemplo:
Juan faltó 2 días sin justificar
Tarifa: ₡3,500/hora
Deducción: 2 × (₡3,500 × 8h) = ₡56,000
```

---

#### **Incapacidades (Sick Leave):**

**Sistema de Pago CCSS:**

```
Primeros 3 días de incapacidad:
- Empleador paga: 60%
- CCSS paga: 40%

Días 4 en adelante:
- CCSS paga: 100%
```

**Ejemplo:**
```
Empleado: Juan Pérez
Tarifa: ₡3,500/hora
Incapacidad: 7 días (Lunes a Domingo, incluyendo fin de semana)

Días 1-3 (primeros 3 días):
  Empleador (60%): 3 × 8h × ₡3,500 × 0.60 = ₡50,400
  CCSS (40%):      3 × 8h × ₡3,500 × 0.40 = ₡33,600

Días 4-7 (siguientes 4 días):
  CCSS (100%):     4 × 8h × ₡3,500 × 1.00 = ₡112,000

Total empleador paga: ₡50,400
Total CCSS paga: ₡145,600
Total empleado recibe: ₡196,000

IMPORTANTE: El empleado sigue recibiendo su salario,
pero parte viene de CCSS, no todo del empleador.
```

**Documentación Requerida:**
- Número de documento CCSS
- Nombre del doctor/clínica emisora
- Fechas de inicio y fin
- Aprobación de admin

---

#### **Vacaciones:**

**Acumulación:**
```
Ley: 2 semanas (14 días naturales) por año trabajado
Simplificado: 1 día por mes trabajado

Cálculo:
Fecha ingreso: 15/01/2024
Fecha actual: 15/05/2026
Meses trabajados: 28 meses

Vacaciones acumuladas: 28 días
Vacaciones usadas: 8 días
Balance actual: 20 días ✅
```

**Uso:**
- Empleado solicita con anticipación
- Admin aprueba o rechaza
- Al aprobar, se restan del balance
- NO se deducen del salario (vacaciones son pagadas)
- En planilla aparece como "Días de vacaciones usados: X" (informativo)

**En Caso de Renuncia:**
```
Si el empleado renuncia o es despedido, se le paga
el proporcional de vacaciones no gozadas:

Ejemplo:
Vacaciones acumuladas: 20 días
Tarifa: ₡3,500/hora

Pago vacaciones: 20 días × 8h × ₡3,500 = ₡560,000

Este monto se suma a la liquidación final
```

---

#### **Aprovisionamientos (Provisiones):**

**1. Aguinaldo (8.33%):**
```
Ley: Empleado recibe 1 mes de salario extra en Diciembre
Cálculo: 1/12 del salario anual = 8.33% mensual

Acumulación:
Cada mes/quincena se provisiona 8.33% del salario bruto
NO se paga al empleado en cada periodo
Se acumula y se paga completo en Diciembre

Ejemplo:
Salario bruto quincenal: ₡300,000
Aguinaldo acumulado: ₡300,000 × 0.0833 = ₡24,990

En planilla aparece como:
"Aguinaldo acumulado: ₡24,990 (no pagado)"
```

**2. Cesantía (5.33%):**
```
Ley: Fondo de cesantía para pagar al empleado cuando
termine la relación laboral (renuncia o despido)

Cálculo: 5.33% mensual (aproximado)

Acumulación:
Cada mes/quincena se provisiona 5.33%
NO se paga al empleado en cada periodo
Se acumula y se paga completo al finalizar contrato

Ejemplo:
Salario bruto quincenal: ₡300,000
Cesantía acumulada: ₡300,000 × 0.0533 = ₡15,990

En planilla aparece como:
"Cesantía acumulada: ₡15,990 (no pagado)"
```

**Fórmula de Cesantía al Despedir:**
```
Años trabajados    │ Días de cesantía
───────────────────┼─────────────────
< 3 meses          │ 0 días
3-6 meses          │ 7 días
6-12 meses         │ 14 días
1-5 años           │ 19.5 días por año
5-10 años          │ 20 días por año
10-15 años         │ 21.5 días por año
15-20 años         │ 23 días por año
> 20 años          │ 24.5 días por año

El sistema provisiona el 5.33% para cubrir este pago
```

**3. Vacaciones (4.17%):**
```
Ley: El empleado tiene derecho a vacaciones pagadas
Cálculo: 4.17% mensual del salario bruto

Acumulación:
Cada mes/quincena se provisiona 4.17%
NO se paga al empleado en cada periodo
Se acumula como fondo disponible

Ejemplo:
Salario bruto quincenal: ₡300,000
Vacaciones acumuladas: ₡300,000 × 0.0417 = ₡12,510

En planilla aparece como:
"Vacaciones acumuladas: ₡12,510"

Cuando el empleado toma vacaciones, se descuenta de este fondo.
```

---

### 17.3 Ejemplo de Colilla Completa

```
═══════════════════════════════════════════════════════
              EMPRESA ABC S.A.
              COLILLA DE PAGO - QUINCENA
═══════════════════════════════════════════════════════
Empleado: Juan Pérez Gómez
Cédula: 1-1234-5678
Puesto: Agente de Ventas
Periodo: 15/04/2026 - 30/04/2026
Días trabajados: 11 días

───────────────────────────────────────────────────────
DEVENGADO (Ingresos)
───────────────────────────────────────────────────────
Tarifa base: ₡3,500/hora

Horas regulares:        82.00h × ₡3,500 = ₡287,000.00
Horas reunión:           4.00h × ₡3,500 = ₡14,000.00
Horas extra (1.5x):      2.00h × ₡5,250 = ₡10,500.00
                                          ────────────
TOTAL DEVENGADO                           ₡311,500.00
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
DEDUCCIONES
───────────────────────────────────────────────────────
CCSS Empleado (10.83%)                    ₡33,735.00

Deducciones Nominales:
  • Vale de dinero                        ₡10,000.00
  • Préstamo #12 (cuota 4/6)              ₡8,333.00
                                          ────────────
TOTAL DEDUCCIONES                         ₡52,068.00
───────────────────────────────────────────────────────

───────────────────────────────────────────────────────
APROVISIONAMIENTOS (Acumulados, no pagados en planilla)
───────────────────────────────────────────────────────
Aguinaldo (8.33%)                         ₡25,948.00
Cesantía (5.33%)                          ₡16,603.00
Vacaciones (4.17%)                        ₡12,990.00
───────────────────────────────────────────────────────

═══════════════════════════════════════════════════════
SALARIO NETO A PAGAR:                     ₡259,432.00
═══════════════════════════════════════════════════════

Información Adicional (Costo Empleador):
  CCSS Patrono (26.83%):                  ₡83,596.00
  Costo total real empleador:             ₡395,096.00

Acumulados Año en Curso (YTD):
  Salario bruto: ₡1,246,000
  Aguinaldo acumulado: ₡103,752
  Cesantía acumulada: ₡66,412
  Vacaciones acumuladas: ₡51,958

───────────────────────────────────────────────────────

Firma: _________________    Fecha: __________

═══════════════════════════════════════════════════════
Este documento es generado electrónicamente.
Cualquier consulta comunicarse con Recursos Humanos.
Cédula Jurídica: 3-101-123456
Teléfono: 2200-0000 | Email: rrhh@empresa.cr
═══════════════════════════════════════════════════════
```

---

## 18. Glosario de Términos

### Términos de Timeclock:

| Término | Definición |
|---------|------------|
| **Tiempo Efectivo** | Horas reales de trabajo (Working + Meeting) |
| **Tiempo Pagado** | Horas que se pagan (Working + Meeting + Breaks) |
| **Tiempo Total** | Todo el tiempo en oficina (incluye Lunch) |
| **Job Avoidance** | Tiempo pagado pero no efectivo (excesos en breaks) |
| **OT** | Overtime / Horas Extra (después de jornada regular, máx 4h/día) |
| **Eficiencia** | % de tiempo efectivo vs contratado (meta: >93%) |
| **Exceso** | Tiempo que excede lo permitido para breaks/lunch |
| **Marcaje** | Acción de registrar cambio de estado (clock-in) |
| **OFF** | Fin de jornada laboral |

### Términos de Nómina (Costa Rica):

| Término | Definición |
|---------|------------|
| **Payslip / Colilla** | Detalle de salario del periodo (quincena) |
| **Salario Bruto** | Total devengado antes de deducciones |
| **Salario Neto** | Monto que recibe el empleado (bruto - deducciones) |
| **CCSS** | Caja Costarricense de Seguro Social (10.83% empleado, 26.83% patrono) |
| **SEM** | Seguro de Enfermedad y Maternidad (parte de CCSS) |
| **IVM** | Invalidez, Vejez y Muerte (parte de CCSS) |
| **Aguinaldo** | Pago anual de 1 mes de salario en Diciembre (8.33% mensual) |
| **Cesantía** | Fondo de ahorro para fin de relación laboral (5.33% mensual) |
| **Vacaciones** | Provisión para vacaciones pagadas (4.17% mensual) |
| **Incapacidad** | Sick leave con pago compartido CCSS/empleador |
| **Quincena** | Periodo de pago quincenal (1-15 y 16-30/31) |
| **Feriado Obligatorio** | Día festivo con goce de salario (se paga aunque no trabaje) |
| **Feriado Nacional** | Día festivo sin goce (solo se paga si trabaja, a 2.0x) |
| **Deducción Nominal** | Descuento voluntario: vales, préstamos, días no trabajados |
| **Aprovisionamiento** | Monto que se acumula pero no se paga en planilla regular |
| **YTD** | Year to Date (acumulado del año en curso) |

---

## 19. Contacto y Mantenimiento

**Desarrollador:** GitHub Copilot  
**Fecha de especificación:** 22 de Abril, 2026  
**Última actualización:** 22 de Abril, 2026  

**Próxima revisión:** Después de MVP (Fase 1)

---

## 20. Anexos

### Anexo A: Ejemplos de Cálculo

Ver sección 5.2 - Ejemplo de Cálculo Completo

### Anexo B: Diagramas de Flujo

```
Flujo de inicio de sesión:
┌─────────┐
│ Login   │
└────┬────┘
     │
     ▼
┌────────────────────┐
│ ¿Ya marcó Working? │
└──┬─────────────┬───┘
   │ No          │ Sí
   ▼             ▼
┌──────────┐  ┌────────────┐
│ Modal    │  │ Dashboard  │
│ Bloqueo  │  │ Normal     │
└────┬─────┘  └────────────┘
     │
     ▼
┌──────────────┐
│ Marca Working│
└──────┬───────┘
       │
       ▼
┌────────────┐
│ Desbloqueado│
└────────────┘
```

### Anexo C: Capturas de Pantalla (Mockups)

Ver secciones 9, 10 y 11 para mockups de UI

---

**FIN DEL DOCUMENTO**

---

## ✅ Confirmación de Lectura

**Antes de iniciar implementación, confirmar:**
- [  ] He leído todo el documento
- [  ] Entiendo los cálculos de tiempo pagado vs efectivo
- [  ] Entiendo el flujo de marcaje y estados
- [  ] Entiendo las reglas de OT
- [  ] Estoy listo para iniciar FASE 1 (MVP)

**Firma de aprobación:** ___________________  
**Fecha:** ___________________
