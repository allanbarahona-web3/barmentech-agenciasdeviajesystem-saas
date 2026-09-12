"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/loading-spinner";
import { PageHeader } from "@/components/patterns/page-header";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  ToastNotification,
  useToast,
} from "@/components/toast-notification";
import {
  getStoredSession,
  getHomeRouteForRole,
} from "@/lib/auth-api";
import {
  createAdditionalServiceCatalog,
  createAdditionalServicePricingConfiguration,
  getAdditionalServiceAdminCatalog,
  updateAdditionalServicePricingConfiguration,
  updateAdditionalServicePricingConfigurationStatus,
  type AdditionalServiceAdminCatalogItem,
  type CreateAdditionalServiceCatalogInput,
} from "@/lib/additional-services-admin-api";
import { AdditionalServiceCatalogModal } from "./additional-service-catalog-modal";
import { AdditionalServiceFiscalProfileModal } from "./additional-service-fiscal-profile-modal";
import {
  PricingConfigurationEditor,
  type PricingConfigurationFormState,
} from "@/features/pricing-configurations/pricing-configuration-editor";
import { PricingConfigurationsTable } from "@/features/pricing-configurations/pricing-configurations-table";

const emptyForm: PricingConfigurationFormState = {
  marginType: "FIXED",
  marginValue: "",
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
  const [selectedFiscalItem, setSelectedFiscalItem] =
    useState<AdditionalServiceAdminCatalogItem | null>(null);
  const [form, setForm] =
    useState<PricingConfigurationFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
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

  const handleFiscalSaved = async (message: string) => {
    setSelectedFiscalItem(null);
    showSuccess(message);
    try {
      const refreshedCatalog = await getAdditionalServiceAdminCatalog();
      setCatalog(refreshedCatalog);
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "El perfil se guardó, pero no se pudo actualizar el catálogo.",
      );
    }
  };

  const closeCatalogEditor = () => {
    if (catalogSaving) return;
    setCatalogEditorOpen(false);
  };

  const handleCatalogCreate = async (
    input: CreateAdditionalServiceCatalogInput,
  ) => {
    setCatalogSaving(true);
    try {
      const created = await createAdditionalServiceCatalog(input);
      setCatalog((current) => [created, ...current]);
      setCurrentPage(1);
      setCatalogEditorOpen(false);
      showSuccess("Elemento del catálogo creado correctamente.");
    } finally {
      setCatalogSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedItem || saving) return;

    const marginValue = Number(form.marginValue);
    if (
      form.marginValue.trim() === "" ||
      !Number.isFinite(marginValue) ||
      marginValue < 0
    ) {
      setFormError("El valor del margen debe ser un número igual o mayor a 0.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const existingConfiguration = selectedItem.pricingConfiguration;
      const fiscalReady = selectedItem.fiscalReadiness.status === "READY";

      if (!fiscalReady) {
        if (existingConfiguration?.isActive && !form.isActive) {
          await updateAdditionalServicePricingConfigurationStatus(existingConfiguration.id, false);
          setSelectedItem(null);
          setForm(emptyForm);
          setCatalog(await getAdditionalServiceAdminCatalog());
          showSuccess("Configuración de precios desactivada correctamente.");
          return;
        }
        setFormError("Active y complete el perfil fiscal antes de configurar el precio.");
        return;
      }

      if (existingConfiguration) {
        await updateAdditionalServicePricingConfiguration(
          existingConfiguration.id,
          {
            marginType: form.marginType,
            marginValue,
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
      <PricingConfigurationEditor
        item={selectedItem}
        form={form}
        formError={formError}
        saving={saving}
        onFormChange={setForm}
        onClearFormError={() => setFormError("")}
        onSave={() => void handleSave()}
        onCancel={closeConfigurationModal}
      />
      <AdditionalServiceFiscalProfileModal
        item={selectedFiscalItem}
        onClose={() => setSelectedFiscalItem(null)}
        onSaved={handleFiscalSaved}
        onError={showError}
      />
      <AdditionalServiceCatalogModal
        isOpen={catalogEditorOpen}
        saving={catalogSaving}
        onClose={closeCatalogEditor}
        onCreate={handleCatalogCreate}
      />

      <PageHeader
        className="mb-6"
        title={
          <span className="flex items-center gap-3">
            <IconBadge tone="primary">
              <BadgeDollarSign aria-hidden="true" />
            </IconBadge>
            Configuración de precios
          </span>
        }
        description="Administra los márgenes y la configuración comercial/fiscal de los servicios adicionales."
        meta={
          !loadError && catalog.length > 0 ? (
            <Badge variant="secondary">{catalog.length} elementos</Badge>
          ) : undefined
        }
        actions={
          !loadError ? (
            <Button
              type="button"
              onClick={() => setCatalogEditorOpen(true)}
            >
              <Plus aria-hidden="true" />
              Agregar clasificación fiscal
            </Button>
          ) : undefined
        }
      />

      <PricingConfigurationsTable
        catalog={catalog}
        visibleCatalog={visibleCatalog}
        loadError={loadError}
        activePage={activePage}
        totalPages={totalPages}
        firstResult={firstResult}
        lastResult={lastResult}
        onRetry={() => void loadCatalog()}
        onConfigurePricing={openConfigurationModal}
        onConfigureFiscal={setSelectedFiscalItem}
        onPreviousPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
        onNextPage={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
      />
    </main>
  );
}
