'use client';

import type { FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';

interface ExchangeRateConfigFormProps {
  open: boolean;
  date: string;
  buyRate: string;
  sellRate: string;
  notes: string;
  saving: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onDateChange: (value: string) => void;
  onBuyRateChange: (value: string) => void;
  onSellRateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ExchangeRateConfigForm({
  open,
  date,
  buyRate,
  sellRate,
  notes,
  saving,
  error,
  onOpenChange,
  onDateChange,
  onBuyRateChange,
  onSellRateChange,
  onNotesChange,
  onSubmit,
}: ExchangeRateConfigFormProps) {
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Configurar tipo de cambio"
      description="Configura el tipo de cambio USD/CRC utilizado por el sistema."
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="exchange-rate-config-form" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar tipo de cambio'}
          </Button>
        </>
      }
    >
      <form id="exchange-rate-config-form" onSubmit={onSubmit} className="grid gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField htmlFor="date" label="Fecha" required>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              required
            />
          </FormField>

          <FormField htmlFor="buyRate" label="TC Compra (₡)" required>
            <Input
              id="buyRate"
              type="number"
              step="0.0001"
              min="0"
              value={buyRate}
              onChange={(event) => onBuyRateChange(event.target.value)}
              placeholder="520.5000"
              required
            />
          </FormField>

          <FormField htmlFor="sellRate" label="TC Venta (₡)" required className="sm:col-span-2">
            <Input
              id="sellRate"
              type="number"
              step="0.0001"
              min="0"
              value={sellRate}
              onChange={(event) => onSellRateChange(event.target.value)}
              placeholder="530.2500"
              required
            />
          </FormField>
        </div>

        <FormField htmlFor="notes" label="Notas (opcional)">
          <Textarea
            id="notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Ejemplo: Fuente: BCCR, actualizado manualmente"
            rows={3}
          />
        </FormField>
      </form>
    </FormSheet>
  );
}
