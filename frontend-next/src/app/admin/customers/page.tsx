'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconBadge } from '@/components/ui/icon-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTableShell } from '@/components/patterns/data-table-shell';
import { PageHeader } from '@/components/patterns/page-header';
import { getCustomers, type CustomerListResponse } from '@/lib/customers-api';
import { CustomerCreateModal } from '@/features/customers/components';

export default function CustomersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerListResponse | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const data = await getCustomers({
        page: currentPage,
        pageSize,
        search: searchTerm || undefined,
      });

      setCustomers(data);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchTerm]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    setCurrentPage(1);
  }

  function handleCustomerClick(customerId: string) {
    router.push(`/admin/customers/${customerId}`);
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const tableState = loading ? (
    <div className="mx-auto grid max-w-sm gap-3" aria-label="Cargando clientes">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  ) : loadError ? (
    <Alert variant="destructive" className="mx-auto max-w-lg text-left">
      <AlertTitle>No se pudieron cargar los clientes</AlertTitle>
      <AlertDescription>{loadError}</AlertDescription>
    </Alert>
  ) : customers?.customers.length === 0 ? (
    <div className="mx-auto max-w-sm">
      <IconBadge tone="info" className="mx-auto mb-3"><Users aria-hidden="true" /></IconBadge>
      <p className="font-medium text-foreground">No se encontraron clientes</p>
      <p className="mt-1 text-muted-foreground">
        {searchTerm ? 'Intenta con otros términos de búsqueda.' : 'Los clientes registrados aparecerán aquí.'}
      </p>
    </div>
  ) : null;

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Users aria-hidden="true" /></IconBadge>Gestión de Clientes</span>}
          description="Consulta y gestiona la información de tus clientes."
          meta={customers ? <Badge variant="info"><Users aria-hidden="true" /> {customers.total} clientes</Badge> : undefined}
          actions={
            <Button type="button" onClick={() => setShowCreateModal(true)}>
              <UserPlus aria-hidden="true" />
              Nuevo cliente
            </Button>
          }
        />

        <DataTableShell
          toolbar={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Lista de clientes</h2>
                <p className="mt-1 text-sm text-muted-foreground">Busca por nombre, identificación o correo electrónico.</p>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground" aria-hidden="true" />
                <label className="sr-only" htmlFor="customer-search">Buscar cliente</label>
                <Input
                  id="customer-search"
                  type="search"
                  placeholder="Buscar cliente"
                  value={searchTerm}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          }
          footer={
            customers && customers.totalPages > 1 ? (
              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">Página {customers.page} de {customers.totalPages} · {customers.total} clientes en total</p>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                    <ChevronLeft aria-hidden="true" />
                    Anterior
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.min(customers.totalPages, page + 1))} disabled={currentPage === customers.totalPages}>
                    Siguiente
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null
          }
          state={tableState}
        >
          {customers ? (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre completo</TableHead>
                  <TableHead>Cédula/ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Registrado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Ver perfil de ${customer.fullName}`}
                    className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => handleCustomerClick(customer.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleCustomerClick(customer.id);
                      }
                    }}
                  >
                    <TableCell className="font-medium text-foreground">{customer.fullName}</TableCell>
                    <TableCell>{customer.idNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.phone || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(customer.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </DataTableShell>
      </div>

      <CustomerCreateModal
        isOpen={showCreateModal}
        presentation="foundation"
        onClose={() => setShowCreateModal(false)}
        onCustomerCreated={() => {
          void loadCustomers();
          setShowCreateModal(false);
        }}
      />
    </main>
  );
}
