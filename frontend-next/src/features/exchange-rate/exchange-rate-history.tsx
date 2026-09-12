'use client';

import { CalendarDays, FileDown, History, Mail, Search } from 'lucide-react';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { FormField } from '@/components/patterns/form-field';
import { SectionCard } from '@/components/patterns/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ExchangeRate } from '@/lib/exchange-rate-api';

interface ExchangeRateHistoryProps {
  filterStartDate: string;
  filterEndDate: string;
  history: ExchangeRate[];
  filtering: boolean;
  exporting: boolean;
  onFilterStartDateChange: (value: string) => void;
  onFilterEndDateChange: (value: string) => void;
  onFilter: () => void;
  onExportPdf: () => void;
  onOpenEmail: () => void;
  formatTimestamp: (date: string) => string;
  formatBusinessDate: (date: string) => string;
}

export function ExchangeRateHistory({
  filterStartDate,
  filterEndDate,
  history,
  filtering,
  exporting,
  onFilterStartDateChange,
  onFilterEndDateChange,
  onFilter,
  onExportPdf,
  onOpenEmail,
  formatTimestamp,
  formatBusinessDate,
}: ExchangeRateHistoryProps) {
  const hasHistory = history.length > 0;

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><History aria-hidden="true" /></IconBadge>Historial de tipos de cambio</span>}
      description="Filtra por rango de fechas (default: último mes)"
      actions={hasHistory ? <Badge variant="secondary">{history.length} registro{history.length === 1 ? '' : 's'}</Badge> : undefined}
      contentClassName="space-y-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_auto_auto_auto] xl:items-end">
        <FormField htmlFor="filterStartDate" label="Fecha Inicial">
          <Input
            id="filterStartDate"
            type="date"
            value={filterStartDate}
            onChange={(event) => onFilterStartDateChange(event.target.value)}
          />
        </FormField>

        <FormField htmlFor="filterEndDate" label="Fecha Final">
          <Input
            id="filterEndDate"
            type="date"
            value={filterEndDate}
            onChange={(event) => onFilterEndDateChange(event.target.value)}
          />
        </FormField>

        <Button type="button" onClick={onFilter} disabled={filtering || !filterStartDate || !filterEndDate}>
          <Search aria-hidden="true" />
          {filtering ? 'Filtrando...' : 'Filtrar'}
        </Button>

        <Button type="button" variant="outline" onClick={onExportPdf} disabled={exporting || !hasHistory}>
          <FileDown aria-hidden="true" />
          {exporting ? 'Exportando...' : 'Exportar PDF'}
        </Button>

        <Button type="button" variant="outline" onClick={onOpenEmail} disabled={!hasHistory}>
          <Mail aria-hidden="true" />
          Enviar por Correo
        </Button>
      </div>

      <DataTableShell
        state={!hasHistory ? (
          <div>
            <IconBadge tone="neutral" className="mx-auto"><CalendarDays aria-hidden="true" /></IconBadge>
            <p className="mt-3 font-medium text-foreground">No hay registros en el rango seleccionado</p>
          </div>
        ) : undefined}
      >
        <Table className="table-fixed min-w-[960px]">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>TC Compra</TableHead>
              <TableHead>TC Venta</TableHead>
              <TableHead>Configurado por</TableHead>
              <TableHead>Hora de Configuración</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((rate) => (
              <TableRow key={rate.id}>
                <TableCell className="font-medium text-foreground">{formatBusinessDate(rate.date)}</TableCell>
                <TableCell className="font-medium tabular-nums text-success">₡{rate.buyRate.toFixed(4)}</TableCell>
                <TableCell className="font-medium tabular-nums text-primary">₡{rate.sellRate.toFixed(4)}</TableCell>
                <TableCell className="truncate" title={rate.setByName}>{rate.setByName}</TableCell>
                <TableCell className="text-muted-foreground">{formatTimestamp(rate.createdAt)}</TableCell>
                <TableCell className="truncate text-muted-foreground" title={rate.notes || '-'}>{rate.notes || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>
    </SectionCard>
  );
}
