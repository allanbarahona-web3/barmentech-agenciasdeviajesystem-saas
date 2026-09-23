'use client';

import { useEffect, useState } from 'react';
import { UserRoundCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CustomerCreateModal } from '@/features/customers/components/CustomerCreateModal';
import {
  canCompleteCustomQuotationCustomer,
  customerPrefillFromLead,
} from '@/features/custom-quotations/customer-lead-conversion';
import {
  convertCustomQuotationLeadToCustomer,
  type CustomQuotationLeadConversionResult,
} from '@/lib/custom-quotation-conversion-api';
import { getLead, type Lead } from '@/lib/leads-api';

export type CustomQuotationLeadConversionQuotation = {
  id: string;
  status: string;
  leadId: string | null;
  customerId: string | null;
};

type CustomQuotationLeadCustomerConversionProps = {
  quotation: CustomQuotationLeadConversionQuotation;
  onConversionCompleted: (result: CustomQuotationLeadConversionResult) => void;
};

export function CustomQuotationLeadCustomerConversion({
  quotation,
  onConversionCompleted,
}: CustomQuotationLeadCustomerConversionProps) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [converted, setConverted] = useState(false);

  const mayResolveLead = quotation.status === 'ACCEPTED'
    && Boolean(quotation.leadId)
    && quotation.customerId === null
    && !converted;

  useEffect(() => {
    if (!mayResolveLead || !quotation.leadId) {
      setLead(null);
      return;
    }

    const controller = new AbortController();
    void getLead(quotation.leadId, controller.signal)
      .then((resolvedLead) => {
        if (!controller.signal.aborted) setLead(resolvedLead);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLead(null);
      });
    return () => controller.abort();
  }, [mayResolveLead, quotation.leadId]);

  const eligible = canCompleteCustomQuotationCustomer({
    status: quotation.status,
    leadId: quotation.leadId,
    customerId: quotation.customerId,
    leadStatus: lead?.status ?? null,
  });

  if (!eligible || !lead) return null;

  return (
    <>
      <Button type="button" onClick={() => setModalOpen(true)}>
        <UserRoundCheck aria-hidden="true" />
        Completar cliente
      </Button>
      <CustomerCreateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        presentation="foundation"
        title="Completar cliente"
        description="Confirma los datos requeridos para convertir este prospecto en cliente."
        submitLabel="Completar cliente"
        initialValues={customerPrefillFromLead(lead)}
        onSubmitCustomer={async (customer) => {
          const result = await convertCustomQuotationLeadToCustomer(quotation.id, customer);
          setConverted(true);
          onConversionCompleted(result);
        }}
      />
    </>
  );
}
