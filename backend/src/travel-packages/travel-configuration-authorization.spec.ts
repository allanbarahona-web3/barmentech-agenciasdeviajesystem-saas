import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../auth/roles.guard";
import { AdditionalServiceCatalogController } from "../additional-services/additional-service-catalog.controller";
import { AdditionalServiceFiscalProfilesController } from "../additional-services/additional-service-fiscal-profiles.controller";
import { AdditionalServicePricingConfigurationsController } from "../additional-services/additional-service-pricing-configurations.controller";
import { AdditionalServiceSuppliersController } from "../additional-services/additional-service-suppliers.controller";
import { InternalBookingsController } from "../internal-tourism/internal-bookings.controller";
import { InternalTripsController } from "../internal-tourism/internal-trips.controller";
import { TravelPackagesController } from "./travel-packages.controller";

describe("travel master configuration authorization", () => {
  it.each([
    [TravelPackagesController, "create"],
    [TravelPackagesController, "update"],
    [InternalTripsController, "createTrip"],
    [InternalTripsController, "updateTrip"],
  ] as const)("allows ADMIN on %p.%s", (controller, handler) => {
    expect(canActivate(controller, handler, UserRole.ADMIN)).toBe(true);
  });

  it.each([
    [TravelPackagesController, "create", UserRole.AGENT],
    [TravelPackagesController, "create", UserRole.OPERACIONES],
    [TravelPackagesController, "update", UserRole.AGENT],
    [TravelPackagesController, "update", UserRole.OPERACIONES],
    [InternalTripsController, "createTrip", UserRole.AGENT],
    [InternalTripsController, "createTrip", UserRole.OPERACIONES],
    [InternalTripsController, "updateTrip", UserRole.AGENT],
    [InternalTripsController, "updateTrip", UserRole.OPERACIONES],
  ] as const)("rejects non-ADMIN access to %p.%s (%s)", (controller, handler, role) => {
    expect(() => canActivate(controller, handler, role)).toThrow(
      ForbiddenException,
    );
  });

  it.each(["assign", "change", "clear"])(
    "allows ADMIN to %s fiscalClassificationCatalogId through master updates",
    () => {
      expect(
        canActivate(TravelPackagesController, "update", UserRole.ADMIN),
      ).toBe(true);
      expect(
        canActivate(InternalTripsController, "updateTrip", UserRole.ADMIN),
      ).toBe(true);
    },
  );

  it.each([UserRole.AGENT, UserRole.OPERACIONES])(
    "prevents %s from assigning, changing, or clearing fiscalClassificationCatalogId",
    (role) => {
      expect(() =>
        canActivate(TravelPackagesController, "update", role),
      ).toThrow(ForbiddenException);
      expect(() =>
        canActivate(InternalTripsController, "updateTrip", role),
      ).toThrow(ForbiddenException);
    },
  );

  it("keeps catalog, fiscal profile, pricing, and supplier mutations ADMIN-only", () => {
    const mutations = [
      [AdditionalServiceCatalogController, "create"],
      [AdditionalServiceCatalogController, "update"],
      [AdditionalServiceFiscalProfilesController, "create"],
      [AdditionalServiceFiscalProfilesController, "update"],
      [AdditionalServiceFiscalProfilesController, "updateStatus"],
      [AdditionalServicePricingConfigurationsController, "create"],
      [AdditionalServicePricingConfigurationsController, "update"],
      [AdditionalServicePricingConfigurationsController, "updateStatus"],
      [AdditionalServiceSuppliersController, "create"],
      [AdditionalServiceSuppliersController, "update"],
      [AdditionalServiceSuppliersController, "remove"],
    ] as const;

    for (const [controller, handler] of mutations) {
      expect(canActivate(controller, handler, UserRole.ADMIN)).toBe(true);
      expect(() => canActivate(controller, handler, UserRole.AGENT)).toThrow(
        ForbiddenException,
      );
      expect(() =>
        canActivate(controller, handler, UserRole.OPERACIONES),
      ).toThrow(ForbiddenException);
    }
  });

  it.each([UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES])(
    "preserves %s access to configured travel reads",
    (role) => {
      expect(canActivate(TravelPackagesController, "findAll", role)).toBe(true);
      expect(canActivate(InternalTripsController, "listTrips", role)).toBe(true);
    },
  );

  it.each([UserRole.AGENT, UserRole.OPERACIONES])(
    "preserves %s operational booking creation",
    (role) => {
      expect(
        canActivate(InternalBookingsController, "createBooking", role),
      ).toBe(true);
    },
  );

  it("keeps operational Add-on consumption available", () => {
    for (const role of [
      UserRole.ADMIN,
      UserRole.AGENT,
      UserRole.OPERACIONES,
    ]) {
      expect(
        canActivate(
          AdditionalServiceCatalogController,
          "listSelectable",
          role,
        ),
      ).toBe(true);
    }
  });

  it("limits the travel fiscal selector to its current ADMIN configuration consumers", () => {
    expect(
      canActivate(
        AdditionalServiceCatalogController,
        "listTravelFiscalClassifications",
        UserRole.ADMIN,
      ),
    ).toBe(true);
    expect(() =>
      canActivate(
        AdditionalServiceCatalogController,
        "listTravelFiscalClassifications",
        UserRole.OPERACIONES,
      ),
    ).toThrow(ForbiddenException);
  });
});

type ControllerClass = { prototype: any };

function canActivate(
  controller: ControllerClass,
  handler: string,
  role: UserRole,
) {
  const guard = new RolesGuard(new Reflector());
  return guard.canActivate({
    getHandler: () => controller.prototype[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as never);
}
