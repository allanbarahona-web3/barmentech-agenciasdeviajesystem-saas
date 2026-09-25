import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreatePassengerGroupDto,
  PassengerGroupMembersDto,
  UpdatePassengerGroupDto,
} from "./dto/passenger-group.dto";
import { PassengerGroupsController } from "./passenger-groups.controller";

describe("PassengerGroupsController", () => {
  it("uses authenticated tenant/actor context and permits ADMIN, AGENT, and OPERACIONES", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PassengerGroupsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, PassengerGroupsController)).toEqual([
      UserRole.ADMIN,
      UserRole.AGENT,
      UserRole.OPERACIONES,
    ]);
    const service = serviceMock();
    const controller = new PassengerGroupsController(service as never);
    const request = { user: { id: "agent-a", fullName: "Agent A", tenantId: "tenant-a" } };
    const create = { additionalServiceCatalogId: "catalog-a", name: "Room 1" } as CreatePassengerGroupDto;
    const update = { name: "Room 2" } as UpdatePassengerGroupDto;
    const members = { participantIds: ["participant-a"] } as PassengerGroupMembersDto;

    await controller.list(request, "travel-a");
    await controller.create(request, "travel-a", create);
    await controller.find(request, "travel-a", "group-a");
    await controller.update(request, "travel-a", "group-a", update);
    await controller.archive(request, "travel-a", "group-a");
    await controller.addMembers(request, "travel-a", "group-a", members);
    await controller.removeMembers(request, "travel-a", "group-a", members);

    expect(service.create).toHaveBeenCalledWith("tenant-a", "travel-a", create, { userId: "agent-a", name: "Agent A" });
    expect(service.addMembers).toHaveBeenCalledWith("tenant-a", "travel-a", "group-a", members, { userId: "agent-a", name: "Agent A" });
    expect(service.removeMembers).toHaveBeenCalledWith("tenant-a", "travel-a", "group-a", members);
  });

  it("validates only explicit group and bounded-member fields", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const body = { type: "body" as const, data: "" };

    await expect(pipe.transform({ additionalServiceCatalogId: " catalog-a ", name: " Room 1 ", color: " blue " }, {
      ...body, metatype: CreatePassengerGroupDto,
    })).resolves.toMatchObject({ additionalServiceCatalogId: "catalog-a", name: "Room 1", color: "blue" });
    await expect(pipe.transform({ additionalServiceCatalogId: "catalog-a", name: "", serviceCode: "FORGED" }, {
      ...body, metatype: CreatePassengerGroupDto,
    })).rejects.toThrow();
    await expect(pipe.transform({ participantIds: Array.from({ length: 501 }, (_, index) => `participant-${index}`) }, {
      ...body, metatype: PassengerGroupMembersDto,
    })).rejects.toThrow();
  });
});

function serviceMock() {
  return {
    list: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    addMembers: jest.fn(),
    removeMembers: jest.fn(),
  };
}
