import { customerProposalLine } from "./custom-quotation-customer-presentation";

describe("customerProposalLine", () => {
  it("uses human-readable places and Spanish dates from immutable version snapshots", () => {
    expect(customerProposalLine({
      displayOrder: 1,
      description: "Vuelo: San José (SJO) → Madrid (MAD)",
      quantity: "1.0000",
      commercialNote: "Solo ida · Aerolínea: Copa · Clase económica · Salida: 2026-10-21",
    })).toEqual({
      displayOrder: 1,
      description: "Vuelo: San José → Madrid",
      quantity: "1.0000",
      commercialNote: "Solo ida · Clase económica · Salida: 21/10/2026",
    });
  });

  it("suppresses a route made only of raw airport codes and internal source clauses", () => {
    const line = customerProposalLine({
      displayOrder: 1,
      description: "Vuelo: AAA → AAB",
      quantity: "1.0000",
      commercialNote: "Proveedor: Mayorista interno · Referencia: ABC-123 · Salida: 2026-10-21",
    });

    expect(line).toEqual(expect.objectContaining({ description: "Vuelo", commercialNote: "Salida: 21/10/2026" }));
    expect(JSON.stringify(line)).not.toMatch(/AAA|AAB|Mayorista|ABC-123/);
  });
});
