'use client';

import { useState } from 'react';
import { CheckCircle2, LoaderCircle, ShoppingCart } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/patterns/section-card';
import { CustomQuotationLeadCustomerConversion } from '@/features/custom-quotations/components/CustomQuotationLeadCustomerConversion';
import {
  materializeCustomQuotationSalesOrder,
  type CustomQuotationVersion,
} from '@/lib/custom-quotations-api';

type CompletionQuotation = {
  id: string;
  status: string;
  leadId: string | null;
  customerId: string | null;
};

type CustomQuotationSalesOrderCompletionProps = {
  quotation: CompletionQuotation;
  version: CustomQuotationVersion;
  onVersionRefreshed: () => Promise<CustomQuotationVersion | null>;
  onQuotationRefreshed: () => Promise<void>;
};

export function CustomQuotationSalesOrderCompletion({
  quotation,
  version,
  onVersionRefreshed,
  onQuotationRefreshed,
}: CustomQuotationSalesOrderCompletionProps) {
  const [materializing, setMaterializing] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAccepted = quotation.status === 'ACCEPTED';
  const requiresCustomer = isAccepted && Boolean(quotation.leadId) && quotation.customerId === null;
  const canMaterialize = isAccepted && quotation.customerId !== null;

  async function materialize() {
    if (!version || materializing || version.salesOrder) return;
    setMaterializing(true);
    setError(null);
    try {
      await materializeCustomQuotationSalesOrder(quotation.id, version.versionId);
      const persistedVersion = await onVersionRefreshed();
      if (!persistedVersion?.salesOrder) throw new Error('CUSTOM_QUOTATION_SALES_ORDER_READ_MISSING');
      await onQuotationRefreshed();
    } catch (requestError) {
      setError(materializationErrorMessage(requestError));
    } finally {
      setMaterializing(false);
    }
  }

  if (!isAccepted) return null;

  return <SectionCard title="Cierre comercial" description="Completa el cliente y genera la orden de venta para continuar con la operación.">
    {conversionMessage ? <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Cliente completado</AlertTitle><AlertDescription>{conversionMessage}</AlertDescription></Alert> : null}
    {requiresCustomer ? <div className="space-y-3"><Alert variant="warning"><AlertDescription>Completa los datos del cliente antes de generar la orden de venta.</AlertDescription></Alert><CustomQuotationLeadCustomerConversion quotation={quotation} onConversionCompleted={() => { setConversionMessage('El prospecto fue convertido correctamente en cliente.'); void onQuotationRefreshed(); }} /></div> : null}
    {canMaterialize ? <div className="space-y-3">
      {error ? <Alert variant="destructive"><AlertTitle>No se pudo generar la orden de venta</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {version.salesOrder ? <Alert variant="success" role="status"><CheckCircle2 aria-hidden="true" className="size-4" /><AlertTitle>Orden de venta creada</AlertTitle><AlertDescription>{version.salesOrder.orderNumber ? `Orden de venta creada: ${version.salesOrder.orderNumber}` : 'La orden de venta ya fue creada.'}</AlertDescription></Alert> : null}
      {!version.salesOrder ? <Button type="button" onClick={() => void materialize()} disabled={materializing}>{materializing ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Creando orden de venta...</> : <><ShoppingCart aria-hidden="true" />Crear orden de venta</>}</Button> : null}
    </div> : null}
  </SectionCard>;
}

function materializationErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('CUSTOMER_REQUIRED')) return 'Completa los datos del cliente antes de generar la orden de venta.';
  if (code.includes('VERSION_NOT_ACCEPTED') || code.includes('NOT_ACCEPTED')) return 'La cotización debe estar aceptada para generar la orden de venta.';
  if (code.includes('VERSION_NOT_FOUND') || code.includes('SALES_ORDER_CONFLICT') || code.includes('SALES_ORDER_READ_MISSING')) return 'No se pudo confirmar la orden de venta. Actualiza la cotización e inténtalo nuevamente.';
  if (code.includes('FORBIDDEN') || code.includes('UNAUTHORIZED')) return 'No tienes permisos para generar la orden de venta.';
  return 'No se pudo generar la orden de venta. Inténtalo nuevamente.';
}
