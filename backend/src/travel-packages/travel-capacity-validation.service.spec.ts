import { TravelCapacityValidationService } from "./travel-capacity-validation.service";

describe("TravelCapacityValidationService", () => {
  it("accepts a request that exactly fits the remaining TravelPackage capacity", async () => {
    const travelPackageFindFirst = jest.fn().mockResolvedValue({
      capacity: 10,
      occupiedSlots: 7,
      name: "Pacific Escape",
    });
    const service = createService({ travelPackageFindFirst });

    await expect(
      service.validateTripCapacity("tenant-1", "package-1", null, 3, "archiveContract"),
    ).resolves.toBeUndefined();

    expect(travelPackageFindFirst).toHaveBeenCalledWith({
      where: { id: "package-1", tenantId: "tenant-1" },
      select: { capacity: true, occupiedSlots: true, name: true },
    });
  });

  it("preserves the capacity-exceeded domain error", async () => {
    const service = createService({
      travelPackageFindFirst: jest.fn().mockResolvedValue({
        capacity: 10,
        occupiedSlots: 7,
        name: "Pacific Escape",
      }),
    });

    await expect(
      service.validateTripCapacity("tenant-1", "package-1", null, 4, "archiveContract"),
    ).rejects.toThrow(
      'Capacidad insuficiente. El viaje "Pacific Escape" solo tiene 3 cupos disponibles de 10 totales. No se puede procesar la solicitud para 4 personas.',
    );
  });

  it("keeps the internal-trip occupied-slot calculation unchanged", async () => {
    const internalTripFindFirst = jest.fn().mockResolvedValue({
      capacity: 8,
      occupiedSlots: 6,
      name: "Arenal",
    });
    const service = createService({ internalTripFindFirst });

    await expect(
      service.validateTripCapacity("tenant-1", null, "trip-1", 3, "archiveContract"),
    ).rejects.toThrow(
      'Capacidad insuficiente. El viaje "Arenal" solo tiene 2 cupos disponibles de 8 totales. No se puede procesar la solicitud para 3 personas.',
    );
  });

  it("uses tenant-scoped reads and preserves the missing-package error", async () => {
    const travelPackageFindFirst = jest.fn().mockResolvedValue(null);
    const service = createService({ travelPackageFindFirst });

    await expect(
      service.validateTripCapacity("tenant-2", "package-1", null, 1, "archiveContract"),
    ).rejects.toThrow("Paquete de viaje package-1 no encontrado.");

    expect(travelPackageFindFirst).toHaveBeenCalledWith({
      where: { id: "package-1", tenantId: "tenant-2" },
      select: { capacity: true, occupiedSlots: true, name: true },
    });
  });
});

function createService(options: {
  travelPackageFindFirst?: jest.Mock;
  internalTripFindFirst?: jest.Mock;
}) {
  return new TravelCapacityValidationService({
    travelPackage: { findFirst: options.travelPackageFindFirst ?? jest.fn() },
    internalTrip: { findFirst: options.internalTripFindFirst ?? jest.fn() },
  } as never);
}
