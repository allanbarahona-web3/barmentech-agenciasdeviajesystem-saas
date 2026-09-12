'use client';

import { Landmark, LoaderCircle, Pencil, Play, Pause, Trash2 } from 'lucide-react';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CompanyBankAccount } from '@/lib/bank-accounts-api';

interface BankAccountsTableProps {
  accounts: CompanyBankAccount[];
  loading: boolean;
  tenantNameFallback: string;
  onEdit: (account: CompanyBankAccount) => void;
  onToggleActive: (account: CompanyBankAccount) => void;
  onDelete: (account: CompanyBankAccount) => void;
}

export function BankAccountsTable({
  accounts,
  loading,
  tenantNameFallback,
  onEdit,
  onToggleActive,
  onDelete,
}: BankAccountsTableProps) {
  const isEmpty = !loading && accounts.length === 0;

  return (
    <DataTableShell
      toolbar={
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconBadge tone="info"><Landmark aria-hidden="true" /></IconBadge>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Cuentas registradas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cuentas disponibles para recibir pagos.</p>
            </div>
          </div>
          <Badge variant="secondary">{accounts.length} cuenta{accounts.length === 1 ? '' : 's'}</Badge>
        </div>
      }
      state={loading ? (
        <div>
          <IconBadge tone="info" className="mx-auto"><LoaderCircle className="animate-spin" aria-hidden="true" /></IconBadge>
          <p className="mt-3 font-medium text-foreground">Cargando cuentas bancarias...</p>
        </div>
      ) : isEmpty ? (
        <div>
          <IconBadge tone="neutral" className="mx-auto"><Landmark aria-hidden="true" /></IconBadge>
          <p className="mt-3 font-medium text-foreground">No hay cuentas bancarias registradas</p>
        </div>
      ) : undefined}
    >
      <Table className="table-fixed min-w-[1080px]">
        <colgroup>
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[13%]" />
          <col className="w-[7%]" />
          <col className="w-[8%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Banco</TableHead>
            <TableHead>Cuenta / IBAN</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead>SINPE</TableHead>
            <TableHead>Titular</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id} className={!account.isActive ? 'opacity-60' : undefined}>
              <TableCell className="truncate font-medium text-foreground" title={account.companyName || tenantNameFallback}>
                {account.companyName || tenantNameFallback}
              </TableCell>
              <TableCell className="truncate font-medium" title={account.bankName}>{account.bankName}</TableCell>
              <TableCell className="truncate font-mono text-xs tabular-nums text-muted-foreground" title={account.accountNumber}>
                {account.accountNumber}
              </TableCell>
              <TableCell>{account.accountType === 'CUENTA_CORRIENTE' ? 'Corriente' : 'Ahorro'}</TableCell>
              <TableCell>
                <Badge variant={account.currency === 'USD' ? 'info' : 'success'}>
                  {account.currency === 'USD' ? '$ USD' : '₡ CRC'}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{account.sinpeNumber || '-'}</TableCell>
              <TableCell className="truncate text-muted-foreground" title={account.accountHolderName}>{account.accountHolderName}</TableCell>
              <TableCell>
                <Badge variant={account.isActive ? 'success' : 'destructive'}>
                  {account.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-center gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(account)} aria-label="Editar cuenta" title="Editar cuenta">
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleActive(account)}
                    aria-label={account.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
                    title={account.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
                  >
                    {account.isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(account)}
                    aria-label="Eliminar cuenta"
                    title="Eliminar cuenta"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}
