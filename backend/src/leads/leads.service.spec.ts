import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { LeadsService } from "./leads.service";

const tenantId = "tenant-a";
const actor = { userId: "agent-a", name: "Agent A" };

describe("LeadsService", () => {
  it("creates an OPEN Lead with normalized email, optional contact fields, actor attribution, and no downstream side effects", async () => {
    const c = context();
    c.tx.lead.create.mockResolvedValue(record({ email: "ada@example.com", phone: "2222-2222", companyName: "Orbit Travel" }));

    await expect(c.service.create(tenantId, {
      fullName: " Ada Lovelace ",
      email: " ADA@EXAMPLE.COM ",
      phone: " 2222-2222 ",
      companyName: " Orbit Travel ",
    }, actor)).resolves.toMatchObject({ status: "OPEN", email: "ada@example.com", companyName: "Orbit Travel" });

    expect(c.tx.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "2222-2222",
        companyName: "Orbit Travel",
        status: "OPEN",
        createdByUserId: actor.userId,
        createdByName: actor.name,
      }),
    });
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.sideEffects.client.create).not.toHaveBeenCalled();
    expect(c.sideEffects.customQuotation.create).not.toHaveBeenCalled();
    expect(c.sideEffects.salesOrder.create).not.toHaveBeenCalled();
  });

  it("rejects missing name or invalid email before writing", async () => {
    const c = context();

    await expect(c.service.create(tenantId, { fullName: " ", email: "ada@example.com" }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(c.service.create(tenantId, { fullName: "Ada", email: "invalid" }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(c.tx.lead.create).not.toHaveBeenCalled();
  });

  it("lists within a tenant at default 20, hard maximum 25, deterministic order, and minimal search/status filters", async () => {
    const c = context();
    c.tx.lead.findMany.mockResolvedValue([record()]);
    c.tx.lead.count.mockResolvedValue(1);

    await expect(c.service.list(tenantId, {})).resolves.toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(c.tx.lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 20,
    }));

    await expect(c.service.list(tenantId, {
      page: 2,
      pageSize: 100,
      status: "OPEN",
      search: "Orbit",
    } as never)).resolves.toMatchObject({ page: 2, pageSize: 25 });
    expect(c.tx.lead.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        tenantId,
        status: "OPEN",
        OR: [
          { fullName: { contains: "Orbit", mode: "insensitive" } },
          { email: { contains: "Orbit", mode: "insensitive" } },
          { phone: { contains: "Orbit", mode: "insensitive" } },
          { companyName: { contains: "Orbit", mode: "insensitive" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 25,
      take: 25,
    }));
  });

  it("reads detail only with an explicit tenant predicate and exposes no Customer record", async () => {
    const c = context();
    c.tx.lead.findFirst.mockResolvedValueOnce(record({ convertedCustomerId: "customer-a" }));

    await expect(c.service.find(tenantId, "lead-a")).resolves.toMatchObject({
      id: "lead-a",
      convertedCustomerId: "customer-a",
      createdBy: actor,
    });
    expect(c.tx.lead.findFirst).toHaveBeenCalledWith({ where: { id: "lead-a", tenantId } });
    expect(c.sideEffects.client.findFirst).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant detail access", async () => {
    const c = context();
    c.tx.lead.findFirst.mockResolvedValue(null);

    await expect(c.service.find("tenant-b", "lead-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.lead.findFirst).toHaveBeenCalledWith({ where: { id: "lead-a", tenantId: "tenant-b" } });
  });

  it("updates only OPEN Lead commercial fields and records the authenticated actor", async () => {
    const c = context();
    c.tx.lead.findFirst
      .mockResolvedValueOnce(record())
      .mockResolvedValueOnce(record({ fullName: "Ada Byron", email: "ada.byron@example.com", phone: null, companyName: null, updatedByUserId: actor.userId, updatedByName: actor.name }));
    c.tx.lead.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.update(tenantId, "lead-a", {
      fullName: " Ada Byron ",
      email: " ADA.BYRON@EXAMPLE.COM ",
      phone: "",
      companyName: "",
    }, actor)).resolves.toMatchObject({ fullName: "Ada Byron", email: "ada.byron@example.com", phone: null });
    expect(c.tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead-a", tenantId, status: "OPEN" },
      data: expect.objectContaining({
        fullName: "Ada Byron",
        email: "ada.byron@example.com",
        phone: null,
        companyName: null,
        updatedByUserId: actor.userId,
        updatedByName: actor.name,
      }),
    });
  });

  it("rejects ordinary mutations once the Lead is CONVERTED", async () => {
    const c = context();
    c.tx.lead.findFirst.mockResolvedValue(record({ status: "CONVERTED", convertedCustomerId: "customer-a", convertedAt: new Date("2026-09-22T00:00:00.000Z") }));

    await expect(c.service.update(tenantId, "lead-a", { fullName: "Changed" }, actor))
      .rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.lead.updateMany).not.toHaveBeenCalled();
  });
});

function context() {
  const lead = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  };
  const sideEffects = {
    client: { create: jest.fn(), findFirst: jest.fn() },
    customQuotation: { create: jest.fn() },
    salesOrder: { create: jest.fn() },
  };
  const tx = { $executeRaw: jest.fn(), lead, ...sideEffects };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, sideEffects, service: new LeadsService(prisma as never) };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-a",
    tenantId,
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
    companyName: null,
    status: "OPEN" as const,
    convertedCustomerId: null,
    convertedAt: null,
    createdByUserId: actor.userId,
    createdByName: actor.name,
    updatedByUserId: null,
    updatedByName: null,
    createdAt: new Date("2026-09-22T00:00:00.000Z"),
    updatedAt: new Date("2026-09-22T00:00:00.000Z"),
    ...overrides,
  };
}
