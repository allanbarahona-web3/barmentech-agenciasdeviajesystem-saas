import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalPurchaseDto, UpdateOperationalPurchaseDto } from "./dto/operational-purchases.dto";
import { OperationalPurchasesController } from "./operational-purchases.controller";

describe("OperationalPurchasesController", () => {
  it("allows AGENT reads only and limits mutation to ADMIN/OPERACIONES", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalPurchasesController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPurchasesController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPurchasesController.prototype.create)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalPurchasesController.prototype.update)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });

  it("accepts only Purchase fields and rejects forged financial identity", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "body" as const, data: "" };
    await expect(pipe.transform({ providerName: " Provider A ", amount: "1.00", currency: "usd", purchasedAt: "2026-10-01T12:00:00.000Z" }, { ...meta, metatype: CreateOperationalPurchaseDto })).resolves.toMatchObject({ providerName: "Provider A" });
    await expect(pipe.transform({ providerName: "Provider A", amount: "1", currency: "USD", purchasedAt: "2026-10-01T12:00:00.000Z", tenantId: "forged", fulfillmentId: "forged" }, { ...meta, metatype: CreateOperationalPurchaseDto })).rejects.toThrow();
    await expect(pipe.transform({ amount: "2" }, { ...meta, metatype: UpdateOperationalPurchaseDto })).rejects.toThrow();
  });
});
