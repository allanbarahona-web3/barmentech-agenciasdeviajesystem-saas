'use client';

import type { FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import type { CreateBankAccountInput } from '@/lib/bank-accounts-api';

type EditorError = {
  title: string;
  message: string;
};

interface BankAccountEditorProps {
  isEditing: boolean;
  saving: boolean;
  bankName: string;
  accountNumber: string;
  accountType: CreateBankAccountInput['accountType'];
  currency: CreateBankAccountInput['currency'];
  sinpeNumber: string;
  accountHolderName: string;
  companyName: string;
  notes: string;
  error: EditorError | null;
  onBankNameChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onAccountTypeChange: (value: CreateBankAccountInput['accountType']) => void;
  onCurrencyChange: (value: CreateBankAccountInput['currency']) => void;
  onSinpeNumberChange: (value: string) => void;
  onAccountHolderNameChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function BankAccountEditor({
  isEditing,
  saving,
  bankName,
  accountNumber,
  accountType,
  currency,
  sinpeNumber,
  accountHolderName,
  companyName,
  notes,
  error,
  onBankNameChange,
  onAccountNumberChange,
  onAccountTypeChange,
  onCurrencyChange,
  onSinpeNumberChange,
  onAccountHolderNameChange,
  onCompanyNameChange,
  onNotesChange,
  onSubmit,
  onCancel,
}: BankAccountEditorProps) {
  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
      title={isEditing ? 'Editar cuenta bancaria' : 'Crear cuenta bancaria'}
      description="Registra la información bancaria de la empresa para recibir pagos."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="bank-account-editor-form" disabled={saving}>
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </>
      }
    >
      <form id="bank-account-editor-form" onSubmit={onSubmit} className="grid gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription className="whitespace-pre-line">{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="bank-account-bank-name" label="Banco" required>
            <Input
              id="bank-account-bank-name"
              type="text"
              value={bankName}
              onChange={(event) => onBankNameChange(event.target.value)}
              placeholder="BAC, BCR, Promerica, etc."
              required
            />
          </FormField>

          <FormField
            htmlFor="bank-account-number"
            label="Número de Cuenta / IBAN"
            description="IBAN: CR + 20 dígitos (22 caracteres total)"
            required
          >
            <Input
              id="bank-account-number"
              type="text"
              value={accountNumber}
              onChange={(event) => onAccountNumberChange(event.target.value)}
              placeholder="CR05001614040007456807"
              required
            />
          </FormField>

          <FormField htmlFor="bank-account-type" label="Tipo de Cuenta">
            <Select
              id="bank-account-type"
              value={accountType}
              onChange={(event) => onAccountTypeChange(event.target.value as CreateBankAccountInput['accountType'])}
            >
              <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
              <option value="CUENTA_AHORRO">Cuenta Ahorro</option>
            </Select>
          </FormField>

          <FormField htmlFor="bank-account-currency" label="Moneda">
            <Select
              id="bank-account-currency"
              value={currency}
              onChange={(event) => onCurrencyChange(event.target.value as CreateBankAccountInput['currency'])}
            >
              <option value="CRC">₡ Colones (CRC)</option>
              <option value="USD">$ Dólares (USD)</option>
            </Select>
          </FormField>

          <FormField htmlFor="bank-account-sinpe" label="SINPE Móvil (opcional)">
            <Input
              id="bank-account-sinpe"
              type="text"
              value={sinpeNumber}
              onChange={(event) => onSinpeNumberChange(event.target.value)}
              placeholder="8888-8888"
            />
          </FormField>

          <FormField htmlFor="bank-account-holder" label="Titular de la Cuenta" required>
            <Input
              id="bank-account-holder"
              type="text"
              value={accountHolderName}
              onChange={(event) => onAccountHolderNameChange(event.target.value)}
              required
            />
          </FormField>

          <FormField htmlFor="bank-account-company" label="Nombre Comercial de la Empresa" className="sm:col-span-2">
            <Input
              id="bank-account-company"
              type="text"
              value={companyName}
              onChange={(event) => onCompanyNameChange(event.target.value)}
              placeholder="Nombre comercial de tu empresa"
            />
          </FormField>
        </div>

        <FormField htmlFor="bank-account-notes" label="Notas (opcional)">
          <Textarea
            id="bank-account-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Información adicional sobre esta cuenta"
            rows={2}
          />
        </FormField>
      </form>
    </FormSheet>
  );
}
