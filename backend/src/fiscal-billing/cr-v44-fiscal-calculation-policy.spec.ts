import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CR_V44_DECIMAL_V1,
  assertHaciendaCrV44MoneyCapacity,
  calculateCrV44FiscalDocument,
  type CrV44FiscalDocumentInput,
  type CrV44FiscalLineInput,
} from "./cr-v44-fiscal-calculation-policy";
import {
  FiscalCalculationError,
  fiscalDecimalsEqual,
  parseFiscalDecimal,
  quantizeFiscalDecimal,
  subtractFiscalDecimals,
} from "./fiscal-decimal";

describe("CR v4.4 five-decimal fiscal calculation policy", () => {
  it("publishes one stable provider-neutral policy identity", () => {
    expect(CR_V44_DECIMAL_V1).toBe("CR_V44_DECIMAL_V1");
    expect(calculateCrV44FiscalDocument(document()).policyVersion).toBe(CR_V44_DECIMAL_V1);
  });

  it("calculates 31.25 x 13% as exact five-decimal fiscal values", () => {
    const result = calculateCrV44FiscalDocument(document({ unitPrice: "31.25" }));
    const calculated = result.lines[0];
    expectDecimal(calculated.taxableBase, "31.25");
    expectDecimal(calculated.grossTaxAmount, "4.0625");
    expectDecimal(calculated.netTaxAmount, "4.0625");
    expectDecimal(calculated.lineTotal, "35.3125");
    expectDecimal(result.internalTotals.grossTaxAmountTotal, "4.0625");
    expectDecimal(result.haciendaSummary.total, "35.3125");
  });

  it.each([
    ["1.000004", "1"],
    ["1.000005", "1.00001"],
    ["1.000006", "1.00001"],
    ["9.999995", "10"],
  ])("quantizes %s with the v4.4 sixth-decimal rule", (input, expected) => {
    const value = parseFiscalDecimal(input, { precision: 20, scale: 6 });
    expectDecimal(quantizeFiscalDecimal(value, 5).canonical, expected);
  });

  it("calculates and quantizes quantity times unit price", () => {
    const result = calculateCrV44FiscalDocument(document({
      quantity: "1.234",
      unitPrice: "2.34567",
      taxes: [exemptIva()],
    }));
    expectDecimal(result.lines[0].grossAmount, "2.89456");
    expectDecimal(result.lines[0].lineTotal, "2.89456");
  });

  it.each([
    ["02", "1"], ["03", "2"], ["04", "4"], ["08", "13"], ["09", "0.5"], ["10", "0"],
  ])("accepts official supported IVA tariff %s at %s%%", (tariffCode, rate) => {
    const result = calculateCrV44FiscalDocument(document({
      taxes: [ordinaryIva(tariffCode, rate)],
    }));
    expect(result.lines[0].ivaTariffCode).toBe(tariffCode);
    expectDecimal(result.lines[0].ivaRatePercentage, rate);
  });

  it("classifies only official tariff code 10 as exempt", () => {
    const result = calculateCrV44FiscalDocument(document({ taxes: [exemptIva()] }));
    expect(result.lines[0].ivaTariffCode).toBe("10");
    expectDecimal(result.haciendaSummary.taxableServiceTotal, "0");
    expectDecimal(result.haciendaSummary.exemptServiceTotal, "100");
  });

  it.each(["01", "11"])("rejects no-subject IVA tariff code %s", (tariffCode) => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({ taxes: [ordinaryIva(tariffCode, "0")] })),
      "FISCAL_CALCULATION_TAX_INVALID",
    );
  });

  it.each([
    ["02", "2"], ["03", "1"], ["04", "13"], ["08", "4"], ["09", "1"],
    ["10", "0.5"], ["99", "13"], ["05", "0"], ["06", "4"], ["07", "8"],
  ])("rejects unsupported or contradictory tariff %s at %s%%", (tariffCode, rate) => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({ taxes: [ordinaryIva(tariffCode, rate)] })),
      "FISCAL_CALCULATION_TAX_INVALID",
    );
  });

  it("applies five ordered discounts sequentially", () => {
    const discounts = Array.from({ length: 5 }, (_, index) => ({
      order: index + 1,
      kind: "PERCENTAGE" as const,
      percentage: "10",
    }));
    const result = calculateCrV44FiscalDocument(document({ discounts, taxes: [exemptIva()] }));
    expect(result.lines[0].discounts).toHaveLength(5);
    expect(result.lines[0].discounts.map((discount) => discount.amount)).toEqual([
      "10", "9", "8.1", "7.29", "6.561",
    ]);
    expectDecimal(result.lines[0].lineSubtotal, "59.049");
  });

  it("rejects a sixth discount with the stable unsupported-discount code", () => {
    const discounts = Array.from({ length: 6 }, (_, index) => ({
      order: index + 1,
      kind: "EXACT_AMOUNT" as const,
      amount: "1",
    }));
    expectCode(
      () => calculateCrV44FiscalDocument(document({ discounts })),
      "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED",
    );
  });

  it("allows zero discounts and an exact full-line discount", () => {
    expect(calculateCrV44FiscalDocument(document()).lines[0].discounts).toEqual([]);
    const result = calculateCrV44FiscalDocument(document({
      discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "100" }],
      taxes: [exemptIva()],
    }));
    expectDecimal(result.lines[0].lineSubtotal, "0");
    expectDecimal(result.lines[0].lineTotal, "0");
  });

  it("rejects over-discount and duplicate or unordered discounts", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "100.00001" }],
      })),
      "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED",
    );
    for (const discounts of [
      [{ order: 1, kind: "EXACT_AMOUNT", amount: "1" }, { order: 1, kind: "EXACT_AMOUNT", amount: "1" }],
      [{ order: 2, kind: "EXACT_AMOUNT", amount: "1" }, { order: 1, kind: "EXACT_AMOUNT", amount: "1" }],
    ]) {
      expectCode(
        () => calculateCrV44FiscalDocument(document({ discounts: discounts as never })),
        "FISCAL_CALCULATION_INVALID_ORDERING",
      );
    }
  });

  it("supports partial and complete ordinary exoneration by official tariff points", () => {
    const partial = calculateCrV44FiscalDocument(document({
      taxes: [ordinaryIva("08", "13", "6.5")],
    })).lines[0];
    expectDecimal(partial.grossTaxAmount, "13");
    expectDecimal(partial.exoneratedTaxAmount, "6.5");
    expectDecimal(partial.netTaxAmount, "6.5");
    expectDecimal(partial.exoneratedAmount, "50");
    expect(partial.exoneratedTariffPercentage).toBe("6.5");

    const complete = calculateCrV44FiscalDocument(document({
      taxes: [ordinaryIva("08", "13", "13")],
    })).lines[0];
    expectDecimal(complete.exoneratedTaxAmount, "13");
    expectDecimal(complete.netTaxAmount, "0");
    expectDecimal(complete.exoneratedAmount, "100");
  });

  it.each([
    { kind: "ORDINARY", exoneratedTariffPercentage: "0" },
    { kind: "ORDINARY", exoneratedTariffPercentage: "13.01" },
    { kind: "OTHER", exoneratedTariffPercentage: "6.5" },
    { kind: "ORDINARY", exoneratedTariffPercentage: "6.5", amount: "6.5" },
    { kind: "ORDINARY", exemptedPercentage: "50" },
  ])("rejects malformed or commercial-percentage exemption %#", (exemption) => {
    const tax = { kind: "ORDINARY_IVA", tariffCode: "08", ratePercentage: "13", exemption };
    expectCode(
      () => calculateCrV44FiscalDocument(document({ taxes: [tax] as never })),
      "FISCAL_CALCULATION_EXEMPTION_INVALID",
    );
  });

  it("rejects exoneration on the official exempt tariff", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({ taxes: [ordinaryIva("10", "0", "0.5")] })),
      "FISCAL_CALCULATION_EXEMPTION_INVALID",
    );
  });

  it("separates internal post-discount totals from discounted Hacienda service summaries", () => {
    const result = calculateCrV44FiscalDocument(document({}, [
      line({ lineNumber: 1, discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "10" }] }),
      line({
        lineNumber: 2,
        unitPrice: "50",
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "5" }],
        taxes: [exemptIva()],
      }),
      line({
        lineNumber: 3,
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "10" }],
        taxes: [ordinaryIva("08", "13", "6.5")],
      }),
    ]));
    expectDecimal(result.internalTotals.postDiscountBaseTotal, "225");
    expectDecimal(result.internalTotals.taxableBaseTotal, "135");
    expectDecimal(result.internalTotals.exemptBaseTotal, "45");
    expectDecimal(result.internalTotals.exoneratedBaseTotal, "45");
    expectDecimal(result.haciendaSummary.grossServiceTotal, "250");
    expectDecimal(result.haciendaSummary.taxableServiceTotal, "150");
    expectDecimal(result.haciendaSummary.exemptServiceTotal, "50");
    expectDecimal(result.haciendaSummary.exoneratedServiceTotal, "50");
    expectDecimal(result.haciendaSummary.totalSale, "250");
    expectDecimal(result.haciendaSummary.totalDiscounts, "25");
    expectDecimal(result.haciendaSummary.netSale, "225");
    expectDecimal(result.haciendaSummary.netTax, "17.55");
    expectDecimal(result.haciendaSummary.total, "242.55");
  });

  it("produces equivalent discounted merchandise summary categories", () => {
    const result = calculateCrV44FiscalDocument(document({}, [
      line({
        lineNumber: 1,
        category: "MERCHANDISE",
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "10" }],
      }),
      line({
        lineNumber: 2,
        category: "MERCHANDISE",
        unitPrice: "50",
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "5" }],
        taxes: [exemptIva()],
      }),
      line({
        lineNumber: 3,
        category: "MERCHANDISE",
        discounts: [{ order: 1, kind: "EXACT_AMOUNT", amount: "10" }],
        taxes: [ordinaryIva("08", "13", "6.5")],
      }),
    ]));
    expectDecimal(result.haciendaSummary.grossMerchandiseTotal, "250");
    expectDecimal(result.haciendaSummary.taxableMerchandiseTotal, "150");
    expectDecimal(result.haciendaSummary.exemptMerchandiseTotal, "50");
    expectDecimal(result.haciendaSummary.exoneratedMerchandiseTotal, "50");
    expectDecimal(result.haciendaSummary.grossServiceTotal, "0");
  });

  it("uses aggregate rounded taxes rather than naïve line base partitioning", () => {
    const result = calculateCrV44FiscalDocument(document({}, [
      line({ lineNumber: 1, unitPrice: "0.0001", taxes: [ordinaryIva("08", "13", "1")] }),
      line({ lineNumber: 2, unitPrice: "1" }),
    ]));
    expectDecimal(result.internalTotals.exoneratedBaseTotal, "0.00001");
    expectDecimal(result.internalTotals.exoneratedTaxAmountTotal, "0");
    expectDecimal(result.haciendaSummary.exoneratedServiceTotal, "0");
    expectDecimal(result.haciendaSummary.taxableServiceTotal, "1.0001");
  });

  it("fails safely when an exonerated category would require division by zero", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({
        unitPrice: "0.00001",
        taxes: [ordinaryIva("08", "13", "1")],
      })),
      "FISCAL_CALCULATION_STATE_UNSUPPORTED",
    );
  });

  it("accepts the exact internal DECIMAL(19,5) maximum", () => {
    const maximum = "99999999999999.99999";
    const result = calculateCrV44FiscalDocument(document({ unitPrice: maximum, taxes: [exemptIva()] }));
    expectDecimal(result.internalTotals.lineTotal, maximum);
  });

  it("rejects the first integer value beyond internal DECIMAL(19,5)", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({ unitPrice: "100000000000000" })),
      "FISCAL_DECIMAL_CAPACITY_OVERFLOW",
    );
  });

  it("detects document-sum overflow independently of valid lines", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({}, [
        line({ lineNumber: 1, unitPrice: "50000000000000", taxes: [exemptIva()] }),
        line({ lineNumber: 2, unitPrice: "50000000000000", taxes: [exemptIva()] }),
      ])),
      "FISCAL_DECIMAL_CAPACITY_OVERFLOW",
    );
  });

  it("enforces the separate Hacienda DECIMAL(18,5) boundary", () => {
    const maximum = "9999999999999.99999";
    expect(assertHaciendaCrV44MoneyCapacity(maximum)).toBe(maximum);
    expectCode(
      () => assertHaciendaCrV44MoneyCapacity("10000000000000"),
      "FISCAL_DECIMAL_CAPACITY_OVERFLOW",
    );
  });

  it.each(["", " 1", "1 ", "01", "+1", "-1", "-0", "1e2", "1,00", ".5", "NaN"])(
    "rejects invalid lexical decimal %p",
    (unitPrice) => expectCode(
      () => calculateCrV44FiscalDocument(document({ unitPrice })),
      "FISCAL_DECIMAL_INVALID_SYNTAX",
    ),
  );

  it("rejects excess scales, invalid ordering, multiple taxes and extra shapes", () => {
    expectCode(
      () => calculateCrV44FiscalDocument(document({ quantity: "1.0001" })),
      "FISCAL_DECIMAL_SCALE_UNSUPPORTED",
    );
    expectCode(
      () => calculateCrV44FiscalDocument(document({}, [line({ lineNumber: 1 }), line({ lineNumber: 1 })])),
      "FISCAL_CALCULATION_INVALID_ORDERING",
    );
    expectCode(
      () => calculateCrV44FiscalDocument(document({ taxes: [ordinaryIva(), ordinaryIva()] })),
      "FISCAL_CALCULATION_TAX_INVALID",
    );
    expectCode(
      () => calculateCrV44FiscalDocument({ ...document(), totals: { total: "113" } }),
      "FISCAL_CALCULATION_INVALID_INPUT",
    );
  });

  it("reports direct decimal underflow with a stable code", () => {
    expectCode(
      () => subtractFiscalDecimals(decimal("1"), decimal("2")),
      "FISCAL_DECIMAL_ARITHMETIC_UNDERFLOW",
    );
  });

  it("reconstructs a caller-created domain error and ignores its mutated message", () => {
    const hostile = new FiscalCalculationError("FISCAL_CALCULATION_TAX_INVALID");
    hostile.message = "customer-secret";
    const caught = captureError(() => calculateCrV44FiscalDocument(throwingDocument(hostile)));
    expect(caught).not.toBe(hostile);
    expect(caught).toBeInstanceOf(FiscalCalculationError);
    expect(caught.code).toBe("FISCAL_CALCULATION_TAX_INVALID");
    expect(caught.message).toBe("FISCAL_CALCULATION_TAX_INVALID");
  });

  it("collapses mutated code and forged FiscalCalculationError shapes", () => {
    const mutated = new FiscalCalculationError("FISCAL_CALCULATION_TAX_INVALID");
    (mutated as { code: string }).code = "FISCAL_DECIMAL_INVALID_SYNTAX";
    expectGenericSanitized(mutated);

    const forged = Object.create(FiscalCalculationError.prototype) as Record<string, unknown>;
    Object.defineProperty(forged, "code", { value: "FISCAL_CALCULATION_TAX_INVALID" });
    Object.defineProperty(forged, "message", { value: "customer-secret" });
    expectGenericSanitized(forged);
  });

  it("contains throwing descriptors, proxy traps, primitives and native errors", () => {
    let getterExecuted = false;
    const throwingCode = Object.defineProperty({}, "code", {
      get() {
        getterExecuted = true;
        throw new Error("customer-secret");
      },
    });
    expectGenericSanitized(throwingCode);
    expect(getterExecuted).toBe(false);

    const proxy = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error("customer-secret");
      },
    });
    expectGenericSanitized(proxy);
    expectGenericSanitized("customer-secret");
    expectGenericSanitized(new Error("customer-secret"));
  });

  it("does not mutate deeply frozen input and returns frozen detached output", () => {
    const input = deepFreeze(document({ unitPrice: "31.25" }));
    const before = JSON.stringify(input);
    const output = calculateCrV44FiscalDocument(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.lines)).toBe(true);
    expect(Object.isFrozen(output.lines[0])).toBe(true);
    expect(Object.isFrozen(output.lines[0].discounts)).toBe(true);
    expect(Object.isFrozen(output.internalTotals)).toBe(true);
    expect(Object.isFrozen(output.haciendaSummary)).toBe(true);
  });

  it("is deterministic and returns no shared mutable result references", () => {
    const input = document({ unitPrice: "31.25" });
    const first = calculateCrV44FiscalDocument(input);
    const second = calculateCrV44FiscalDocument(input);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.lines).not.toBe(second.lines);
    expect(first.internalTotals).not.toBe(second.internalTotals);
    expect(first.haciendaSummary).not.toBe(second.haciendaSummary);
  });

  it("contains no floating-point monetary conversion or rounding calls", () => {
    const forbidden = /\b(?:Number|parseFloat|parseInt|Math\.(?:round|pow))\s*\(/;
    for (const file of ["fiscal-decimal.ts", "cr-v44-fiscal-calculation-policy.ts"]) {
      expect(readFileSync(join(__dirname, file), "utf8")).not.toMatch(forbidden);
    }
  });
});

function ordinaryIva(
  tariffCode = "08",
  ratePercentage = "13",
  exoneratedTariffPercentage?: string,
) {
  return {
    kind: "ORDINARY_IVA" as const,
    tariffCode,
    ratePercentage,
    ...(exoneratedTariffPercentage === undefined ? {} : {
      exemption: { kind: "ORDINARY" as const, exoneratedTariffPercentage },
    }),
  };
}

function exemptIva() {
  return ordinaryIva("10", "0");
}

function line(overrides: Partial<CrV44FiscalLineInput> = {}): CrV44FiscalLineInput {
  return {
    lineNumber: 1,
    category: "SERVICE",
    quantity: "1",
    unitPrice: "100",
    discounts: [],
    taxes: [ordinaryIva()],
    ...overrides,
  };
}

function document(
  lineOverrides: Partial<CrV44FiscalLineInput> = {},
  lines: readonly CrV44FiscalLineInput[] = [line(lineOverrides)],
): CrV44FiscalDocumentInput {
  return { lines };
}

function decimal(value: string) {
  return parseFiscalDecimal(value, { precision: 19, scale: 5 });
}

function expectDecimal(actual: string, expected: string): void {
  expect(fiscalDecimalsEqual(decimal(actual), decimal(expected))).toBe(true);
}

function expectCode(fn: () => unknown, code: string): void {
  const error = captureError(fn);
  expect(error).toBeInstanceOf(FiscalCalculationError);
  expect(error.code).toBe(code);
  expect(error.message).toBe(code);
}

function captureError(fn: () => unknown): FiscalCalculationError {
  try {
    fn();
    throw new Error("expected fiscal calculation error");
  } catch (error) {
    return error as FiscalCalculationError;
  }
}

function throwingDocument(thrown: unknown): unknown {
  return Object.defineProperty({}, "lines", {
    enumerable: true,
    get() {
      throw thrown;
    },
  });
}

function expectGenericSanitized(thrown: unknown): void {
  const error = captureError(() => calculateCrV44FiscalDocument(throwingDocument(thrown)));
  expect(error).not.toBe(thrown);
  expect(error).toBeInstanceOf(FiscalCalculationError);
  expect(error.code).toBe("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  expect(error.message).toBe("FISCAL_CALCULATION_STATE_UNSUPPORTED");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
