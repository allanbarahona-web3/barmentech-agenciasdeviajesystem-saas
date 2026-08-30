import { Prisma } from "@prisma/client";
import {
  normalizeCurrencySettlementAmount,
} from "./currency-settlement.policy";

describe("normalizeCurrencySettlementAmount", () => {
  it.each([
    ["USD", "110.17500", "110.18000"],
    ["USD", "110.18000", "110.18000"],
    ["USD", "110.17400", "110.17000"],
    ["USD", "10.75500", "10.76000"],
    ["CRC", "110.17500", "110.18000"],
  ])("normalizes %s %s to collectible minor units", (currency, input, expected) => {
    const source = new Prisma.Decimal(input);

    const result = normalizeCurrencySettlementAmount(source, currency);

    expect(result.toFixed(5)).toBe(expected);
    expect(source.toFixed(5)).toBe(input);
  });
});
