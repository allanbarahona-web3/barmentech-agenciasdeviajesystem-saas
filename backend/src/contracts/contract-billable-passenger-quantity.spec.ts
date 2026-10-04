import { calculateContractBillablePassengerQuantity } from "./contract-billable-passenger-quantity";

describe("calculateContractBillablePassengerQuantity", () => {
  it("counts the holder as one billable passenger", () => {
    expect(
      calculateContractBillablePassengerQuantity({ companions: [], minors: [] }),
    ).toBe(1);
  });

  it("counts every complete companion and minor as one pricing unit", () => {
    expect(
      calculateContractBillablePassengerQuantity({
        companions: [
          { fullName: "Companion one", idNumber: "P1" },
          { fullName: "Companion two", idNumber: "P2" },
        ],
        minors: [
          { minorName: "Minor one", minorId: "M1" },
          { name: "Minor two", idNumber: "M2" },
        ],
      }),
    ).toBe(5);
  });

  it("does not count incomplete minor placeholders", () => {
    expect(
      calculateContractBillablePassengerQuantity({
        companions: [{ fullName: "Companion", idNumber: "P1" }],
        minors: [
          { minorId: "M1" },
          { minorName: "Minor without id" },
          null,
        ],
      }),
    ).toBe(2);
  });
});
