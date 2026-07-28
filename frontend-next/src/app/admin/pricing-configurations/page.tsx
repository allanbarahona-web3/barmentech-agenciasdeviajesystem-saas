"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePause,
  Hourglass,
  PencilLine,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/loading-spinner";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  ToastNotification,
  useToast,
} from "@/components/toast-notification";
import {
  getStoredSession,
  getHomeRouteForRole,
} from "@/lib/auth-api";
import {
  createAdditionalServicePricingConfiguration,
  getAdditionalServiceAdminCatalog,
  updateAdditionalServicePricingConfiguration,
  updateAdditionalServicePricingConfigurationStatus,
  type AdditionalServiceAdminCatalogItem,
  type AdditionalServiceCatalogPricingConfiguration,
  type AdditionalServiceMarginType,
} from "@/lib/additional-services-admin-api";

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

interface PricingConfigurationFormState {
  marginType: AdditionalServiceMarginType;
  marginValue: string;
  taxPercentage: string;
  isActive: boolean;
}

const emptyForm: PricingConfigurationFormState = {
  marginType: "FIXED",
  marginValue: "",
  taxPercentage: "",
  isActive: true,
};

const PAGE_SIZE = 15;

export default function PricingConfigurationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<AdditionalServiceAdminCatalogItem[]>(
    [],
  );
  const [loadError, setLoadError] = useState("");
  const [selectedItem, setSelectedItem] =
    useState<AdditionalServiceAdminCatalogItem | null>(null);
  const [form, setForm] =
    useState<PricingConfigurationFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const loadCatalog = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const items = await getAdditionalServiceAdminCatalog();
      setCatalog(items);
      setCurrentPage(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar la configuración de precios.";
      setLoadError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const session = getStoredSession();

    if (!session?.user?.id) {
      router.replace("/");
      return;
    }

    const role = String(session.user.role || "").toUpperCase();
    if (role !== "ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }

    void loadCatalog();
    // The page performs its single catalog request after the initial auth check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const openConfigurationModal = (
    item: AdditionalServiceAdminCatalogItem,
  ) => {
    const configuration = item.pricingConfiguration;
    setSelectedItem(item);
    setForm(
      configuration
        ? {
            marginType: configuration.marginType,
            marginValue: configuration.marginValue,
            taxPercentage: configuration.taxPercentage,
            isActive: configuration.isActive,
          }
        : emptyForm,
    );
    setFormError("");
  };

  const closeConfigurationModal = () => {
    if (saving) return;
    setSelectedItem(null);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSave = async () => {
    if (!selectedItem || saving) return;

    const marginValue = Number(form.marginValue);
    const taxPercentage = Number(form.taxPercentage);

    if (
      form.marginValue.trim() === "" ||
      !Number.isFinite(marginValue) ||
      marginValue < 0
    ) {
      setFormError("El valor del margen debe ser un número igual o mayor a 0.");
      return;
    }

    if (
      form.taxPercentage.trim() === "" ||
      !Number.isFinite(taxPercentage) ||
      taxPercentage < 0
    ) {
      setFormError(
        "El porcentaje de impuesto debe ser un número igual o mayor a 0.",
      );
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const existingConfiguration = selectedItem.pricingConfiguration;

      if (existingConfiguration) {
        await updateAdditionalServicePricingConfiguration(
          existingConfiguration.id,
          {
            marginType: form.marginType,
            marginValue,
            taxPercentage,
          },
        );

        if (existingConfiguration.isActive !== form.isActive) {
          await updateAdditionalServicePricingConfigurationStatus(
            existingConfiguration.id,
            form.isActive,
          );
        }
      } else {
        await createAdditionalServicePricingConfiguration({
          additionalServiceCatalogId: selectedItem.id,
          marginType: form.marginType,
          marginValue,
          taxPercentage,
          isActive: form.isActive,
        });
      }

      setSelectedItem(null);
      setForm(emptyForm);

      const refreshedCatalog = await getAdditionalServiceAdminCatalog();
      setCatalog(refreshedCatalog);
      showSuccess(
        existingConfiguration
          ? "Configuración de precios actualizada correctamente."
          : "Configuración de precios creada correctamente.",
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración de precios.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader message="Cargando configuración de precios..." />;
  }

  const totalPages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);
  const firstResult = (activePage - 1) * PAGE_SIZE;
  const visibleCatalog = catalog.slice(firstResult, firstResult + PAGE_SIZE);
  const lastResult = Math.min(firstResult + PAGE_SIZE, catalog.length);

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal
        isOpen={selectedItem !== null}
        title={
          selectedItem?.pricingConfiguration
            ? "Editar Configuración de Precios"
            : "Configurar Precio"
        }
        message={
          selectedItem ? (
            <form
              className="space-y-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div>
                <label
                  htmlFor="pricing-service"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Servicio
                </label>
                <input
                  id="pricing-service"
                  type="text"
                  value={selectedItem.name}
                  readOnly
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600"
                />
              </div>

              <div>
                <label
                  htmlFor="pricing-margin-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Tipo de margen
                </label>
                <select
                  id="pricing-margin-type"
                  value={form.marginType}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      marginType: event.target
                        .value as AdditionalServiceMarginType,
                    }));
                    setFormError("");
                  }}
                  disabled={saving}
                  autoFocus
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="FIXED">Fijo</option>
                  <option value="PERCENTAGE">Porcentaje</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pricing-margin-value"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Valor del margen
                </label>
                <input
                  id="pricing-margin-value"
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                  value={form.marginValue}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      marginValue: event.target.value,
                    }));
                    setFormError("");
                  }}
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="pricing-tax-percentage"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Impuesto IVA
                </label>
                <input
                  id="pricing-tax-percentage"
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                  value={form.taxPercentage}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      taxPercentage: event.target.value,
                    }));
                    setFormError("");
                  }}
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <label
                htmlFor="pricing-is-active"
                className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-slate-200 px-3 py-2"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-700">
                    Activo
                  </span>
                  <span className="block text-xs text-slate-500">
                    La configuración estará disponible para su uso.
                  </span>
                </span>
                <input
                  id="pricing-is-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  disabled={saving}
                  className="h-5 w-5 accent-slate-900"
                />
              </label>

              {formError ? (
                <p
                  role="alert"
                  className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {formError}
                </p>
              ) : null}

              <button type="submit" className="sr-only">
                Guardar
              </button>
            </form>
          ) : null
        }
        confirmText={saving ? "Guardando..." : "Guardar"}
        cancelText="Cancelar"
        onConfirm={() => void handleSave()}
        onCancel={closeConfigurationModal}
      />

      <div>
        <header className="mb-[30px] flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-[1.8rem] font-semibold text-slate-900">
              Margen Adicionales
            </h1>
            <p className="m-0 text-slate-500">
              Configura el margen e impuestos para cada servicio adicional.
            </p>
          </div>
          {!loadError && catalog.length > 0 ? (
            <Badge
              variant="outline"
              className="shrink-0 rounded-md border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-600"
            >
              {catalog.length} servicios
            </Badge>
          ) : null}
        </header>

        <section className="rounded-xl bg-white p-[30px] shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
          {loadError ? (
            <div className="px-5 py-10 text-center text-slate-400">
              <div className="mb-3 text-5xl">⚠️</div>
              <h2 className="mb-2 text-lg font-semibold text-slate-700">
                No se pudo cargar el catálogo
              </h2>
              <p className="mx-auto mb-5 max-w-xl text-sm text-slate-500">
                {loadError}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadCatalog()}
                className="border-blue-500 bg-white text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:bg-white dark:text-blue-600 dark:hover:bg-blue-50 dark:hover:text-blue-700"
              >
                Reintentar
              </Button>
            </div>
          ) : catalog.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400">
              <div className="mb-3 text-5xl">📋</div>
              <h2 className="mb-2 text-lg font-semibold text-slate-700">
                No hay servicios adicionales disponibles
              </h2>
              <p className="m-0 text-sm text-slate-500">
                Los servicios del catálogo aparecerán aquí cuando estén
                disponibles.
              </p>
            </div>
          ) : (
            <>
              <div className="history-table-wrap">
                <table className="history-table table-fixed">
                  <thead>
                    <tr>
                      <th className="w-[40%]">Servicio</th>
                      <th className="w-[15%] text-center">Margen</th>
                      <th className="w-[15%] text-center">Impuesto</th>
                      <th className="w-[15%] text-center">Estado</th>
                      <th className="w-[15%] text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCatalog.map((item) => {
                      const configuration = item.pricingConfiguration;

                      return (
                        <tr key={item.id}>
                          <td className="history-col-name">{item.name}</td>
                          <td className="text-center">
                            {configuration ? (
                              <>
                                <div className="font-bold">
                                  {formatMargin(configuration)}
                                </div>
                                <div
                                  className="mt-0.5 text-xs font-semibold"
                                  style={{
                                    color:
                                      configuration.marginType ===
                                      "PERCENTAGE"
                                        ? "#7c3aed"
                                        : "#2563eb",
                                  }}
                                >
                                  {marginTypeLabels[configuration.marginType]}
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-500">
                                Sin definir
                              </span>
                            )}
                          </td>
                          <td className="text-center">
                            {configuration
                              ? `${configuration.taxPercentage}%`
                              : "—"}
                          </td>
                          <td className="text-center">
                            <Badge
                              style={
                                !configuration
                                  ? {
                                      backgroundColor: "#fef3c7",
                                      borderColor: "#fcd34d",
                                      color: "#b45309",
                                    }
                                  : undefined
                              }
                              className={
                                configuration?.isActive
                                  ? "gap-2 border-green-200 bg-green-50 px-3 py-1 text-green-700 hover:bg-green-50 dark:border-green-200 dark:bg-green-50 dark:text-green-700"
                                  : configuration
                                    ? "gap-2 border-orange-200 bg-orange-50 px-3 py-1 text-orange-700 hover:bg-orange-50 dark:border-orange-200 dark:bg-orange-50 dark:text-orange-700"
                                    : "gap-2 border-amber-300 !bg-amber-100 px-3 py-1 !text-amber-800 hover:!bg-amber-100 dark:border-amber-300 dark:!bg-amber-100 dark:!text-amber-800"
                              }
                            >
                              {configuration ? (
                                configuration.isActive ? (
                                  <CircleCheck
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CirclePause
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )
                              ) : (
                                <Hourglass
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              )}
                              {configuration
                                ? configuration.isActive
                                  ? "Activo"
                                  : "Inactivo"
                                : "Pendiente"}
                            </Badge>
                          </td>
                          <td>
                            <div className="flex justify-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openConfigurationModal(item)}
                                className={
                                  configuration
                                    ? "min-w-[118px] gap-2 border-slate-300 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:border-blue-300 dark:hover:bg-blue-50 dark:hover:text-blue-700"
                                    : "min-w-[118px] gap-2 border-blue-500 bg-white text-blue-600 shadow-sm hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:bg-white dark:text-blue-600 dark:hover:bg-blue-50 dark:hover:text-blue-700"
                                }
                              >
                                {configuration ? (
                                  <PencilLine
                                    className="h-4 w-4 text-blue-600"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <SlidersHorizontal
                                    className="h-4 w-4 text-blue-600"
                                    aria-hidden="true"
                                  />
                                )}
                                {configuration ? "Editar" : "Configurar"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <footer className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-500">
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
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    className="h-8 w-8 border-slate-200"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-blue-600 px-2 font-semibold text-white">
                    {activePage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Página siguiente"
                    disabled={activePage === totalPages}
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(totalPages, page + 1),
                      )
                    }
                    className="h-8 w-8 border-slate-200"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
