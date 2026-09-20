import { formatFinanceMoneyDisplay } from "@/lib/finance-money-display";

export type CommercialPriceStatus = "PENDING" | "LEGACY" | "PRICING_PUBLISHED";

/** Presentation-only: null means no commercial price has been published yet. */
export function formatTravelCommercialPrice(
  price: number | string | null | undefined,
  currency: string,
  status?: CommercialPriceStatus,
): string {
  if (status === "PENDING" || price === null || price === undefined) {
    return "Precio pendiente";
  }
  return formatFinanceMoneyDisplay(String(price), currency);
}
