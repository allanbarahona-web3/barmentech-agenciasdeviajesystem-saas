"use client";

import {
  AlertCircle,
  Building2,
  CircleCheck,
  CirclePause,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { DataTableShell } from "@/components/patterns/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdditionalServiceSupplier } from "@/lib/additional-services-admin-api";

interface SuppliersTableProps {
  suppliers: AdditionalServiceSupplier[];
  loadError: string;
  onRetry: () => void;
  onEdit: (supplier: AdditionalServiceSupplier) => void;
  onDelete: (supplier: AdditionalServiceSupplier) => void;
}

export function SuppliersTable({
  suppliers,
  loadError,
  onRetry,
  onEdit,
  onDelete,
}: SuppliersTableProps) {
  const openEditorAfterMenuDismissal = (
    supplier: AdditionalServiceSupplier,
  ) => {
    window.requestAnimationFrame(() => onEdit(supplier));
  };

  const tableState = loadError ? (
    <div>
      <IconBadge tone="destructive" className="mx-auto">
        <AlertCircle aria-hidden="true" />
      </IconBadge>
      <p className="mt-3 font-medium text-foreground">
        No se pudieron cargar los proveedores
      </p>
      <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
        {loadError}
      </p>
      <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  ) : suppliers.length === 0 ? (
    <div>
      <IconBadge tone="neutral" className="mx-auto">
        <Building2 aria-hidden="true" />
      </IconBadge>
      <p className="mt-3 font-medium text-foreground">
        No hay proveedores registrados.
      </p>
    </div>
  ) : undefined;

  return (
    <DataTableShell
      toolbar={
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconBadge tone="info">
              <Building2 aria-hidden="true" />
            </IconBadge>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Proveedores registrados
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Proveedores disponibles para servicios adicionales.
              </p>
            </div>
          </div>
          {!loadError ? (
            <Badge variant="secondary">
              {suppliers.length} proveedor{suppliers.length === 1 ? "" : "es"}
            </Badge>
          ) : null}
        </div>
      }
      state={tableState}
    >
      <Table className="min-w-[720px] table-fixed">
        <colgroup>
          <col className="w-[38%]" />
          <col className="w-[38%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Sitio web</TableHead>
            <TableHead className="whitespace-nowrap text-center">Estado</TableHead>
            <TableHead className="whitespace-nowrap text-center">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow key={supplier.id}>
              <TableCell
                className="truncate font-medium text-foreground"
                title={supplier.name}
              >
                {supplier.name}
              </TableCell>
              <TableCell className="truncate">
                {supplier.website ? (
                  <a
                    href={supplier.website}
                    target="_blank"
                    rel="noreferrer"
                    title={supplier.website}
                    className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                  >
                    <span className="truncate">{supplier.website}</span>
                    <ExternalLink
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                ) : (
                  <span className="text-muted-foreground">Sin definir</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={supplier.isActive ? "success" : "destructive"}>
                  {supplier.isActive ? (
                    <CircleCheck className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CirclePause className="size-3.5" aria-hidden="true" />
                  )}
                  {supplier.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Acciones para ${supplier.name}`}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => openEditorAfterMenuDismissal(supplier)}
                    >
                      <Pencil aria-hidden="true" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onDelete(supplier)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}
