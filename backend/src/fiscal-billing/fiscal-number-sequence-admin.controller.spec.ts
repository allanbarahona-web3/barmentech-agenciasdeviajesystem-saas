import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ValidationPipe } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SetFiscalNumberSequenceDto } from "./dto/fiscal-number-sequence-admin.dto";
import { FiscalNumberSequenceAdminController } from "./fiscal-number-sequence-admin.controller";

describe("FiscalNumberSequenceAdminController", () => {
  it("requires JWT and ADMIN authorization", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, FiscalNumberSequenceAdminController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(ROLES_KEY, FiscalNumberSequenceAdminController),
    ).toEqual([UserRole.ADMIN]);
  });

  it("takes tenant only from the authenticated request", async () => {
    const service = { list: jest.fn(), set: jest.fn().mockResolvedValue({}) };
    const controller = new FiscalNumberSequenceAdminController(service as never);
    await controller.set(
      { user: { tenantId: "tenant-a", role: UserRole.ADMIN } },
      "issuer-a",
      "01",
      { nextSequenceNumber: "1093" },
    );
    expect(service.set).toHaveBeenCalledWith(
      "tenant-a",
      "issuer-a",
      "01",
      "1093",
    );
  });

  it("rejects request fields that could control sequence scope", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          nextSequenceNumber: "1093",
          tenantId: "other",
          establishmentCode: "999",
          startingSequenceNumber: "1",
        },
        { type: "body", metatype: SetFiscalNumberSequenceDto },
      ),
    ).rejects.toThrow();
  });
});
