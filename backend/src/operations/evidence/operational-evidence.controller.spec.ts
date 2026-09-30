import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalEvidenceDto } from "./dto/operational-evidence.dto";
import { OperationalEvidenceController } from "./operational-evidence.controller";

describe("OperationalEvidenceController", () => {
  it("allows AGENT reads only and limits upload/delete to ADMIN/OPERACIONES", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalEvidenceController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalEvidenceController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalEvidenceController.prototype.upload)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalEvidenceController.prototype.remove)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });

  it("accepts only Operations evidence metadata and rejects forged storage identity", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const meta = { type: "body" as const, data: "", metatype: CreateOperationalEvidenceDto };
    await expect(pipe.transform({ evidenceType: "TICKET", operationalPurchaseId: " purchase-a " }, meta)).resolves.toMatchObject({ evidenceType: "TICKET", operationalPurchaseId: "purchase-a" });
    await expect(pipe.transform({ evidenceType: "TICKET", objectKey: "forged", byteSize: 1, uploadedByUserId: "forged" }, meta)).rejects.toThrow();
  });
});
