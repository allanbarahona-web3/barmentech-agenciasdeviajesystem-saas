import type { Lead } from '@/lib/leads-api';

export type CustomQuotationLeadConversionState = {
  status: string;
  leadId: string | null;
  customerId: string | null;
  leadStatus: Lead['status'] | null;
};

export function canCompleteCustomQuotationCustomer(state: CustomQuotationLeadConversionState): boolean {
  return state.status === 'ACCEPTED'
    && Boolean(state.leadId)
    && state.customerId === null
    && state.leadStatus === 'OPEN';
}

export function customerPrefillFromLead(lead: Pick<Lead, 'fullName' | 'email' | 'phone'>) {
  return {
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone ?? '',
  };
}
