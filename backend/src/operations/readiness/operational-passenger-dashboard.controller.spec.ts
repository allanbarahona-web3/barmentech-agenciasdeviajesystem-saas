import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerDashboardDto } from "./dto/list-operational-passenger-dashboard.dto";
import { OperationalPassengerDashboardController } from "./operational-passenger-dashboard.controller";

describe("OperationalPassengerDashboardController", () => {
  it("restricts the dashboard to Operations roles and validates bounded filters", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalPassengerDashboardController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPassengerDashboardController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "query" as const, metatype: ListOperationalPassengerDashboardDto, data: "" };
    await expect(pipe.transform({ page: "2", pageSize: "25", search: " Álvaro ", contractId: " contract-a ", passengerGroupId: " group-a ", source: "BASE_TRIP", status: "CONFIRMED" }, meta)).resolves.toMatchObject({ page: 2, pageSize: 25, search: "Álvaro", contractId: "contract-a", passengerGroupId: "group-a", source: "BASE_TRIP", status: "CONFIRMED" });
    await expect(pipe.transform({ pageSize: "26" }, meta)).rejects.toThrow();
    await expect(pipe.transform({ source: "TRAVEL_PACKAGE_COST_COMPONENT" }, meta)).rejects.toThrow();
  });
});
