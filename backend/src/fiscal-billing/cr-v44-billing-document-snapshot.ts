import type { BillingDocumentDraftCommand } from "./billing-document.types";
import {
  CR_V44_DECIMAL_V1,
  assertHaciendaCrV44MoneyCapacity,
  type CrV44FiscalCalculationResult,
} from "./cr-v44-fiscal-calculation-policy";

export type CrV44BillingDocumentLineMetadata = Readonly<{
  lineNumber: number;
  cabysCode: string;
  itemCode: string | null;
  description: string;
  unitOfMeasureCode: string;
  taxCode: "01";
}>;

/** Maps the generic CR calculator result into the persisted billing snapshot. */
export function mapCrV44CalculationToBillingDocumentSnapshot(
  calculation: CrV44FiscalCalculationResult,
  metadata: readonly CrV44BillingDocumentLineMetadata[],
): Pick<BillingDocumentDraftCommand, "totals" | "lines"> {
  if (
    calculation.policyVersion !== CR_V44_DECIMAL_V1 ||
    calculation.lines.length !== metadata.length
  ) {
    throw new Error("invalid fiscal calculation result");
  }
  const money = (value: string) => assertHaciendaCrV44MoneyCapacity(value);
  const totals = calculation.internalTotals;
  return {
    totals: {
      grossSubtotal: money(totals.grossAmountTotal),
      discountTotal: money(totals.discountAmountTotal),
      taxableTotal: money(totals.taxableBaseTotal),
      exemptTotal: money(totals.exemptBaseTotal),
      exoneratedTotal: money(totals.exoneratedBaseTotal),
      grossTaxTotal: money(totals.grossTaxAmountTotal),
      exoneratedTaxTotal: money(totals.exoneratedTaxAmountTotal),
      netTaxTotal: money(totals.netTaxAmountTotal),
      total: money(totals.lineTotal),
    },
    lines: calculation.lines.map((line, index) => {
      const source = metadata[index];
      if (!source || source.lineNumber !== line.lineNumber) {
        throw new Error("invalid fiscal calculation line identity");
      }
      const taxableBase = money(line.taxableBase);
      const taxAmount = money(line.grossTaxAmount);
      const netTaxAmount = money(line.netTaxAmount);
      return {
        lineNumber: line.lineNumber,
        cabysCode: source.cabysCode,
        itemCode: source.itemCode,
        description: source.description,
        quantity: line.quantity,
        unitOfMeasureCode: source.unitOfMeasureCode,
        unitPrice: money(line.unitPrice),
        grossAmount: money(line.grossAmount),
        discountAmount: money(line.discountAmount),
        discountCode: null,
        discountReason: null,
        taxableBase,
        taxAmount,
        exoneratedTaxAmount: money(line.exoneratedTaxAmount),
        netTaxAmount,
        lineSubtotal: money(line.lineSubtotal),
        lineTotal: money(line.lineTotal),
        taxes: [
          {
            taxOrder: 1,
            taxCode: source.taxCode,
            rateCode: line.ivaTariffCode,
            ratePercentage: line.ivaRatePercentage,
            taxableBase,
            taxAmount,
            calculationFactor: null,
            netTaxAmount,
          },
        ],
      };
    }),
  };
}
