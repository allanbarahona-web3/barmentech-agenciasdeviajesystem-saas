import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import {
  CreateOperationalRequirementDto,
  OperationalRequirementPassengersDto,
  UpdateOperationalRequirementDto,
} from "./dto/operational-requirements.dto";
import { OperationalRequirementsController } from "./operational-requirements.controller";

describe("OperationalRequirementsController", () => {
  it("allows AGENT reads but limits every mutation to ADMIN and OPERACIONES", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalRequirementsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalRequirementsController)).toEqual([
      UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT,
    ]);
    for (const method of ["create", "update", "addPassengers", "removePassengers", "transitionStatus"] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, OperationalRequirementsController.prototype[method]))
        .toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    }

    const service = serviceMock();
    const controller = new OperationalRequirementsController(service as never);
    const request = { user: { id: "operator-a", fullName: "Operator A", tenantId: "tenant-a" } };
    const create = { servicePurposeCode: "LODGING", servicePurposeName: "Lodging", description: "Room", participantIds: ["participant-a"], sourceType: "MANUAL" } as CreateOperationalRequirementDto;
    const members = { participantIds: ["participant-a"] } as OperationalRequirementPassengersDto;
    await controller.create(request, "travel-a", create);
    await controller.removePassengers(request, "travel-a", "requirement-a", members);
    expect(service.create).toHaveBeenCalledWith("tenant-a", "travel-a", create, { userId: "operator-a", name: "Operator A" });
    expect(service.removePassengers).toHaveBeenCalledWith("tenant-a", "travel-a", "requirement-a", members);
  });

  it("validates bounded neutral input and rejects forged persistence fields", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "" };
    await expect(pipe.transform({
      servicePurposeCode: " LODGING ", servicePurposeName: " Lodging ", description: " Room ",
      participantIds: [" participant-a "], sourceType: "MANUAL",
    }, { ...metadata, metatype: CreateOperationalRequirementDto })).resolves.toMatchObject({
      servicePurposeCode: "LODGING", participantIds: ["participant-a"],
    });
    await expect(pipe.transform({
      servicePurposeCode: "LODGING", servicePurposeName: "Lodging", description: "Room", participantIds: ["participant-a"], sourceType: "MANUAL", tenantId: "forged",
    }, { ...metadata, metatype: CreateOperationalRequirementDto })).rejects.toThrow();
    await expect(pipe.transform({ status: "FULFILLED" }, {
      ...metadata, metatype: UpdateOperationalRequirementDto,
    })).rejects.toThrow();
    await expect(pipe.transform({ participantIds: Array.from({ length: 501 }, (_, index) => `participant-${index}`) }, {
      ...metadata, metatype: OperationalRequirementPassengersDto,
    })).rejects.toThrow();
  });
});

function serviceMock() {
  return {
    list: jest.fn(), find: jest.fn(), create: jest.fn(), update: jest.fn(),
    addPassengers: jest.fn(), removePassengers: jest.fn(), transitionStatus: jest.fn(),
  };
}
