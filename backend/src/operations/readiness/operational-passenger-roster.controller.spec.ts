import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerRosterDto } from "./dto/list-operational-passenger-roster.dto";
import { OperationalPassengerRosterController } from "./operational-passenger-roster.controller";

describe("OperationalPassengerRosterController", () => {
  it("limits roster reads to Operations roles and bounds the page to 25", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalPassengerRosterController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPassengerRosterController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "query" as const, metatype: ListOperationalPassengerRosterDto, data: "" };
    await expect(pipe.transform({ page: "2", pageSize: "25", search: " Ada " }, meta)).resolves.toMatchObject({ page: 2, pageSize: 25, search: "Ada" });
    await expect(pipe.transform({ pageSize: "26" }, meta)).rejects.toThrow();
  });
});
