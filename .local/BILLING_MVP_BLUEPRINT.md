# Mini Sistema de Cobros y Verificacion (MVP)

## Objetivo
Construir un modulo interno en este repo para gestionar cobro por contrato, con trazabilidad total y validacion manual de pagos antes de emitir recibo.

No busca contabilidad completa ni facturacion electronica fiscal en esta etapa.

## Alcance funcional (MVP)
1. Al firmarse un contrato, crear automaticamente un expediente de cobro.
2. Generar factura interna inicial del contrato (comercial/interna).
3. Registrar abono inicial de reserva (en estado pendiente de verificacion).
4. Permitir registrar abonos adicionales uno por uno.
5. Adjuntar comprobante (imagen/PDF) por cada abono reportado.
6. Validar abono manualmente contra banco (aprobado/rechazado).
7. Al reportar abono: crear recibo interno en estado pendiente de verificacion.
8. Solo al verificar banco: aprobar/enviar recibo al cliente y actualizar estado de cuenta.
9. Mantener bitacora inmutable de acciones con usuario, fecha y cambios.

## Conceptos de negocio
- Factura interna: documento comercial del contrato (no fiscal por ahora).
- Abono: pago reportado por cliente, aun no necesariamente confirmado.
- Verificacion: aprobacion manual de abono por usuario autorizado.
- Recibo: documento interno ligado al abono; nace pendiente y solo se aprueba/envia tras verificacion bancaria.
- Nota de credito: ajuste/reversion formal sobre factura o recibo, con impacto en saldo y trazabilidad.
- Saldo a favor: credito disponible del cliente originado por nota de credito/reembolso, aplicable a futuros cobros.

## Numeracion y relacion obligatoria
1. El numero de factura debe ser exactamente el numero de contrato.
2. La relacion FacturaInterna <-> Contrato debe ser 1:1 (unica e inmutable).
3. El numero de contrato/factura se genera automaticamente y no puede editarse manualmente.
4. Los recibos deben tener numeracion interna propia, pero deben incluir referencia obligatoria al numero de contrato/factura.
5. Toda nota de credito debe referenciar explicitamente el numero de contrato/factura y el documento origen (abono o recibo).

## Flujo operativo recomendado
1. Contrato pasa a estado firmado.
2. Sistema crea FacturaInterna con saldo inicial.
3. Sistema registra Abono de reserva como ABONO_REPORTADO.
4. Operador carga o confirma comprobante de reserva.
5. Sistema crea Recibo en estado RECIBO_PENDIENTE_VERIFICACION y lo asocia al Abono.
6. Usuario con permiso de verificacion revisa banco y ejecuta Verificar.
7. Sistema cambia Abono a ABONO_VERIFICADO.
8. Sistema aprueba el Recibo y lo envia al cliente.
9. Sistema recalcula saldo de FacturaInterna.
10. Si saldo llega a 0, marca factura en PAGADA.

## Estados (propuestos)
### FacturaInterna
- FACTURA_EMITIDA
- FACTURA_PARCIAL
- FACTURA_PAGADA
- FACTURA_ANULADA

### Abono
- ABONO_REPORTADO
- ABONO_EN_REVISION
- ABONO_VERIFICADO
- ABONO_RECHAZADO

### Recibo
- RECIBO_PENDIENTE_VERIFICACION
- RECIBO_APROBADO_ENVIADO
- RECIBO_ANULADO

### Nota de credito
- NC_EMITIDA
- NC_APLICADA
- NC_ANULADA

## Reglas criticas
1. El recibo puede crearse al reportar el abono, pero no puede aprobarse ni enviarse si el abono no esta verificado.
2. Todo cambio de estado requiere usuario autenticado.
3. ABONO_RECHAZADO requiere motivo obligatorio.
4. Verificacion registra usuario, fecha/hora y observacion.
5. Aprobacion/envio de recibo registra usuario, fecha/hora y destino.
6. No permitir eliminar abonos; solo cambios de estado auditados.
7. Factura anulada no acepta nuevos abonos.
8. No permitir sobrepago sin confirmacion explicita (flag controlado).
9. Todo ajuste negativo de factura/abono debe hacerse por nota de credito (no por edicion directa de montos historicos).
10. Si una nota de credito genera excedente, este debe quedar como saldo a favor visible del cliente.

## Auditoria obligatoria
Registrar en tabla de bitacora para cada evento:
- entidad: CONTRACT, INVOICE, PAYMENT, RECEIPT
- entidadId
- accion (CREATE, UPDATE, VERIFY, REJECT, ISSUE_RECEIPT, VOID, etc.)
- actorUserId
- actorName
- timestamp UTC
- beforeJson (nullable)
- afterJson (nullable)
- sourceIp (nullable)
- userAgent (nullable)

## Pantallas (Next)
1. Bandeja de Cobros (/billing)
   - Filtros por estado, rango de fecha, agente, cliente.
   - Columnas: cliente, contrato, total, saldo, estado, ultimo movimiento.
   - Accion: Abrir estado de cuenta.

2. Estado de Cuenta por Contrato (/billing/:contractId)
   - Resumen: total, verificado, pendiente, saldo.
   - Timeline de movimientos (auditable).
   - Lista de abonos con estado, comprobante y acciones.
   - Botones:
     - Reportar abono
      - Ver recibo pendiente
     - Marcar en revision
     - Verificar abono
     - Rechazar abono
      - Aprobar y enviar recibo (solo verificado)
   - Emitir nota de credito

3. Historial de Auditoria (/billing/audit)
   - Filtros por entidad, accion, usuario, fecha.
   - Vista de before/after para trazabilidad.

4. Ajuste en Historial actual (/history)
   - Cambiar accion Enviar facturacion por Gestionar cobros.

5. Estado de Cuenta del Cliente (/billing/clients/:clientId)
   - Consolidado de facturas, recibos, notas de credito y saldo a favor.
   - Historial cronologico y saldo actual visible en una sola pantalla.

## Endpoints backend (Nest) sugeridos
Base: /billing

1. POST /billing/contracts/:contractId/bootstrap
   - Crea factura interna inicial desde contrato firmado.

2. GET /billing/contracts
   - Lista y filtros de bandeja.

3. GET /billing/contracts/:contractId/account
   - Estado de cuenta completo + movimientos + abonos.

4. POST /billing/contracts/:contractId/payments/report
   - Reporta abono (pendiente) + adjuntos + crea recibo pendiente.

5. POST /billing/payments/:paymentId/review
   - Mueve a ABONO_EN_REVISION.

6. POST /billing/payments/:paymentId/verify
   - Marca ABONO_VERIFICADO.

7. POST /billing/receipts/:receiptId/approve-send
   - Aprueba y envia recibo al cliente (solo si el pago ya esta verificado).

8. POST /billing/payments/:paymentId/reject
   - Marca ABONO_RECHAZADO con motivo.

9. GET /billing/receipts/:receiptId
   - Consulta recibo emitido.

10. POST /billing/contracts/:contractId/credit-notes
   - Emite nota de credito ligada al contrato/factura.

11. POST /billing/credit-notes/:creditNoteId/apply
   - Aplica nota de credito a saldo pendiente o saldo a favor del cliente.

12. GET /billing/clients/:clientId/account
   - Estado de cuenta consolidado del cliente, incluyendo saldo a favor.

13. GET /billing/audit
   - Consulta bitacora.

## Modelo de datos (Prisma) sugerido
1. BillingInvoice
- id
- contractId (unique)
- contractNumber (unique, usado como invoiceNumber)
- invoiceNumber (igual a contractNumber, inmutable)
- clientId
- currency
- totalAmount
- verifiedAmount
- pendingAmount
- balanceAmount
- status
- issuedAt
- closedAt
- createdByUserId
- createdByName
- createdAt
- updatedAt

2. BillingPayment
- id
- invoiceId
- contractId
- type (RESERVATION, INSTALLMENT, OTHER)
- amount
- currency
- reportedAt
- status
- bankReference
- payerName
- notes
- verifiedAt
- verifiedByUserId
- verifiedByName
- rejectionReason
- createdByUserId
- createdByName
- createdAt
- updatedAt

3. BillingPaymentAttachment
- id
- paymentId
- objectKey
- originalFileName
- mimeType
- size
- createdAt

4. BillingReceipt
- id
- paymentId (unique)
- invoiceId
- receiptNumber (unique)
- contractNumber
- amount
- issuedAt
- issuedByUserId
- issuedByName
- approvedAt
- approvedByUserId
- approvedByName
- sentAt
- sentToEmail
- objectKeyPdf (nullable)
- status
- createdAt

5. BillingCreditNote
- id
- creditNoteNumber (unique)
- contractId
- invoiceId
- contractNumber
- reason
- amount
- status
- sourceDocumentType (PAYMENT|RECEIPT|INVOICE)
- sourceDocumentId
- issuedAt
- issuedByUserId
- issuedByName
- appliedAt
- appliedByUserId
- appliedByName
- objectKeyPdf (nullable)
- createdAt

6. BillingClientBalance
- id
- clientId (unique)
- availableCreditAmount
- currency
- updatedAt

7. BillingAuditLog
- id
- entityType
- entityId
- action
- actorUserId
- actorName
- beforeJson
- afterJson
- sourceIp
- userAgent
- createdAt

## Integraciones actuales
1. Reutilizar Spaces para adjuntos y PDFs.
2. Reutilizar Resend para enviar recibo al cliente.
3. Reutilizar auth/JWT existente para permisos por rol.

## Permisos recomendados
- BILLING_VIEW
- BILLING_REPORT_PAYMENT
- BILLING_VERIFY_PAYMENT
- BILLING_REJECT_PAYMENT
- BILLING_VOID_RECEIPT
- BILLING_AUDIT_VIEW

Si no hay RBAC completo aun, iniciar con:
- Admin: todo
- Agente: reportar y ver
- Supervisor: verificar/rechazar

## Plan de implementacion por fases
### Fase 1 (core)
- Tablas Prisma + migracion.
- Bootstrap de factura desde contrato firmado.
- Reporte de abono con adjunto.
- Estado de cuenta simple.

### Fase 2 (control)
- Verificar/rechazar abonos.
- Crear recibo pendiente al reportar pago.
- Aprobar/envio de recibo solo tras verificacion.
- Recalculo de saldo y estados.

### Fase 3 (creditos y ajustes)
- Emision/aplicacion de notas de credito.
- Manejo de saldo a favor consolidado por cliente.
- Visualizacion clara de credito disponible y movimientos.

### Fase 4 (trazabilidad)
- Bitacora completa before/after.
- Pantalla de auditoria.
- Filtros avanzados y exportacion CSV.

### Fase 5 (operacion)
- Lote semanal para facturacion oficial externa.
- Marcado de enviados y control de conciliacion.

## Criterios de aceptacion MVP
1. Ningun recibo puede aprobarse/enviarse sin verificacion bancaria del abono.
2. Todo evento relevante queda en auditoria.
3. Se puede reconstruir quien hizo cada cambio y cuando.
4. El estado de cuenta por contrato refleja saldo real en todo momento.
5. El flujo completo funciona sin depender del sistema externo.
6. Factura y contrato quedan ligados por el mismo numero de forma inmutable.
7. Todo ajuste negativo queda soportado por nota de credito y auditado.
8. El saldo a favor del cliente es visible y consistente en todo momento.

## Cambio inmediato en UX actual
- En /history, renombrar boton actual de facturacion a Gestionar cobros y redirigir al nuevo modulo interno.

---
Documento base para iniciar implementacion tecnica.
