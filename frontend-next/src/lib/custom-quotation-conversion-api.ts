import { authenticatedFetch, getStoredToken } from './auth-api';
import { resolveApiBase } from './runtime-config';
import type { CreateCustomerDto } from './customers-api';

export type CustomQuotationLeadConversionResult = {
  quotationId: string;
  leadId: string | null;
  customerId: string;
  customerDisplayName: string;
  convertedAt: string | null;
  reusedExistingCustomer: boolean;
  salesOrderReady: true;
};

export async function convertCustomQuotationLeadToCustomer(
  quotationId: string,
  customer: CreateCustomerDto,
): Promise<CustomQuotationLeadConversionResult> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();
  const response = await authenticatedFetch(
    `${apiBase}/custom-quotations/${encodeURIComponent(quotationId)}/convert-lead-to-customer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(customer),
    },
  );

  if (!response.ok) {
    throw new Error('No se pudo completar el cliente. Verifique los datos e intente nuevamente.');
  }

  return response.json();
}
