import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalTravelPackageSummariesController } from "./operational-travel-package-summaries.controller";

describe("OperationalTravelPackageSummariesController", () => {
  it("allows only ADMIN and OPERACIONES to select Operations trips", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalTravelPackageSummariesController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalTravelPackageSummariesController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });
});
