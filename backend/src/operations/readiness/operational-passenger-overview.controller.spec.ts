import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerOverviewDto } from "./dto/list-operational-passenger-overview.dto";
import { OperationalPassengerOverviewController } from "./operational-passenger-overview.controller";

describe("OperationalPassengerOverviewController", () => {
  it("limits Operations passenger context to ADMIN and OPERACIONES", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalPassengerOverviewController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPassengerOverviewController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });

  it("bounds overview pagination to 25 passengers", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "query" as const, metatype: ListOperationalPassengerOverviewDto, data: "" };
    await expect(pipe.transform({ page: "2", pageSize: "25", search: " Ada ", passengerGroupId: " group-a " }, meta)).resolves.toMatchObject({ page: 2, pageSize: 25, search: "Ada", passengerGroupId: "group-a" });
    await expect(pipe.transform({ pageSize: "26" }, meta)).rejects.toThrow();
  });
});
