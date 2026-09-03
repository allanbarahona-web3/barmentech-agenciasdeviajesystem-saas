import type {
  AdditionalServiceAdminCatalogItem,
  AdditionalServiceCatalogUsage,
  CreateAdditionalServiceCatalogInput,
  FiscalItemCategory,
  UpdateAdditionalServiceCatalogInput,
} from "@/lib/additional-services-admin-api";

export const catalogUsageLabels: Record<AdditionalServiceCatalogUsage, string> = {
  ADDITIONAL_SERVICE: "Servicio adicional",
  TRAVEL_PACKAGE: "Viaje internacional / migración",
  INTERNAL_TRIP: "Viaje interno",
};

export type CatalogAdminForm = {
  code: string;
  name: string;
  fiscalItemCategory: FiscalItemCategory;
  usages: AdditionalServiceCatalogUsage[];
};

export const emptyCatalogAdminForm: CatalogAdminForm = {
  code: "",
  name: "",
  fiscalItemCategory: "SERVICE",
  usages: [],
};

export function catalogAdminFormForItem(
  item: AdditionalServiceAdminCatalogItem,
): CatalogAdminForm {
  return {
    code: item.code,
    name: item.name,
    fiscalItemCategory: item.fiscalItemCategory ?? "SERVICE",
    usages: [...item.usages],
  };
}

export function validateCatalogAdminForm(form: CatalogAdminForm): string | null {
  if (!form.code.trim()) return "El código es requerido.";
  if (!form.name.trim()) return "El nombre es requerido.";
  if (form.usages.length === 0) return "Seleccione al menos un uso.";
  return null;
}

export function createCatalogInput(
  form: CatalogAdminForm,
): CreateAdditionalServiceCatalogInput {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    fiscalItemCategory: form.fiscalItemCategory,
    usages: [...form.usages],
  };
}

export function updateCatalogInput(
  initial: CatalogAdminForm,
  current: CatalogAdminForm,
  fiscalCategoryKnown: boolean,
): UpdateAdditionalServiceCatalogInput {
  const input: UpdateAdditionalServiceCatalogInput = {};
  const code = current.code.trim();
  const name = current.name.trim();
  if (code !== initial.code) input.code = code;
  if (name !== initial.name) input.name = name;
  if (
    fiscalCategoryKnown &&
    current.fiscalItemCategory !== initial.fiscalItemCategory
  ) {
    input.fiscalItemCategory = current.fiscalItemCategory;
  }
  if (!sameUsages(initial.usages, current.usages)) {
    input.usages = [...current.usages];
  }
  return input;
}

export function hasAdditionalServiceUsage(
  item: Pick<AdditionalServiceAdminCatalogItem, "usages">,
): boolean {
  return item.usages.includes("ADDITIONAL_SERVICE");
}

function sameUsages(
  left: AdditionalServiceCatalogUsage[],
  right: AdditionalServiceCatalogUsage[],
): boolean {
  return (
    left.length === right.length &&
    left.every((usage) => right.includes(usage))
  );
}
