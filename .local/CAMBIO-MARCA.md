# Cambio de Marca: Lucitours → Viajes Alma Nova

## ✅ Cambios Completados

### Archivos Frontend:
- ✅ `frontend/app.js` - 53 referencias actualizadas
- ✅ `frontend/email-preview.html` - 4 referencias actualizadas  
- ✅ `frontend/sign-contract.html` - 3 referencias actualizadas
- ✅ `frontend/sign-contract.js` - Mensajes de error actualizados
- ✅ `frontend/sign-contract.v3.js` - Mensajes de error actualizados
- ✅ `frontend/index.html` - Firma institucional actualizada

### Archivos Backend:
- ✅ `backend/src/contracts/contracts.service.ts` - 6 referencias actualizadas
- ✅ Plantilla de correo profesional con nuevo nombre
- ✅ Asunto de correos actualizado

### Cambios Específicos:
- **Razón Social**: "VIAJES LUCITOURS TURISMO INTERNACIONAL" → "VIAJES ALMA NOVA"
- **Nombre Comercial**: "Lucitours" → "Viajes Alma Nova"
- **Tagline**: "Tu destino, nuestra pasión" → "Experiencias inolvidables, destinos únicos"
- **Email**: "contratos@lucitour.com" → "contratos@viajesalmanova.com"
- **Logo**: Referencias actualizadas de `logo-lucitour.png` a `logo-almanova.png`

### Contratos y Términos Legales:
- ✅ Todas las cláusulas del contrato actualizadas
- ✅ Encabezados de contratos PDF
- ✅ Firmas institucionales
- ✅ Referencias en términos y condiciones
- ✅ Exoneraciones de responsabilidad
- ✅ Políticas de reembolso

## ⚠️ Pendiente (Importante):

### 1. Logo de la Empresa
📍 **Ubicación**: `/frontend/assets/logo-almanova.png`

Actualmente se está usando el logo antiguo como placeholder temporal. 

**Acción requerida**: Reemplazar con el logo oficial de **Viajes Alma Nova**

### 2. Cédula Jurídica
El contrato aún usa la cédula jurídica: `3-101-960028`

Si "Viajes Alma Nova" es una empresa diferente, debes actualizar:
- Cédula jurídica en `frontend/app.js` (líneas ~1534, ~2234)
- Representante legal si cambió

### 3. Información de Contacto
Actualizar si cambió:
- WhatsApp: Actualmente `6015-9906`
- Correo: Actualmente `contratos@viajesalmanova.com`
- Domicilio fiscal/legal en el contrato

### 4. Variables de Entorno
Si el dominio cambió, actualizar en el backend:
- `CONTRACTS_FROM_EMAIL`
- `PUBLIC_APP_BASE_URL`
- `ALLOWED_ORIGIN`

### 5. Dominio/DNS
Si el sitio web tendrá un nuevo dominio:
- Configurar DNS
- Actualizar certificados SSL
- Actualizar configuración de Resend (correos)

## 📊 Resumen de Cambios

| Categoría | Cambios |
|-----------|---------|
| Archivos actualizados | 8 archivos principales |
| Referencias cambiadas | 67+ ocurrencias |
| ✅ Sin errores de compilación | Backend y Frontend |
| Logo placeholder | Creado temporalmente |

## 🔍 Verificación

```bash
# Verificar que no quedan referencias a "Lucitours"
grep -r "Lucitours" --include="*.js" --include="*.ts" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=backups .
# Resultado esperado: 0 coincidencias
```

---
**Fecha de cambio**: 10 de abril de 2026
**Estado**: ✅ Cambio de marca completado - Pendiente logo y datos legales definitivos
