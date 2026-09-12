"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/loading-spinner";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";
import {
  ToastNotification,
  useToast,
} from "@/components/toast-notification";
import {
  getHomeRouteForRole,
  getStoredSession,
} from "@/lib/auth-api";
import {
  createAdditionalServiceSupplier,
  deleteAdditionalServiceSupplier,
  getAdditionalServiceSuppliers,
  updateAdditionalServiceSupplier,
  type AdditionalServiceSupplier,
} from "@/lib/additional-services-admin-api";
import { SupplierEditor, type SupplierFormState } from "@/features/suppliers/supplier-editor";
import { SuppliersTable } from "@/features/suppliers/suppliers-table";

const emptyForm: SupplierFormState = {
  name: "",
  website: "",
  supplierType: "",
  supplierCategory: "",
  customCategory: "",
  notes: "",
  isActive: true,
};

const supplierCategories = [
  { value: "Hotel", label: "Hotel" },
  { value: "Airline", label: "Aerolínea" },
  { value: "Tour Operator", label: "Operador turístico" },
  { value: "Insurance", label: "Aseguradora" },
  { value: "Transportation", label: "Transporte" },
  { value: "Cruise", label: "Crucero" },
  { value: "Railway", label: "Ferrocarril" },
  { value: "Car Rental", label: "Alquiler de vehículos" },
] as const;

function normalizeSupplierWebsite(value: string): string | null {
  const website = value.trim();
  if (!website) return null;

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function isValidSupplierWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function SuppliersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<AdditionalServiceSupplier[]>([]);
  const [loadError, setLoadError] = useState("");
  const [editingSupplier, setEditingSupplier] =
    useState<AdditionalServiceSupplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SupplierFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] =
    useState<AdditionalServiceSupplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, showSuccess, showError, dismissToast } = useToast();

  const loadSuppliers = async () => {
    setLoading(true);
    setLoadError("");

    try {
      setSuppliers(await getAdditionalServiceSuppliers());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los proveedores.";
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

    void loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const resetSupplierEditor = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setFormError("");
  };

  const openCreateModal = () => {
    resetSupplierEditor();
    setFormOpen(true);
  };

  const openEditModal = (supplier: AdditionalServiceSupplier) => {
    const isBuiltInCategory =
      supplier.supplierCategory !== null &&
      supplierCategories.some(
        (category) => category.value === supplier.supplierCategory,
      );

    setEditingSupplier(supplier);
    setForm({
      name: supplier.name,
      website: supplier.website ?? "",
      supplierType: supplier.supplierType ?? "",
      supplierCategory: isBuiltInCategory
        ? (supplier.supplierCategory ?? "")
        : supplier.supplierCategory
          ? "Other"
          : "",
      customCategory: isBuiltInCategory
        ? ""
        : (supplier.supplierCategory ?? ""),
      notes: supplier.notes ?? "",
      isActive: supplier.isActive,
    });
    setFormError("");
    setFormOpen(true);
  };

  const closeFormModal = () => {
    if (saving) return;
    setFormOpen(false);
    resetSupplierEditor();
  };

  const handleSave = async () => {
    if (saving) return;

    const name = form.name.trim();
    if (!name) {
      setFormError("El nombre del proveedor es requerido.");
      return;
    }

    const website = normalizeSupplierWebsite(form.website);
    if (website && !isValidSupplierWebsite(website)) {
      setFormError("Ingrese un sitio web válido.");
      return;
    }

    const supplierCategory =
      form.supplierCategory === "Other"
        ? form.customCategory.trim()
        : form.supplierCategory;
    if (form.supplierCategory === "Other" && !supplierCategory) {
      setFormError("La categoría personalizada es requerida.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const input = {
        name,
        website,
        supplierType: form.supplierType.trim(),
        supplierCategory,
        notes: form.notes.trim(),
        isActive: form.isActive,
      };

      if (editingSupplier) {
        await updateAdditionalServiceSupplier(editingSupplier.id, input);
      } else {
        await createAdditionalServiceSupplier(input);
      }

      setFormOpen(false);
      setEditingSupplier(null);
      setForm(emptyForm);
      setSuppliers(await getAdditionalServiceSuppliers());
      showSuccess(
        editingSupplier
          ? "Proveedor actualizado correctamente."
          : "Proveedor creado correctamente.",
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el proveedor.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      await deleteAdditionalServiceSupplier(deleteTarget.id);
      setDeleteTarget(null);
      setSuppliers(await getAdditionalServiceSuppliers());
      showSuccess("Proveedor eliminado correctamente.");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el proveedor.",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <PageLoader message="Cargando proveedores..." />;
  }

  return (
    <main className="app-shell">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      <SupplierEditor
        open={formOpen}
        isEditing={Boolean(editingSupplier)}
        form={form}
        formError={formError}
        saving={saving}
        supplierCategories={supplierCategories}
        onFormChange={setForm}
        onClearFormError={() => setFormError("")}
        onWebsiteBlur={() => {
          const website = normalizeSupplierWebsite(form.website);
          setForm((current) => ({ ...current, website: website ?? "" }));
        }}
        onSave={() => void handleSave()}
        onCancel={closeFormModal}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Eliminar proveedor"
        description={
          deleteTarget
            ? (
                <span>
                  ¿Estás seguro de que deseas eliminar este proveedor? Esta acción
                  no se puede deshacer.
                  <span className="mt-3 block rounded-md border border-destructive/25 bg-destructive/5 p-3 text-destructive">
                    <span className="block text-xs font-medium uppercase tracking-wide">
                      Proveedor
                    </span>
                    <span className="mt-1 block font-medium">
                      {deleteTarget.name}
                    </span>
                  </span>
                </span>
              )
            : undefined
        }
        cancelLabel="Cancelar"
        confirmLabel="Eliminar proveedor"
        pendingLabel="Eliminando..."
        variant="destructive"
        isPending={deleting}
        onConfirm={(event) => {
          event.preventDefault();
          void handleDelete();
        }}
      />

      <PageHeader
        className="mb-6"
        title={
          <span className="flex items-center gap-3">
            <IconBadge tone="primary">
              <Building2 aria-hidden="true" />
            </IconBadge>
            Proveedores
          </span>
        }
        description="Gestiona los proveedores disponibles para los servicios adicionales."
        meta={
          <Badge variant="secondary">
            {suppliers.length} proveedor{suppliers.length === 1 ? "" : "es"}
          </Badge>
        }
        actions={
          <Button
            type="button"
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo proveedor
          </Button>
        }
      />

      <SuppliersTable
        suppliers={suppliers}
        loadError={loadError}
        onRetry={() => void loadSuppliers()}
        onEdit={openEditModal}
        onDelete={setDeleteTarget}
      />
    </main>
  );
}
