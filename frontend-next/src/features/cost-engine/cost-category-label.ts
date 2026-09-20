import type { CostCategory } from "@/lib/cost-engine-api";

export const STANDARD_COST_CATEGORY_LABELS: Record<string, string> = {
  AIRFARE: "Boleto aéreo",
  BAGGAGE: "Equipaje",
  LODGING: "Hospedaje",
  TRANSPORTATION: "Transporte",
  TOUR: "Tour",
  INSURANCE: "Seguro",
  EVENT_TICKET: "Entradas",
  VISA_ASSISTANCE: "Asistencia de visa",
  MEALS: "Alimentación",
  OTHER: "Otros",
};

export function costCategoryDisplayName(category: Pick<CostCategory, "code" | "displayName"> & Partial<Pick<CostCategory, "origin">>) {
  return category.origin === "CUSTOM" ? category.displayName : STANDARD_COST_CATEGORY_LABELS[category.code] ?? category.displayName;
}
