'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import { Input } from '@/components/ui/input';
import { createLead, type Lead } from '@/lib/leads-api';

import {
  emptyLeadQuickCreateValues,
  toCreateLeadInput,
  validateLeadQuickCreate,
  type LeadQuickCreateValues,
} from '../lead-quick-create';

export type LeadQuickCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated: (lead: Lead) => void;
};

export function LeadQuickCreateModal({
  isOpen,
  onClose,
  onLeadCreated,
}: LeadQuickCreateModalProps) {
  const [values, setValues] = useState<LeadQuickCreateValues>(emptyLeadQuickCreateValues);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function close() {
    if (isSaving) {
      return;
    }

    setValues(emptyLeadQuickCreateValues);
    setError(null);
    onClose();
  }

  function setValue<Key extends keyof LeadQuickCreateValues>(key: Key, value: LeadQuickCreateValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const validationError = validateLeadQuickCreate(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const lead = await createLead(toCreateLeadInput(values));
      onLeadCreated(lead);
      setValues(emptyLeadQuickCreateValues);
      onClose();
    } catch {
      setError('No se pudo crear el prospecto. Verifique los datos e intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      title="Crear prospecto"
      description="Registra los datos comerciales iniciales del prospecto."
      actions={(
        <>
          <Button type="button" variant="outline" onClick={close} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" form="lead-quick-create-form" disabled={isSaving}>
            {isSaving ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Creando…</> : 'Crear prospecto'}
          </Button>
        </>
      )}
    >
      <form
        id="lead-quick-create-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error ? (
          <Alert className="sm:col-span-2" variant="destructive">
            <AlertTitle>No se pudo crear el prospecto</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Nombre completo" htmlFor="lead-quick-create-full-name" required>
          <Input
            id="lead-quick-create-full-name"
            autoComplete="name"
            value={values.fullName}
            onChange={(event) => setValue('fullName', event.target.value)}
            disabled={isSaving}
            autoFocus
          />
        </FormField>
        <FormField label="Correo electrónico" htmlFor="lead-quick-create-email" required>
          <Input
            id="lead-quick-create-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setValue('email', event.target.value)}
            disabled={isSaving}
          />
        </FormField>
        <FormField label="Teléfono" htmlFor="lead-quick-create-phone">
          <Input
            id="lead-quick-create-phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => setValue('phone', event.target.value)}
            disabled={isSaving}
          />
        </FormField>
        <FormField label="Empresa" htmlFor="lead-quick-create-company">
          <Input
            id="lead-quick-create-company"
            autoComplete="organization"
            value={values.companyName}
            onChange={(event) => setValue('companyName', event.target.value)}
            disabled={isSaving}
          />
        </FormField>
      </form>
    </FormSheet>
  );
}
