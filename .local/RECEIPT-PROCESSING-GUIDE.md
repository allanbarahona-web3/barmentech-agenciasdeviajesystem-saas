# 📄 Procesamiento Automático de Comprobantes - Guía de Implementación

## ✅ Estado Actual

### Backend Completado (100%)
- ✅ Schema Prisma actualizado con tablas nuevas
- ✅ Migración aplicada: `20260418173007_add_payment_receipt_processing`
- ✅ Módulo `company-bank-accounts` (CRUD completo)
- ✅ Módulo `payment-verification` con OpenAI Vision
- ✅ Endpoints REST disponibles

### Frontend Completado (95%)
- ✅ API clients creados
- ✅ Página de admin cuentas bancarias: `/admin/bank-accounts`
- ✅ Componente `<ReceiptProcessor/>` creado
- ⚠️ **Falta:** Integrar componente en formulario de pago existente

---

## 🔧 Paso Final: Integrar en Formulario de Pago

### Archivo a Modificar
`frontend-next/src/app/billing/[contractId]/page.tsx`

### 1. Importar el Componente (línea ~10)

\`\`\`typescript
import { ReceiptProcessor } from "@/components/receipt-processor";
import type { ExtractedPaymentData } from "@/lib/payment-verification-api";
\`\`\`

### 2. Agregar Handler para Datos Extraídos (dentro del componente, línea ~100)

\`\`\`typescript
const handleReceiptDataExtracted = (data: ExtractedPaymentData) => {
  // Pre-llenar campos del formulario con datos extraídos
  if (data.amount) {
    setAmount(data.amount.toString());
  }
  
  if (data.date) {
    setPaymentDate(data.date.split('T')[0]); // Formato YYYY-MM-DD
  }
  
  if (data.reference) {
    setBankReference(data.reference);
  }
  
  if (data.payerName) {
    setPayerName(data.payerName);
  }
  
  if (data.paymentCode) {
    setPaymentReference(data.paymentCode.toUpperCase());
  }
  
  if (data.notes) {
    // Si tienes un campo de notas, agrégalo aquí
    // setNotes(data.notes);
  }

  // Mostrar mensaje de éxito
  // Usa tu sistema de toasts/notifications
  console.log("✅ Datos extraídos exitosamente:", data);
};
\`\`\`

### 3. Insertar Componente en el Modal (línea ~1387, ANTES del primer <label>)

\`\`\`typescript
{modalMode === "INSTALLMENT" ? (
  <>
    <p className="muted">
      Contrato: <strong>{account?.invoice.contractNumber || "-"}</strong> · 
      Saldo actual: <strong>{formatMoney(account?.invoice.amounts.balance || 0)}</strong>
    </p>

    <p className="muted">
      El sistema guarda automaticamente fecha/hora de registro y usuario responsable.
    </p>

    {/* ⬇️ AGREGAR AQUÍ ⬇️ */}
    <ReceiptProcessor 
      onDataExtracted={handleReceiptDataExtracted}
      onError={(error) => console.error("Error:", error)}
    />
    {/* ⬆️ FIN AGREGADO ⬆️ */}

    <div className="contracts-grid payment-entry-grid" style={{ marginTop: 10 }}>
      <label>
        Monto
        ...
\`\`\`

---

## 🔑 Configuración Necesaria

### 1. Variable de Entorno Backend

Agregar en `backend/.env`:

\`\`\`bash
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXX
\`\`\`

**Cómo obtener la API Key:**
1. Ir a https://platform.openai.com/
2. Crear cuenta o iniciar sesión
3. Ir a API Keys
4. Crear nueva API key
5. Copiar y pegar en `.env`

**Costo:** ~$0.0001 por comprobante (1 centavo cada 100 comprobantes)

### 2. Registrar Cuentas Bancarias

Antes de procesar comprobantes:

1. Ir a `/admin/bank-accounts` (solo Admin)
2. Registrar cada cuenta bancaria de la empresa:
   - BAC Colones
   - BAC Dólares
   - BCR Colones
   - Etc.

El sistema validará que la cuenta destino del comprobante esté registrada.

---

## 🚀 Cómo Usar (Usuario Final)

### Para Agentes:

1. Abrir contrato en Billing
2. Click en "Registrar abono"
3. **NUEVO:** Subir foto/screenshot del comprobante
4. ⏳ Esperar 2-3 segundos mientras la IA procesa
5. ✅ **Campos se llenan automáticamente:**
   - Monto
   - Fecha
   - Referencia bancaria
   - Nombre del pagador
   - Código de pago (si el cliente lo incluyó en el detalle)
6. Verificar datos y ajustar si es necesario
7. Seleccionar método de pago manualmente (dropdown)
8. Confirmar abono

---

## 📊 Datos Extraídos Automáticamente

| Campo | Fuente en Comprobante | Confiabilidad |
|-------|----------------------|---------------|
| **Monto** | "Monto transferido" / "Monto debitado" | ✅ Alta |
| **Moneda** | Símbolo (₡ o $) | ✅ Alta |
| **Fecha** | Fecha de transacción | ✅ Alta |
| **Referencia** | Número de referencia/documento | ✅ Alta |
| **Banco Origen** | Logo/nombre del banco | ✅ Alta |
| **Banco Destino** | De la cuenta IBAN destino | ✅ Alta |
| **Cuenta Destino** | IBAN en el comprobante | ⚠️ Media |
| **Nombre Pagador** | "Enviado por" / "Por concepto de" | ⚠️ Media |
| **Código de Pago** | Extrae "LUC-XXXXX" del detalle | ✅ Alta (si el cliente lo incluyó) |
| **Notas** | Resto del texto del detalle | ⚠️ Baja |

---

## 🏦 Administración de Cuentas Bancarias

### Acceso
- URL: `/admin/bank-accounts`
- Requiere: Rol ADMIN

### Funciones
- ➕ Crear nueva cuenta
- ✏️ Editar cuenta
- ⏸️ Activar/Desactivar
- 🗑️ Eliminar (solo si no tiene pagos)

### Campos por Cuenta
- Banco (BAC, BCR, Promerica, etc.)
- Número de cuenta / IBAN
- Tipo (Corriente / Ahorro)
- Moneda (CRC / USD)
- SINPE móvil (opcional)
- Titular
- Notas

---

## 🔍 Validaciones Automáticas

Cuando el comprobante es procesado:

1. ✅ **Cuenta Destino:** Valida que el IBAN destino esté registrado
2. ⚠️ **Advertencias:** Si la cuenta no está registrada o está inactiva
3. ✅ **Código de Pago:** Extrae automáticamente si existe en el detalle

---

## 📝 Campos del Modelo de Datos

### Tabla \`CompanyBankAccount\`
\`\`\`prisma
- id, bankName, accountNumber, accountType
- currency, sinpeNumber, accountHolderName
- isActive, notes, createdByUserId, createdByName
- createdAt, updatedAt
\`\`\`

### Tabla \`PaymentReceiptImage\`
\`\`\`prisma
- id, paymentId, objectKey, originalFileName
- extractedData (JSON), extractedAmount, extractedCurrency
- extractedDate, extractedReference, extractedOriginBank
- extractedDestinationBank, extractedDestinationAccount
- extractedPayerName, extractedPaymentCode, extractedNotes
- confidenceScore, processingStatus, processingError
- uploadedByUserId, uploadedByName, createdAt
\`\`\`

### Campos Agregados a \`BillingPayment\`
\`\`\`prisma
- originBank, destinationBank, destinationAccountId
- paymentCode, receiptDate
\`\`\`

---

## 🧪 Testing

### Endpoints Backend

\`\`\`bash
# Listar cuentas bancarias
GET /company-bank-accounts

# Procesar comprobante
POST /payment-verification/process-receipt
Content-Type: multipart/form-data
Body: { receipt: <FILE> }
\`\`\`

### Test Manual

1. Crear cuenta bancaria de prueba
2. Subir uno de los comprobantes de ejemplo
3. Verificar que los campos se llenen correctamente

---

## 💡 Mejoras Futuras (Opcionales)

- [ ] Guardar comprobante procesado en attachment del payment
- [ ] Mostrar preview del comprobante en el modal
- [ ] Histórico de comprobantes procesados
- [ ] Dashboard de precisión de extracción
- [ ] Auto-seleccionar método de pago según tipo detectado
- [ ] OCR offline (Tesseract) como fallback

---

## 🆘 Troubleshooting

### "Error procesando comprobante"
- Verificar que OPENAI_API_KEY esté configurada
- Verificar conexión a internet
- Revisar logs del backend

### "Cuenta destino no registrada"
- Ir a `/admin/bank-accounts`
- Registrar la cuenta manualmente

### "Confianza baja en datos extraídos"
- Imagen borrosa o de baja calidad
- Comprobante de banco no entrenado
- Verificar datos manualmente

---

## 📞 Soporte

Para más información, contactar al equipo de desarrollo.

**Implementado:** Abril 18, 2026  
**Versión:** 1.0.0
