import type {
  AdditionalServiceAdminCatalogItem,
  AdditionalServiceCatalogUsage,
  CreateAdditionalServiceCatalogInput,
  FiscalItemCategory,
} from "@/lib/additional-services-admin-api";

export const TRAVEL_FISCAL_CLASSIFICATION_USAGES = [
  "TRAVEL_PACKAGE",
  "INTERNAL_TRIP",
] as const satisfies readonly AdditionalServiceCatalogUsage[];

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

export function validateTravelClassificationForm(
  form: CatalogAdminForm,
): string | null {
  if (!form.code.trim()) return "El código es requerido.";
  if (!form.name.trim()) return "El nombre es requerido.";
  if (
    form.usages.length === 0 ||
    form.usages.some(
      (usage) =>
        !(TRAVEL_FISCAL_CLASSIFICATION_USAGES as readonly AdditionalServiceCatalogUsage[])
          .includes(usage),
    )
  ) {
    return "Seleccione al menos un uso de viaje válido.";
  }
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

export function hasAdditionalServiceUsage(
  item: Pick<AdditionalServiceAdminCatalogItem, "usages">,
): boolean {
  return item.usages.includes("ADDITIONAL_SERVICE");
}
