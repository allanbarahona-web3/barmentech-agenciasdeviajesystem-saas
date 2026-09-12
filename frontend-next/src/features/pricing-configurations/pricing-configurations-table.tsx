"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePause,
  Hourglass,
  PencilLine,
  ReceiptText,
  SlidersHorizontal,
} from "lucide-react";
import { DataTableShell } from "@/components/patterns/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  catalogUsageLabels,
  hasAdditionalServiceUsage,
} from "@/lib/additional-service-catalog-admin";
import type {
  AdditionalServiceAdminCatalogItem,
  AdditionalServiceCatalogPricingConfiguration,
} from "@/lib/additional-services-admin-api";

const fiscalReadinessPresentation = {
  ABSENT: { label: "Sin perfil fiscal", variant: "warning" },
  INACTIVE: { label: "Perfil fiscal inactivo", variant: "warning" },
  READY: { label: "Listo para facturar", variant: "success" },
  INVALID: { label: "Configuración fiscal inválida", variant: "destructive" },
} as const;

const marginTypeLabels: Record<
  AdditionalServiceCatalogPricingConfiguration["marginType"],
  string
> = {
  FIXED: "Fijo",
  PERCENTAGE: "Porcentaje",
};

function formatMargin(
  configuration: AdditionalServiceCatalogPricingConfiguration,
): string {
  const suffix = configuration.marginType === "PERCENTAGE" ? "%" : "";
  return `${configuration.marginValue}${suffix}`;
}

interface PricingConfigurationsTableProps {
  catalog: AdditionalServiceAdminCatalogItem[];
  visibleCatalog: AdditionalServiceAdminCatalogItem[];
  loadError: string;
  activePage: number;
  totalPages: number;
  firstResult: number;
  lastResult: number;
  onRetry: () => void;
  onConfigurePricing: (item: AdditionalServiceAdminCatalogItem) => void;
  onConfigureFiscal: (item: AdditionalServiceAdminCatalogItem) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function PricingConfigurationsTable({
  catalog,
  visibleCatalog,
  loadError,
  activePage,
  totalPages,
  firstResult,
  lastResult,
  onRetry,
  onConfigurePricing,
  onConfigureFiscal,
  onPreviousPage,
  onNextPage,
}: PricingConfigurationsTableProps) {
  const tableState = loadError ? (
    <div>
      <IconBadge tone="destructive" className="mx-auto">
        <AlertCircle aria-hidden="true" />
      </IconBadge>
      <p className="mt-3 font-medium text-foreground">
        No se pudo cargar el catálogo
      </p>
      <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
        {loadError}
      </p>
      <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  ) : catalog.length === 0 ? (
    <div>
      <IconBadge tone="neutral" className="mx-auto">
        <ReceiptText aria-hidden="true" />
      </IconBadge>
      <p className="mt-3 font-medium text-foreground">
        No hay elementos configurados
      </p>
      <p className="mt-2 text-muted-foreground">
        Cree el primer servicio adicional o clasificación fiscal de viaje.
      </p>
    </div>
  ) : undefined;

  return (
    <DataTableShell
      toolbar={
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconBadge tone="info">
              <SlidersHorizontal aria-hidden="true" />
            </IconBadge>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Servicios y configuración comercial
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Márgenes comerciales y preparación fiscal por servicio.
              </p>
            </div>
          </div>
          {!loadError ? (
            <Badge variant="secondary">
              {catalog.length} elemento{catalog.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      }
      state={tableState}
    >
      <Table className="min-w-[1040px] table-fixed">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[16%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[12%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Servicio</TableHead>
            <TableHead className="text-center">Margen</TableHead>
            <TableHead className="text-center">Impuesto</TableHead>
            <TableHead className="text-center">Estado precio</TableHead>
            <TableHead className="text-center">Fiscal</TableHead>
            <TableHead className="text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleCatalog.map((item) => {
            const configuration = item.pricingConfiguration;
            const supportsPricing = hasAdditionalServiceUsage(item);
            const fiscalPresentation =
              fiscalReadinessPresentation[item.fiscalReadiness.status];

            return (
              <TableRow key={item.id}>
                <TableCell className="min-w-0">
                  <p className="truncate font-medium text-foreground" title={item.name}>
                    {item.name}
                  </p>
                  {!supportsPricing ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.usages.map((usage) => (
                        <Badge key={usage} variant="info">
                          {catalogUsageLabels[usage]}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-center">
                  {!supportsPricing ? (
                    <span className="text-muted-foreground">No aplica</span>
                  ) : configuration ? (
                    <div className="grid justify-items-center gap-1">
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatMargin(configuration)}
                      </span>
                      <Badge
                        variant={
                          configuration.marginType === "PERCENTAGE"
                            ? "info"
                            : "secondary"
                        }
                      >
                        {marginTypeLabels[configuration.marginType]}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Sin definir</span>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums text-muted-foreground">
                  {!supportsPricing
                    ? "—"
                    : configuration
                      ? `${configuration.taxPercentage}%`
                      : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {!supportsPricing ? (
                    <Badge variant="outline">No aplica</Badge>
                  ) : configuration ? (
                    <Badge variant={configuration.isActive ? "success" : "warning"}>
                      {configuration.isActive ? (
                        <CircleCheck className="size-3.5" aria-hidden="true" />
                      ) : (
                        <CirclePause className="size-3.5" aria-hidden="true" />
                      )}
                      {configuration.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <Hourglass className="size-3.5" aria-hidden="true" />
                      Pendiente
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={fiscalPresentation.variant}
                    title={item.fiscalReadiness.issues.join(", ") || undefined}
                  >
                    {fiscalPresentation.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {supportsPricing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onConfigurePricing(item)}
                        disabled={
                          item.fiscalReadiness.status !== "READY" &&
                          !configuration?.isActive
                        }
                        title={
                          item.fiscalReadiness.status !== "READY" &&
                          !configuration?.isActive
                            ? "Active y complete el perfil fiscal antes de configurar el precio."
                            : undefined
                        }
                      >
                        {configuration ? (
                          <PencilLine aria-hidden="true" />
                        ) : (
                          <SlidersHorizontal aria-hidden="true" />
                        )}
                        {configuration ? "Editar" : "Configurar"}
                      </Button>
                    ) : null}
                    {supportsPricing &&
                    item.fiscalReadiness.status !== "READY" &&
                    !configuration?.isActive ? (
                      <span className="basis-full text-center text-xs text-warning">
                        Configure y active el perfil fiscal primero.
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onConfigureFiscal(item)}
                    >
                      <ReceiptText aria-hidden="true" />
                      {item.fiscalProfile
                        ? "Editar fiscal"
                        : "Configurar fiscal"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {catalog.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Mostrando {firstResult + 1} a {lastResult} de {catalog.length}{" "}
            resultados
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={activePage === 1}
              onClick={onPreviousPage}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Badge variant="secondary">{activePage}</Badge>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Página siguiente"
              disabled={activePage === totalPages}
              onClick={onNextPage}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </DataTableShell>
  );
}
