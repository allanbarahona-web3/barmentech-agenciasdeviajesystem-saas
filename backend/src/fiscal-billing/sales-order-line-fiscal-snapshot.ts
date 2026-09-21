import type { FiscalItemCategory, Prisma } from "@prisma/client";

export type SalesOrderLineFiscalSnapshotFields = {
  fiscalItemCategory: FiscalItemCategory | null;
  fiscalDescription: string | null;
  cabysCode: string | null;
  unitOfMeasureCode: string | null;
  taxCode: string | null;
  taxRateCode: string | null;
  fiscalTaxPercentage: Prisma.Decimal | string | null;
};

export type CompleteSalesOrderLineFiscalSnapshot = {
  fiscalItemCategory: "SERVICE" | "MERCHANDISE";
  fiscalDescription: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  fiscalTaxPercentage: Prisma.Decimal | string;
};

export type SalesOrderLineFiscalSnapshotResolution =
  | { kind: "ABSENT" }
  | { kind: "PARTIAL" }
  | { kind: "COMPLETE"; snapshot: CompleteSalesOrderLineFiscalSnapshot };

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A SalesOrderLine has one fiscal authority: a complete frozen tuple or the
 * legacy Additional Services profile. A partial tuple is intentionally not
 * eligible for fallback, because that would mix immutable and live data.
 */
export function resolveSalesOrderLineFiscalSnapshot(
  line: SalesOrderLineFiscalSnapshotFields,
): SalesOrderLineFiscalSnapshotResolution {
  const snapshotValues = [
    line.fiscalDescription,
    line.cabysCode,
    line.unitOfMeasureCode,
    line.taxCode,
    line.taxRateCode,
    line.fiscalTaxPercentage,
  ];
  if (snapshotValues.every((value) => value == null)) {
    return { kind: "ABSENT" };
  }
  if (
    (line.fiscalItemCategory !== "SERVICE" &&
      line.fiscalItemCategory !== "MERCHANDISE") ||
    !hasText(line.fiscalDescription) ||
    !hasText(line.cabysCode) ||
    !hasText(line.unitOfMeasureCode) ||
    !hasText(line.taxCode) ||
    !hasText(line.taxRateCode) ||
    line.fiscalTaxPercentage == null
  ) {
    return { kind: "PARTIAL" };
  }
  return {
    kind: "COMPLETE",
    snapshot: {
      fiscalItemCategory: line.fiscalItemCategory,
      fiscalDescription: line.fiscalDescription,
      cabysCode: line.cabysCode,
      unitOfMeasureCode: line.unitOfMeasureCode,
      taxCode: line.taxCode,
      taxRateCode: line.taxRateCode,
      fiscalTaxPercentage: line.fiscalTaxPercentage,
    },
  };
}
