"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CirclePause,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmModal } from "@/components/confirm-modal";
import { PageLoader } from "@/components/loading-spinner";
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

interface SupplierFormState {
  name: string;
  website: string;
  supplierType: string;
  supplierCategory: string;
  customCategory: string;
  notes: string;
  isActive: boolean;
}

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

  const openCreateModal = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setFormError("");
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
    setEditingSupplier(null);
    setForm(emptyForm);
    setFormError("");
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

      <ConfirmModal
        isOpen={formOpen}
        title={editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
        message={
          <form
            className="space-y-4 text-left"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div>
              <label
                htmlFor="supplier-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Nombre
              </label>
              <input
                id="supplier-name"
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                  setFormError("");
                }}
                disabled={saving}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supplier-website"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Sitio web
              </label>
              <input
                id="supplier-website"
                type="text"
                inputMode="url"
                placeholder="https://ejemplo.com"
                value={form.website}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
                onBlur={() => {
                  const website = normalizeSupplierWebsite(form.website);
                  setForm((current) => ({
                    ...current,
                    website: website ?? "",
                  }));
                }}
                disabled={saving}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="supplier-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Tipo de viaje
                </label>
                <select
                  id="supplier-type"
                  value={form.supplierType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplierType: event.target.value,
                    }))
                  }
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Seleccione</option>
                  <option value="International">Internacional</option>
                  <option value="National">Nacional</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="supplier-category"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Categoría del proveedor
                </label>
                <select
                  id="supplier-category"
                  value={form.supplierCategory}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      supplierCategory: event.target.value,
                      customCategory:
                        event.target.value === "Other"
                          ? current.customCategory
                          : "",
                    }));
                    setFormError("");
                  }}
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Seleccione</option>
                  {supplierCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                  <option value="Other">Otra</option>
                </select>
              </div>
            </div>

            {form.supplierCategory === "Other" ? (
              <div>
                <label
                  htmlFor="supplier-custom-category"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Categoría personalizada
                </label>
                <input
                  id="supplier-custom-category"
                  type="text"
                  required
                  value={form.customCategory}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      customCategory: event.target.value,
                    }));
                    setFormError("");
                  }}
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            ) : null}

            <div>
              <label
                htmlFor="supplier-notes"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Notas
              </label>
              <textarea
                id="supplier-notes"
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                disabled={saving}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <label
              htmlFor="supplier-active"
              className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-slate-200 px-3 py-2"
            >
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  Activo
                </span>
                <span className="block text-xs text-slate-500">
                  El proveedor estará disponible para su uso.
                </span>
              </span>
              <input
                id="supplier-active"
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
        }
        confirmText={saving ? "Guardando..." : "Guardar"}
        cancelText="Cancelar"
        onConfirm={() => void handleSave()}
        onCancel={closeFormModal}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Eliminar Proveedor"
        message={
          deleteTarget
            ? `¿Está seguro de eliminar el proveedor “${deleteTarget.name}”?`
            : ""
        }
        confirmText={deleting ? "Eliminando..." : "Eliminar"}
        cancelText="Cancelar"
        confirmVariant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      <div>
        <header className="mb-[30px] flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-[1.8rem] font-semibold text-slate-900">
              Proveedores
            </h1>
            <p className="m-0 text-slate-500">
              Gestiona los proveedores de servicios adicionales.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreateModal}
            className="gap-2 bg-gradient-to-b from-blue-500 to-blue-700 font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-blue-700 hover:text-white dark:text-white dark:hover:text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo proveedor
          </Button>
        </header>

        <section className="rounded-xl bg-white p-[30px] shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="m-0 text-[1.3rem] font-semibold">
              Proveedores registrados
            </h2>
            {!loadError ? (
              <Badge
                variant="outline"
                className="rounded-md border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 shadow-sm dark:border-violet-200 dark:bg-violet-50 dark:text-violet-700"
              >
                {suppliers.length} proveedores
              </Badge>
            ) : null}
          </div>

          {loadError ? (
            <div className="px-5 py-10 text-center text-slate-400">
              <div className="mb-3 text-5xl">⚠️</div>
              <h2 className="mb-2 text-lg font-semibold text-slate-700">
                No se pudieron cargar los proveedores
              </h2>
              <p className="mx-auto mb-5 max-w-xl text-sm text-slate-500">
                {loadError}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadSuppliers()}
              >
                Reintentar
              </Button>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400">
              <div className="mb-3 text-5xl">🏢</div>
              <p className="m-0">No hay proveedores registrados.</p>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table table-fixed">
                <thead>
                  <tr>
                    <th className="w-[35%]">Nombre</th>
                    <th className="w-[35%]">Sitio web</th>
                    <th className="w-[15%] text-center">Estado</th>
                    <th className="w-[15%] text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td className="history-col-name">{supplier.name}</td>
                      <td>
                        {supplier.website ? (
                          <a
                            href={supplier.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {supplier.website}
                          </a>
                        ) : (
                          <span className="text-slate-400">Sin definir</span>
                        )}
                      </td>
                      <td className="text-center">
                        <Badge
                          className={
                            supplier.isActive
                              ? "gap-2 border-green-200 bg-green-50 px-3 py-1 text-green-700 hover:bg-green-50 dark:border-green-200 dark:bg-green-50 dark:text-green-700"
                              : "gap-2 border-orange-200 bg-orange-50 px-3 py-1 text-orange-700 hover:bg-orange-50 dark:border-orange-200 dark:bg-orange-50 dark:text-orange-700"
                          }
                        >
                          {supplier.isActive ? (
                            <CircleCheck
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          ) : (
                            <CirclePause
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          )}
                          {supplier.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`Acciones para ${supplier.name}`}
                                className="h-8 w-8 border-blue-400 bg-white text-blue-600 shadow-sm hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-400 dark:bg-white dark:text-blue-600 dark:hover:bg-blue-50 dark:hover:text-blue-700"
                              >
                                <MoreHorizontal
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="border-slate-200 bg-white text-slate-700 dark:border-slate-200 dark:bg-white dark:text-slate-700"
                            >
                              <DropdownMenuItem
                                onSelect={() => openEditModal(supplier)}
                                className="gap-2 bg-transparent text-slate-700 focus:bg-blue-50 focus:text-blue-700 dark:bg-transparent dark:text-slate-700 dark:focus:bg-blue-50 dark:focus:text-blue-700"
                              >
                                <Pencil
                                  className="h-4 w-4 text-blue-600"
                                  aria-hidden="true"
                                />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setDeleteTarget(supplier)}
                                className="gap-2 bg-transparent text-red-600 focus:bg-red-50 focus:text-red-700 dark:bg-transparent dark:text-red-600 dark:focus:bg-red-50 dark:focus:text-red-700"
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
