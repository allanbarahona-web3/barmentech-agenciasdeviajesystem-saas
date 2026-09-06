import { mapFinancePaymentMethodToCrFiscalCode } from "./finance-fiscal-payment-method";

describe("mapFinancePaymentMethodToCrFiscalCode", () => {
  it.each([
    ["CASH", "01"],
    ["CARD", "02"],
    ["CHECK", "03"],
    ["BANK_TRANSFER", "04"],
    ["MOBILE_TRANSFER", "06"],
    ["OTHER", "99"],
  ])("maps %s to %s", (method, code) => {
    expect(mapFinancePaymentMethodToCrFiscalCode(method)).toBe(code);
  });

  it("rejects unknown tokens instead of falling back", () => {
    expect(mapFinancePaymentMethodToCrFiscalCode("WIRE")).toBeNull();
  });
});
