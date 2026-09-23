import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationVersionService } from "./custom-quotation-version.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationVersionService", () => {
  it("atomically issues version 1 with frozen commercial, fiscal, and structured-component snapshots", async () => {
    const c = context();
    prepareIssuableQuotation(c);

    const result = await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.pricing.approveCalculationInTransaction).toHaveBeenCalledWith(c.tx, "tenant-a", "pricing-a", actor);
    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-a", customQuotationId: "quotation-a", versionNumber: 1,
        finalSellingPrice: "1450.12345", pricingCalculationVersionId: "pricing-a",
        cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08",
        fiscalTaxPercentage: "13.0000",
        title: "Viaje corporativo",
        recipientFullName: "Cliente A", recipientEmail: "cliente@example.test",
        recipientPhone: "8888-8888", recipientCompanyName: null,
      }),
    }));
    expect(c.tx.customQuotationVersionLine.createMany).toHaveBeenCalledWith({ data: [
      { tenantId: "tenant-a", customQuotationVersionId: "issued-a", displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
      { tenantId: "tenant-a", customQuotationVersionId: "issued-a", displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
    ] });
    expect(c.commercialLines.listInTransaction).toHaveBeenCalledWith(c.tx, "tenant-a", "quotation-a");
    expect(c.tx.customQuotationLine).toBeUndefined();
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quotation-a", tenantId: "tenant-a", status: "DRAFT" },
      data: expect.objectContaining({ status: "ISSUED" }),
    }));
    expect(result).toEqual(expect.objectContaining({
      customQuotationVersionId: "issued-a", quotationId: "quotation-a", versionNumber: 1,
      quotationNumber: "CQ-2026-000001", finalSellingPrice: "1450.12345", status: "ISSUED",
      title: "Viaje corporativo",
      lines: [
        { displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
        { displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
      ],
    }));
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });

  it("does not let later draft or fiscal source changes alter the persisted snapshots", async () => {
    const c = context();
    prepareIssuableQuotation(c);
    await c.service.issue("tenant-a", "quotation-a", actor);

    const versionInput = c.tx.customQuotationVersion.create.mock.calls[0][0].data;
    const lineInput = c.tx.customQuotationVersionLine.createMany.mock.calls[0][0].data;
    expect(versionInput).toMatchObject({ fiscalDescription: "Transporte privado", cabysCode: "1234567890123" });
    expect(lineInput[0]).toMatchObject({ description: "Traslado privado", quantity: "1.2500" });
    expect(versionInput).not.toHaveProperty("tenantFiscalClassification");
    expect(lineInput[0]).not.toHaveProperty("customQuotationLineId");
  });

  it("rejects stale or missing pricing, missing structured components, missing defaults, non-DRAFT and cross-tenant quotations", async () => {
    const stale = context();
    prepareIssuableQuotation(stale);
    stale.currentCosts.read.mockResolvedValue({ authoritativeTotalCost: "1001.00000", baseCurrency: "USD" });
    await expect(stale.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(stale.pricing.approveCalculationInTransaction).not.toHaveBeenCalled();
    expect(stale.tx.customQuotationVersion.create).not.toHaveBeenCalled();

    const missingCalculation = context();
    prepareIssuableQuotation(missingCalculation);
    missingCalculation.tx.pricingCalculationVersion.findFirst.mockResolvedValue(null);
    await expect(missingCalculation.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(NotFoundException);

    const noComponents = context();
    prepareIssuableQuotation(noComponents);
    noComponents.commercialLines.listInTransaction.mockResolvedValue([]);
    await expect(noComponents.service.issue("tenant-a", "quotation-a", actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    expect(noComponents.tx.customQuotationLine).toBeUndefined();

    const noDefault = context();
    prepareIssuableQuotation(noDefault);
    noDefault.fiscalClassifications.resolveDefaultCustomQuotationFiscalClassificationInTransaction
      .mockRejectedValue(new NotFoundException("CUSTOM_QUOTATION_FISCAL_DEFAULT_NOT_CONFIGURED"));
    await expect(noDefault.service.issue("tenant-a", "quotation-a", actor))
      .rejects.toThrow("CUSTOM_QUOTATION_FISCAL_DEFAULT_NOT_CONFIGURED");

    const nonDraft = context();
    prepareIssuableQuotation(nonDraft);
    nonDraft.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    await expect(nonDraft.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const crossTenant = context();
    crossTenant.tx.$queryRaw.mockResolvedValue([]);
    await expect(crossTenant.service.issue("tenant-a", "quotation-b", actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reuses an already approved, fresh pricing version without approving it again", async () => {
    const c = context();
    prepareIssuableQuotation(c, { pricing: pricingCalculation({ status: "APPROVED" }) });

    await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.pricing.approveCalculationInTransaction).not.toHaveBeenCalled();
    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pricingCalculationVersionId: "pricing-a", finalSellingPrice: "1450.12345" }),
    }));
  });

  it("uses the active default at issuance rather than a historical draft-root classification", async () => {
    const c = context();
    prepareIssuableQuotation(c);
    c.fiscalClassifications.resolveDefaultCustomQuotationFiscalClassificationInTransaction
      .mockResolvedValue(classification({ id: "fiscal-b", displayName: "Paquete turístico", cabysCode: "9876543210123" }));

    await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.fiscalClassifications.resolveDefaultCustomQuotationFiscalClassificationInTransaction)
      .toHaveBeenCalledWith(c.tx, "tenant-a");
    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fiscalClassificationId: "fiscal-b", fiscalDescription: "Paquete turístico", cabysCode: "9876543210123" }),
    }));
  });

  it("freezes a Lead recipient without creating or reading a Customer", async () => {
    const c = context();
    prepareIssuableQuotation(c, { quotation: quotation({
      leadId: "lead-a",
      customerId: null,
      lead: { fullName: "Ada Lead", email: "ada@example.test", phone: "2222", companyName: "Orbit Travel" },
      customer: null,
    }) });

    await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recipientFullName: "Ada Lead", recipientEmail: "ada@example.test",
        recipientPhone: "2222", recipientCompanyName: "Orbit Travel",
      }),
    }));
    expect(c.tx.client).toBeUndefined();
  });

  it("reads only the immutable version snapshots with ordered lines and exact money", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(versionSnapshot());

    await expect(c.service.find("tenant-a", "quotation-a", "version-a")).resolves.toEqual({
      versionId: "version-a",
      quotationId: "quotation-a",
      quotationNumber: "CQ-2026-000001",
      versionNumber: 1,
      status: "ISSUED",
      title: "Propuesta congelada",
      salesOrder: null,
      recipientFullName: "Ana Prospecto",
      recipientEmail: "ana@example.test",
      recipientPhone: "+506 8888-8888",
      recipientCompanyName: "Orbit Travel",
      lines: [
        { id: "version-line-a", displayOrder: 1, description: "Traslado congelado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
        { id: "version-line-b", displayOrder: 2, description: "Servicio congelado", quantity: "2.0000", commercialNote: null },
      ],
      currency: "USD",
      finalSellingPrice: "1450.12345",
      quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"),
      paymentConditionType: "CREDIT",
      paymentTermValue: 30,
      paymentTermUnit: "DAYS",
      commercialObservations: "Tarifa congelada",
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
      acceptedAt: null,
      rejectedAt: null,
    });

    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-a", tenantId: "tenant-a", customQuotationId: "quotation-a" },
      select: expect.objectContaining({
        salesOrderId: true,
        salesOrder: { select: { id: true, orderNumber: true } },
        lines: expect.objectContaining({ orderBy: [{ displayOrder: "asc" }, { id: "asc" }] }),
      }),
    }));
    expect(c.tx.customQuotationLine).toBeUndefined();
    expect(c.tx.lead).toBeUndefined();
    expect(c.tx.client).toBeUndefined();
    expect(c.tx.pricingCalculationVersion.findFirst).not.toHaveBeenCalled();
  });

  it("does not derive an immutable read from later live Lead, Customer, root-title, or draft-line changes", async () => {
    const c = context();
    const persisted = versionSnapshot();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(persisted);

    const result = await c.service.find("tenant-a", "quotation-a", "version-a");
    const laterLiveLead = { fullName: "Nombre cambiado", email: "nuevo@example.test" };
    const laterLiveCustomer = { fullName: "Cliente cambiado", email: "otro@example.test" };
    const laterRootTitle = "Título mutable posterior";
    const laterDraftLine = { description: "Línea mutable", quantity: "999.0000" };

    expect(result.recipientFullName).toBe("Ana Prospecto");
    expect(result.recipientEmail).toBe("ana@example.test");
    expect(result.title).toBe("Propuesta congelada");
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "Traslado congelado", quantity: "1.2500" }),
    ]));
    expect(laterLiveLead.fullName).toBe("Nombre cambiado");
    expect(laterLiveCustomer.fullName).toBe("Cliente cambiado");
    expect(laterRootTitle).toBe("Título mutable posterior");
    expect(laterDraftLine.description).toBe("Línea mutable");
    expect(c.tx.customQuotationLine).toBeUndefined();
    expect(c.tx.lead).toBeUndefined();
    expect(c.tx.client).toBeUndefined();
  });

  it("returns a missing title snapshot as null without falling back to the mutable quotation title", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(versionSnapshot({
      title: null,
      customQuotation: { quotationNumber: "CQ-2026-000001", title: "Título mutable" },
    }));

    await expect(c.service.find("tenant-a", "quotation-a", "version-a"))
      .resolves.toEqual(expect.objectContaining({ title: null }));
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ customQuotation: { select: { quotationNumber: true } } }),
    }));
  });

  it("returns only the tenant-safe Sales Order summary linked from the immutable version", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(versionSnapshot({
      salesOrderId: "sales-a",
      salesOrder: { id: "sales-a", orderNumber: "SO-2026-000001" },
    }));

    const result = await c.service.find("tenant-a", "quotation-a", "version-a");
    expect(result).toEqual(expect.objectContaining({
      salesOrder: { id: "sales-a", orderNumber: "SO-2026-000001" },
    }));
    expect(result.salesOrder).not.toHaveProperty("fiscalSnapshot");
    expect(result.salesOrder).not.toHaveProperty("billingStatus");
    expect(result.salesOrder).not.toHaveProperty("accountReceivable");
  });

  it("fails deterministically if an immutable version has an unresolved Sales Order link", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(versionSnapshot({ salesOrderId: "sales-a", salesOrder: null }));

    await expect(c.service.find("tenant-a", "quotation-a", "version-a"))
      .rejects.toThrow("CUSTOM_QUOTATION_VERSION_SALES_ORDER_CONFLICT");
  });

  it("rejects cross-tenant access and version/quotation mismatches", async () => {
    const crossTenant = context();
    crossTenant.tx.customQuotationVersion.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.find("tenant-a", "quotation-b", "version-a"))
      .rejects.toThrow("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
    expect(crossTenant.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-a", tenantId: "tenant-a", customQuotationId: "quotation-b" },
    }));
  });

  it("reads the latest version deterministically without exposing pricing, cost, or fiscal internals", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(versionSnapshot({
      id: "version-b", versionNumber: 2, status: "ACCEPTED", acceptedAt: new Date("2026-09-22T00:00:00.000Z"),
      salesOrderId: "sales-b", salesOrder: { id: "sales-b", orderNumber: "SO-2026-000002" },
    }));

    const result = await c.service.findLatest("tenant-a", "quotation-a");

    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", customQuotationId: "quotation-a" },
      orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
    }));
    expect(result).toEqual(expect.objectContaining({ versionId: "version-b", versionNumber: 2, status: "ACCEPTED" }));
    expect(result.salesOrder).toEqual({ id: "sales-b", orderNumber: "SO-2026-000002" });
    expect(result).not.toHaveProperty("authoritativeCostAmount");
    expect(result).not.toHaveProperty("pricingConfiguration");
    expect(result).not.toHaveProperty("cabysCode");
    expect(result).not.toHaveProperty("tenantId");
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "quotation-a" }]),
    customQuotation: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    pricingCalculationVersion: { findFirst: jest.fn() },
    pricingConfiguration: {},
    customQuotationVersion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(issuedVersion()) },
    customQuotationVersionLine: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const currentCosts = { read: jest.fn().mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "1000.00000" }) };
  const pricing = { approveCalculationInTransaction: jest.fn().mockResolvedValue(pricingCalculation({ status: "APPROVED" })) };
  const fiscalClassifications = { resolveDefaultCustomQuotationFiscalClassificationInTransaction: jest.fn().mockResolvedValue(classification()) };
  const commercialLines = { listInTransaction: jest.fn().mockResolvedValue(lines()) };
  return { tx, currentCosts, pricing, fiscalClassifications, commercialLines, service: new CustomQuotationVersionService(prisma as never, currentCosts as never, pricing as never, fiscalClassifications as never, commercialLines as never) };
}

function prepareIssuableQuotation(c: ReturnType<typeof context>, input: { pricing?: Record<string, unknown>; quotation?: Record<string, unknown> } = {}) {
  c.tx.customQuotation.findFirst.mockResolvedValue(input.quotation ?? quotation());
  c.commercialLines.listInTransaction.mockResolvedValue(lines());
  c.tx.pricingCalculationVersion.findFirst.mockResolvedValue(input.pricing ?? pricingCalculation());
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-a", quotationNumber: "CQ-2026-000001", title: "Viaje corporativo", leadId: null, customerId: "customer-a",
    customer: { fullName: "Cliente A", email: "cliente@example.test", phone: "8888-8888" }, lead: null,
    currency: "USD", status: "DRAFT",
    commercialObservations: "Incluye traslados", quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"),
    paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS", fiscalClassificationId: "legacy-fiscal-a",
    costingProjectLink: { costingProject: { id: "project-a", baseCurrency: "USD" } }, ...overrides,
  };
}

function pricingCalculation(overrides: Record<string, unknown> = {}) {
  return { id: "pricing-a", costingProjectId: "project-a", currency: "USD", status: "DRAFT", authoritativeCostAmount: "1000.00000", finalSellingPrice: "1450.12345", ...overrides };
}

function classification(overrides: Record<string, unknown> = {}) {
  return { id: "fiscal-a", isActive: true, displayName: "Transporte privado", description: null, fiscalItemCategory: "SERVICE", cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000", ...overrides };
}

function lines() {
  return [
    { id: "line-a", displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
    { id: "line-b", displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
  ];
}

function issuedVersion() {
  return {
    id: "issued-a", customQuotationId: "quotation-a", versionNumber: 1, currency: "USD", finalSellingPrice: "1450.12345",
    title: "Viaje corporativo",
    quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"), status: "ISSUED", createdAt: new Date("2026-09-21T00:00:00.000Z"),
  };
}

function versionSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a",
    customQuotationId: "quotation-a",
    versionNumber: 1,
    status: "ISSUED",
    title: "Propuesta congelada",
    salesOrderId: null,
    salesOrder: null,
    recipientFullName: "Ana Prospecto",
    recipientEmail: "ana@example.test",
    recipientPhone: "+506 8888-8888",
    recipientCompanyName: "Orbit Travel",
    currency: "USD",
    finalSellingPrice: "1450.12345",
    quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"),
    paymentConditionType: "CREDIT",
    paymentTermValue: 30,
    paymentTermUnit: "DAYS",
    commercialObservations: "Tarifa congelada",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    acceptedAt: null,
    rejectedAt: null,
    customQuotation: { quotationNumber: "CQ-2026-000001" },
    lines: [
      { id: "version-line-a", displayOrder: 1, description: "Traslado congelado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
      { id: "version-line-b", displayOrder: 2, description: "Servicio congelado", quantity: "2.0000", commercialNote: null },
    ],
    ...overrides,
  };
}
