import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalPassengerNotesController } from "./operational-passenger-notes.controller";

describe("OperationalPassengerNotesController", () => {
  it("restricts passenger operational notes to Operations roles", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalPassengerNotesController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPassengerNotesController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });
});
