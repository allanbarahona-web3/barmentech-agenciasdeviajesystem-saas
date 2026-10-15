import { calculateAge, formatDateOnly, normalizeDateOfBirthForPersistence } from "./customer-date-of-birth";

describe("customer date-of-birth helpers", () => {
  it("calculates age before, on, and after the birthday", () => {
    expect(calculateAge("1992-10-15", "2026-10-14")).toBe(33);
    expect(calculateAge("1992-10-15", "2026-10-15")).toBe(34);
    expect(calculateAge("1992-10-15", "2026-10-16")).toBe(34);
  });

  it("uses literal calendar comparison for leap-day births", () => {
    expect(calculateAge("2000-02-29", "2023-02-28")).toBe(22);
    expect(calculateAge("2000-02-29", "2023-03-01")).toBe(23);
    expect(calculateAge("2000-02-29", "2024-02-29")).toBe(24);
  });

  it("persists and serializes the exact calendar date without timezone shifting", () => {
    const persisted = normalizeDateOfBirthForPersistence("1992-10-15", "2026-10-14");
    expect(persisted?.toISOString()).toBe("1992-10-15T00:00:00.000Z");
    expect(formatDateOnly(persisted!)).toBe("1992-10-15");
  });
});
