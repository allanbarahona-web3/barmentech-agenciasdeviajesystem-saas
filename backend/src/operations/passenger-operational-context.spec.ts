import { passengerOperationalContexts } from "./passenger-operational-context";

describe("passengerOperationalContexts", () => {
  const passenger = { displayName: "Andrea Martínez", dateOfBirth: new Date("2008-11-20T00:00:00.000Z"), role: "MINOR" };

  it.each([
    ["before birthday", "2026-11-19", 17],
    ["on birthday", "2026-11-20", 18],
    ["after birthday", "2026-11-21", 18],
  ])("derives age %s with the shared explicit-date helper", (_label, tenantCurrentDate, age) => {
    expect(passengerOperationalContexts([passenger], {
      serviceStartAt: null,
      tripDepartureDate: null,
      tenantTimezone: "America/Costa_Rica",
      tenantCurrentDate,
    })).toEqual([expect.objectContaining({ age, ageReferenceDate: tenantCurrentDate, ageReferenceType: "CURRENT_DATE" })]);
  });

  it("uses service date, then trip departure, then tenant current date", () => {
    expect(passengerOperationalContexts([passenger], {
      serviceStartAt: new Date("2026-11-20T02:00:00.000Z"),
      tripDepartureDate: new Date("2026-12-01T00:00:00.000Z"),
      tenantTimezone: "America/Costa_Rica",
      tenantCurrentDate: "2026-10-14",
    })[0]).toMatchObject({ ageReferenceDate: "2026-11-19", ageReferenceType: "SERVICE_DATE" });
    expect(passengerOperationalContexts([passenger], {
      serviceStartAt: null,
      tripDepartureDate: new Date("2026-12-01T00:00:00.000Z"),
      tenantTimezone: "America/Costa_Rica",
      tenantCurrentDate: "2026-10-14",
    })[0]).toMatchObject({ ageReferenceDate: "2026-12-01", ageReferenceType: "TRIP_DEPARTURE" });
  });

  it("keeps historical null DOB snapshots readable without fabricating an age", () => {
    expect(passengerOperationalContexts([{ displayName: "Cliente histórico", dateOfBirth: null, role: null }], {
      serviceStartAt: null,
      tripDepartureDate: null,
      tenantTimezone: "America/Costa_Rica",
      tenantCurrentDate: "2026-10-14",
    })).toEqual([{
      displayName: "Cliente histórico",
      dateOfBirth: null,
      age: null,
      ageReferenceDate: "2026-10-14",
      ageReferenceType: "CURRENT_DATE",
      role: null,
    }]);
  });
});
