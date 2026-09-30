import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { PassengerMatrixQueryDto } from "./dto/operational-readiness.dto";
import { OperationalReadinessController } from "./operational-readiness.controller";

describe("OperationalReadinessController", () => {
  it("permits ADMIN/OPERACIONES/AGENT read access only", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalReadinessController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalReadinessController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT]);
  });

  it("validates bounded matrix pagination", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "query" as const, data: "", metatype: PassengerMatrixQueryDto };
    await expect(pipe.transform({ page: "2", pageSize: "25" }, meta)).resolves.toMatchObject({ page: 2, pageSize: 25 });
    await expect(pipe.transform({ pageSize: "26" }, meta)).rejects.toThrow();
  });
});
