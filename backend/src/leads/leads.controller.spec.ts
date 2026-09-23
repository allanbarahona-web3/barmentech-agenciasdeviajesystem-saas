import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateLeadDto, UpdateLeadDto } from "./dto/lead.dto";
import { LeadsController } from "./leads.controller";

describe("LeadsController", () => {
  it("permits ADMIN and AGENT, and derives tenant and actor only from authentication", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LeadsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, LeadsController)).toEqual([UserRole.ADMIN, UserRole.AGENT]);
    const service = { create: jest.fn(), list: jest.fn(), find: jest.fn(), update: jest.fn() };
    const controller = new LeadsController(service as never);
    const body = { fullName: "Ada", email: "ada@example.com" } as CreateLeadDto;

    await controller.create({ user: { id: "agent-a", fullName: "Agent A", tenantId: "tenant-a" } }, body);
    await controller.create({ user: { id: "admin-a", fullName: "Admin A", tenantId: "tenant-b" } }, body);
    expect(service.create).toHaveBeenNthCalledWith(1, "tenant-a", body, { userId: "agent-a", name: "Agent A" });
    expect(service.create).toHaveBeenNthCalledWith(2, "tenant-b", body, { userId: "admin-a", name: "Admin A" });
  });

  it("delegates tenant-scoped list, detail, and OPEN update operations", async () => {
    const service = { create: jest.fn(), list: jest.fn(), find: jest.fn(), update: jest.fn() };
    const controller = new LeadsController(service as never);
    const request = { user: { id: "agent-a", fullName: "Agent A", tenantId: "tenant-a" } };
    const query = { status: "OPEN" } as never;
    const update = { companyName: "Orbit Travel" } as UpdateLeadDto;

    await controller.list(request, query);
    await controller.find(request, "lead-a");
    await controller.update(request, "lead-a", update);
    expect(service.list).toHaveBeenCalledWith("tenant-a", query);
    expect(service.find).toHaveBeenCalledWith("tenant-a", "lead-a");
    expect(service.update).toHaveBeenCalledWith("tenant-a", "lead-a", update, { userId: "agent-a", name: "Agent A" });
  });

  it("validates required name/email, optional contact fields, and rejects direct lifecycle or conversion mutation", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, metatype: CreateLeadDto, data: "" };

    await expect(pipe.transform({ fullName: "Ada", email: "ADA@EXAMPLE.COM", phone: "2222", companyName: "Orbit" }, metadata))
      .resolves.toMatchObject({ email: "ada@example.com", phone: "2222", companyName: "Orbit" });
    await expect(pipe.transform({ fullName: "", email: "ada@example.com" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ fullName: "Ada", email: "invalid" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ fullName: "Ada", email: "ada@example.com", status: "CONVERTED" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ fullName: "Ada", email: "ada@example.com", convertedCustomerId: "customer-a" }, metadata)).rejects.toThrow();
  });
});
