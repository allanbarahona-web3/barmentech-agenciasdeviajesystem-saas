import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalFulfillmentDto, UpdateOperationalFulfillmentDto } from "./dto/operational-fulfillments.dto";
import { OperationalFulfillmentsController } from "./operational-fulfillments.controller";

describe("OperationalFulfillmentsController", () => {
  it("permits ADMIN/OPERACIONES mutations and AGENT reads only", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalFulfillmentsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalFulfillmentsController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT]);
    for (const method of ["create", "update", "addPassengers", "removePassengers", "transitionStatus"] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, OperationalFulfillmentsController.prototype[method])).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    }
  });

  it("accepts only Operations-owned input and rejects forged identity/status fields", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "" };
    await expect(pipe.transform({ participantIds: [" participant-a "], providerName: " Provider A ", detailPayload: { ref: "A" }, detailVersion: 1 }, {
      ...metadata, metatype: CreateOperationalFulfillmentDto,
    })).resolves.toMatchObject({ participantIds: ["participant-a"], providerName: "Provider A" });
    await expect(pipe.transform({ participantIds: ["participant-a"], status: "CONFIRMED", servicePurposeCode: "FORGED" }, {
      ...metadata, metatype: CreateOperationalFulfillmentDto,
    })).rejects.toThrow();
    await expect(pipe.transform({ status: "CONFIRMED" }, { ...metadata, metatype: UpdateOperationalFulfillmentDto })).rejects.toThrow();
  });
});
