import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OperationalRequirementsService } from "./operational-requirements.service";

const tenantId = "tenant-a";
const travelPackageId = "travel-a";
const requirementId = "requirement-a";
const actor = { userId: "user-a", name: "Operator A" };

describe("OperationalRequirementsService", () => {
  it("creates a PENDING manual requirement and all deduplicated passenger rows in one tenant transaction", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.user.findFirst.mockResolvedValue({ id: "operator-b", fullName: "Operator B" });
    c.tx.operationalRequirement.create.mockResolvedValue({ id: requirementId });
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 2 });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());

    await expect(c.service.create(tenantId, travelPackageId, {
      servicePurposeCode: "LODGING",
      servicePurposeName: "Lodging",
      description: " Hotel rooms ",
      critical: true,
      assignedToUserId: "operator-b",
      participantIds: ["participant-a", "participant-a", "participant-b"],
      sourceType: "MANUAL",
      soldValueScope: "NONE",
    }, actor)).resolves.toMatchObject({ status: "PENDING", passengers: [{ travelPackageParticipantId: "participant-a" }] });

    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId, travelPackageId, status: "PENDING", description: "Hotel rooms",
        scopeType: "TRAVEL_PACKAGE", customerId: null,
        assignedToUserId: "operator-b", assignedToName: "Operator B", sourceType: "MANUAL",
      }),
    }));
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ travelPackageParticipantId: "participant-a", createdByUserId: actor.userId }),
        expect.objectContaining({ travelPackageParticipantId: "participant-b" }),
      ]),
    });
    expect(c.tx.operationalRequirementPassenger.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid participant batch before creating a partial requirement", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);

    await expect(c.service.create(tenantId, travelPackageId, createInput({
      participantIds: ["participant-a", "participant-other-trip"],
    }), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("keeps non-manual source identity neutral while requiring a source identifier or reference", async () => {
    const c = context();
    await expect(c.service.create(tenantId, travelPackageId, createInput({ sourceType: "CONTRACT" }), actor))
      .rejects.toBeInstanceOf(BadRequestException);

    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirement.create.mockResolvedValue({ id: requirementId });
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 1 });
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }));
    await c.service.create(tenantId, travelPackageId, createInput({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }), actor);
    expect(c.tx.operationalRequirement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceType: "CONTRACT", sourceId: "contract-trace-only" }),
    }));
  });

  it.each([
    [createInput({ soldValueScope: "NONE", soldAmount: "1.00" }), "OPERATIONAL_REQUIREMENT_SOLD_VALUE_NONE_MUST_BE_EMPTY"],
    [createInput({ soldValueScope: "ORDER_TOTAL", soldAmount: "1.00" }), "OPERATIONAL_REQUIREMENT_SOLD_CURRENCY_REQUIRED"],
    [createInput({ soldValueScope: "ORDER_TOTAL", soldCurrency: "USD" }), "OPERATIONAL_REQUIREMENT_SOLD_AMOUNT_REQUIRED"],
  ])("rejects invalid sold-value combinations", async (input, code) => {
    const c = context();
    await expect(c.service.create(tenantId, travelPackageId, input, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
  });

  it("rejects an assignee outside the current tenant", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.user.findFirst.mockResolvedValue(null);

    await expect(c.service.create(tenantId, travelPackageId, createInput({ assignedToUserId: "user-tenant-b" }), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_ASSIGNEE_NOT_FOUND" }) });
    expect(c.tx.operationalRequirement.create).not.toHaveBeenCalled();
  });

  it("adds valid passengers idempotently with one bounded participant query", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement());
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    c.tx.operationalRequirementPassenger.createMany.mockResolvedValue({ count: 0 });

    await c.service.addPassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a", "participant-a"] }, actor);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith({
      where: { tenantId, travelPackageId, id: { in: ["participant-a"] } }, select: { id: true },
    });
    expect(c.tx.operationalRequirementPassenger.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it("rejects cross-package passenger additions before writing", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "PENDING" });
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([]);
    await expect(c.service.addPassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-other-trip"] }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE" }) });
    expect(c.tx.operationalRequirementPassenger.createMany).not.toHaveBeenCalled();
  });

  it("removes members idempotently but rejects removal of the final passenger", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ passengers: [passenger("participant-b")] }));
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }, { id: "participant-b" }]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      { travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-b" },
    ]);
    c.tx.operationalRequirementPassenger.deleteMany.mockResolvedValue({ count: 1 });

    await c.service.removePassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a", "participant-not-member"] });
    expect(c.tx.operationalRequirementPassenger.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ travelPackageParticipantId: { in: ["participant-a"] } }),
    }));

    const last = context();
    last.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "PENDING" });
    last.tx.travelPackageParticipant.findMany.mockResolvedValue([{ id: "participant-a" }]);
    last.tx.operationalRequirementPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }]);
    await expect(last.service.removePassengers(tenantId, travelPackageId, requirementId, { participantIds: ["participant-a"] }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("transitions only the permitted active workflow states and protects FULFILLED", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ status: "IN_PROGRESS" }));
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "IN_PROGRESS" }, actor))
      .resolves.toMatchObject({ status: "IN_PROGRESS" });

    await expect(c.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "FULFILLED" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_FULFILLED_PROTECTED" }) });

    const terminal = context();
    terminal.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "CANCELLED" });
    await expect(terminal.service.transitionStatus(tenantId, travelPackageId, requirementId, { status: "PENDING" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_INVALID" }) });
  });

  it("updates execution metadata but rejects commercial and assignment changes", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ critical: true }));
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    await c.service.update(tenantId, travelPackageId, requirementId, { critical: true }, actor);
    expect(c.tx.operationalRequirement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ critical: true, updatedByUserId: actor.userId }),
    }));
    await expect(c.service.update(tenantId, travelPackageId, requirementId, { servicePurposeCode: "TOUR" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_COMMERCIAL_FIELDS_READ_ONLY" }) });
    await expect(c.service.update(tenantId, travelPackageId, requirementId, { assignedToUserId: "user-b" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_REQUIREMENT_COMMERCIAL_FIELDS_READ_ONLY" }) });
  });

  it("lists a bounded deterministic page with passenger counts and never loads passenger graphs", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.operationalRequirement.findMany.mockResolvedValue([{ ...requirement(), _count: { passengers: 2 } }]);
    c.tx.operationalRequirement.count.mockResolvedValue(26);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([
      { travelPackageParticipantId: "participant-a", operationalFulfillment: { operationalRequirementId: requirementId } },
      { travelPackageParticipantId: "participant-a", operationalFulfillment: { operationalRequirementId: requirementId } },
    ]);
    c.tx.operationalRequirementPassenger.findMany.mockResolvedValue([
      { operationalRequirementId: requirementId, travelPackageParticipant: { client: { fullName: "Ada Lovelace" } } },
      { operationalRequirementId: requirementId, travelPackageParticipant: { client: { fullName: "Ben Turing" } } },
    ]);

    await expect(c.service.list(tenantId, travelPackageId, { status: "PENDING", page: 2, pageSize: 20 }))
      .resolves.toMatchObject({ total: 26, page: 2, totalPages: 2, items: [{ passengerCount: 2, passengerPreview: ["Ada Lovelace", "Ben Turing"], coverage: { fulfilledPassengerCount: 1, totalPassengerCount: 2 } }] });
    expect(c.tx.operationalRequirement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, travelPackageId, status: "PENDING" }),
      take: 20, skip: 20,
      orderBy: [{ operationalDeadlineAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }));
    expect(c.tx.operationalRequirement.findMany.mock.calls[0][0].select).not.toHaveProperty("passengers");
    expect(c.tx.operationalFulfillmentPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalRequirementPassenger.findMany).toHaveBeenCalledTimes(1);
  });

  it("gets detail only through tenant and TravelPackage predicates with minimal participant display", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([{ travelPackageParticipantId: "participant-a" }, { travelPackageParticipantId: "participant-a" }]);
    await expect(c.service.find(tenantId, travelPackageId, requirementId)).resolves.toMatchObject({
      passengers: [{ travelPackageParticipantId: "participant-a", clientId: "client-a", fullName: "Ada Lovelace", role: "TRAVELER" }], coverage: { fulfilledPassengerCount: 1, totalPassengerCount: 1 },
    });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: requirementId, tenantId, travelPackageId },
    }));

    const hidden = context();
    hidden.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    await expect(hidden.service.find("tenant-b", travelPackageId, requirementId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reads standalone requirements by generic tenant identity without package or participant queries", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: "customer-a", customer: { id: "customer-a", fullName: "Ada Customer" }, passengers: [] }));
    c.tx.operationalFulfillment.findMany.mockResolvedValue([{ id: "fulfillment-a", status: "DRAFT", _count: { purchases: 1 } }]);
    await expect(c.service.findStandalone(tenantId, requirementId)).resolves.toMatchObject({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customer: { id: "customer-a" }, passengers: [], coverage: { totalPassengerCount: 0 }, workflow: { fulfillmentCount: 1, purchaseCount: 1 } });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId, id: requirementId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null }) }));
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
    expect(c.tx.travelPackageParticipant.findMany).not.toHaveBeenCalled();
  });

  it("displays a historical confirmed Custom Quotation service as fulfilled", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement({
      scopeType: "STANDALONE_CUSTOMER",
      travelPackageId: null,
      customerId: "customer-a",
      customer: { id: "customer-a", fullName: "Ada Customer" },
      passengers: [],
      sourceType: "CUSTOM_QUOTATION_LINE",
      status: "IN_PROGRESS",
    }));
    c.tx.operationalFulfillment.findMany.mockResolvedValue([{ id: "fulfillment-a", status: "CONFIRMED", _count: { purchases: 1 } }]);

    await expect(c.service.findStandalone(tenantId, requirementId)).resolves.toMatchObject({ status: "FULFILLED" });
  });

  it("filters the standalone queue by tenant-safe customer and generic source identity", async () => {
    const c = context();
    c.tx.operationalRequirement.findMany.mockResolvedValue([]);
    c.tx.operationalRequirement.count.mockResolvedValue(0);
    await expect(c.service.listStandalone(tenantId, { sourceType: "CUSTOM_QUOTATION_LINE", search: "Ada" })).resolves.toMatchObject({ items: [], total: 0 });
    expect(c.tx.operationalRequirement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        scopeType: "STANDALONE_CUSTOMER",
        travelPackageId: null,
        sourceType: "CUSTOM_QUOTATION_LINE",
        OR: expect.arrayContaining([{ customer: { is: { fullName: { contains: "Ada", mode: "insensitive" } } } }]),
      }),
    }));
  });

  it("groups Custom Quotation lines by immutable version source without collapsing separate quotations for one customer", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }, { sourceId: "version-b" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 2n }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      customQuotationRequirement({ id: "requirement-a", sourceId: "version-a", sourceLineId: "line-a", description: "Alimentación", soldAmount: new Prisma.Decimal("10.00000"), status: "PENDING" }),
      customQuotationRequirement({ id: "requirement-b", sourceId: "version-a", sourceLineId: "line-b", description: "Transporte", soldAmount: new Prisma.Decimal("20.00000"), status: "IN_PROGRESS" }),
      customQuotationRequirement({ id: "requirement-c", sourceId: "version-b", sourceLineId: "line-c", description: "Equipaje", soldAmount: new Prisma.Decimal("30.00000"), status: "PENDING" }),
    ]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([
      { id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: { id: "sales-a", orderNumber: "SO-001" } },
      { id: "version-b", customQuotation: { quotationNumber: "CQ-002" }, salesOrder: { id: "sales-b", orderNumber: "SO-002" } },
    ]);
    c.tx.billingDocument.findMany.mockResolvedValue([
      acceptedBillingDocument({ sourceId: "sales-a", documentTypeCode: "01", fiscalNumber: "00100001010000000001" }),
    ]);

    const result = await c.service.listStandaloneCustomQuotationGroups(tenantId, { page: 1, pageSize: 20 });

    expect(result).toMatchObject({
      total: 2,
      items: [
        {
          sourceId: "version-a", quotationNumber: "CQ-001", salesOrderNumber: "SO-001",
          billingDocumentId: "billing-a", billingDocumentType: "01", fiscalDocumentNumber: "00100001010000000001",
          fiscalKey: "5".repeat(50), fiscalTotal: { amount: "30", currency: "USD" }, fiscalStatus: "ACCEPTED",
          customer: { id: "customer-a", fullName: "Ada Customer", idType: "01", idNumber: "1-0001-0001" },
          serviceCount: 2, status: "IN_PROGRESS", commercialValue: { amount: "30", currency: "USD" },
          requirements: [{ requirementId: "requirement-a", sourceLineId: "line-a" }, { requirementId: "requirement-b", sourceLineId: "line-b" }],
        },
        { sourceId: "version-b", quotationNumber: "CQ-002", serviceCount: 1, requirements: [{ requirementId: "requirement-c", sourceLineId: "line-c" }] },
      ],
    });
    expect(result.items[0].requirements.map((item) => item.requirementId)).toEqual(["requirement-a", "requirement-b"]);
    expect(c.tx.operationalRequirement.groupBy).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalRequirement.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.customQuotationVersion.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.billingDocument.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.billingDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, sourceType: "SALES_ORDER", sourceId: { in: ["sales-a", "sales-b"] }, sourceRole: "PRIMARY" }),
    }));
    expect(c.finance.readMany).toHaveBeenCalledTimes(1);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["01", "00100001010000000001"],
    ["04", "00400001010000000004"],
  ])("includes the accepted primary fiscal document type %s without per-group reads", async (documentTypeCode, fiscalNumber) => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([customQuotationRequirement()]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([
      { id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: { id: "sales-a", orderNumber: "SO-001" } },
    ]);
    c.tx.billingDocument.findMany.mockResolvedValue([
      acceptedBillingDocument({ documentTypeCode, fiscalNumber }),
    ]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({
      items: [{ billingDocumentId: "billing-a", billingDocumentType: documentTypeCode, fiscalDocumentNumber: fiscalNumber, fiscalStatus: "ACCEPTED" }],
    });
    expect(c.tx.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps an Operations group visible without fiscal fields when no accepted document exists", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([customQuotationRequirement()]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([
      { id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: { id: "sales-a", orderNumber: "SO-001" } },
    ]);
    c.tx.billingDocument.findMany.mockResolvedValue([]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({
      items: [{ billingDocumentId: null, billingDocumentType: null, fiscalDocumentNumber: null, fiscalKey: null, fiscalTotal: null, fiscalStatus: null }],
    });
  });

  it.each([
    ["no fiscal document", [], financialResult({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }), "PENDIENTE_FACTURACION"],
    ["pending fiscal document", [acceptedBillingDocument({ taxAuthorityStatus: "PROCESSING" })], financialResult({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }), "PENDIENTE_ACEPTACION_FISCAL"],
    ["accepted invoice without AR", [acceptedBillingDocument()], financialResult({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }), "PENDIENTE_REGISTRO_FINANCIERO"],
    ["accepted invoice with outstanding balance", [acceptedBillingDocument()], financialResult({ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE", financial: { outstandingAmount: "10.00", currency: "USD" } }), "PENDIENTE_PAGO"],
    ["settled invoice", [acceptedBillingDocument()], financialResult({ eligibility: "ELIGIBLE", reason: "SETTLED" }), "LISTO_PARA_PROCESAR"],
    ["accepted CASH ticket", [acceptedBillingDocument({ documentTypeCode: "04" })], financialResult({ eligibility: "ELIGIBLE", reason: "SETTLED" }), "LISTO_PARA_PROCESAR"],
  ])("projects %s as the service finance eligibility without per-service reads", async (_case, documents, financeResult, eligibilityStatus) => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([customQuotationRequirement()]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([
      { id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: { id: "sales-a", orderNumber: "SO-001" } },
    ]);
    c.tx.billingDocument.findMany.mockResolvedValue(documents);
    c.finance.readMany.mockResolvedValue([financeResult]);
    const financial = (financeResult as any).financial;

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({
      items: [{ requirements: [{ eligibilityStatus, eligibilityReason: financeResult.reason, outstandingAmount: financial?.outstandingAmount ?? null, currency: financial?.currency ?? null }] }],
    });
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "line-a" }] });
  });

  it("marks mixed terminal Custom Quotation services as display-only COMPLETED", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      customQuotationRequirement({ id: "requirement-a", status: "FULFILLED" }),
      customQuotationRequirement({ id: "requirement-b", sourceLineId: "line-b", status: "CANCELLED" }),
    ]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: null }]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({ items: [{ status: "COMPLETED" }] });
  });

  it("projects confirmed Custom Quotation services as fulfilled while active siblings keep the group in progress", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      customQuotationRequirement({ id: "requirement-confirmed", status: "FULFILLED" }),
      customQuotationRequirement({ id: "requirement-active", sourceLineId: "line-b", status: "IN_PROGRESS" }),
    ]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: null }]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({
      items: [{
        status: "IN_PROGRESS",
        requirements: [
          { requirementId: "requirement-confirmed", status: "FULFILLED" },
          { requirementId: "requirement-active", status: "IN_PROGRESS" },
        ],
      }],
    });
  });

  it("projects a historical confirmed fulfillment as completed in its group line", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      customQuotationRequirement({ id: "requirement-confirmed", status: "IN_PROGRESS", fulfillments: [{ id: "fulfillment-confirmed" }] }),
      customQuotationRequirement({ id: "requirement-active", sourceLineId: "line-b", status: "IN_PROGRESS" }),
    ]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: null }]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({
      items: [{
        status: "IN_PROGRESS",
        requirements: [
          { requirementId: "requirement-confirmed", status: "FULFILLED" },
          { requirementId: "requirement-active", status: "IN_PROGRESS" },
        ],
      }],
    });
  });

  it("projects an all-fulfilled Custom Quotation group as completed", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([{ sourceId: "version-a" }]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 1 }]);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      customQuotationRequirement({ id: "requirement-a", status: "FULFILLED" }),
      customQuotationRequirement({ id: "requirement-b", sourceLineId: "line-b", status: "FULFILLED" }),
    ]);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: null }]);

    await expect(c.service.listStandaloneCustomQuotationGroups(tenantId, {})).resolves.toMatchObject({ items: [{ status: "COMPLETED" }] });
  });

  it("keeps only active Custom Quotation requirements in the queue query", async () => {
    const c = context();
    c.tx.operationalRequirement.groupBy.mockResolvedValue([]);
    c.tx.$queryRaw.mockResolvedValue([{ total: 0 }]);

    await c.service.listStandaloneCustomQuotationGroups(tenantId, {});

    expect(c.tx.operationalRequirement.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        NOT: { fulfillments: { some: { status: { in: ["CONFIRMED", "CANCELLED"] } } } },
      }),
    }));
  });

  it("returns confirmed and cancelled Custom Quotation purchases as bounded immutable history rows", async () => {
    const c = context();
    c.tx.operationalFulfillment.findMany.mockResolvedValue([
      customQuotationHistoryFulfillment(),
      customQuotationHistoryFulfillment({ id: "fulfillment-cancelled", status: "CANCELLED", confirmationReference: null, purchases: [] }),
    ]);
    c.tx.operationalFulfillment.count.mockResolvedValue(2);
    c.tx.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", customQuotation: { quotationNumber: "CQ-001" }, salesOrder: { id: "sales-a", orderNumber: "SO-001" } }]);
    c.tx.billingDocument.findMany.mockResolvedValue([acceptedBillingDocument()]);

    await expect(c.service.listStandaloneCustomQuotationHistory(tenantId, { page: 1 })).resolves.toMatchObject({
      total: 2,
      dateAuthority: "FULFILLMENT_FINALIZED_AT",
      items: [
        { fulfillmentId: "fulfillment-a", finalStatus: "CONFIRMED", quotationNumber: "CQ-001", purchase: { providerName: "Proveedor Uno", amount: "25", evidenceCount: 1 } },
        { fulfillmentId: "fulfillment-cancelled", finalStatus: "CANCELLED", purchase: null },
      ],
    });
    expect(c.tx.operationalFulfillment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, status: { in: ["CONFIRMED", "CANCELLED"] } }),
      take: 20,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }));
    expect(c.tx.operationalFulfillment.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.customQuotationVersion.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["customer name", "Ada", { fullName: { contains: "Ada", mode: "insensitive" } }],
    ["identification", "1-0001", { idNumber: { contains: "1-0001", mode: "insensitive" } }],
    ["email", "ada@example.com", { email: { contains: "ada@example.com", mode: "insensitive" } }],
  ])("filters Custom Quotation history by %s without losing tenant scope", async (_label, search, expectedCustomerFilter) => {
    const c = context();
    c.tx.operationalFulfillment.findMany.mockResolvedValue([]);
    c.tx.operationalFulfillment.count.mockResolvedValue(0);
    c.tx.billingDocument.findMany.mockResolvedValue([]);

    await c.service.listStandaloneCustomQuotationHistory(tenantId, { search });

    const where = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId, status: { in: ["CONFIRMED", "CANCELLED"] } });
    expect(JSON.stringify(where)).toContain(JSON.stringify(expectedCustomerFilter));
  });

  it("filters Custom Quotation history by fiscal document number through tenant-safe bulk reads", async () => {
    const c = context();
    c.tx.billingDocument.findMany.mockResolvedValueOnce([{ sourceId: "sales-a" }]).mockResolvedValueOnce([]);
    c.tx.customQuotationVersion.findMany.mockResolvedValueOnce([{ id: "version-a" }]);
    c.tx.operationalFulfillment.findMany.mockResolvedValue([]);
    c.tx.operationalFulfillment.count.mockResolvedValue(0);

    await c.service.listStandaloneCustomQuotationHistory(tenantId, { search: "00100001010000000001" });

    expect(c.tx.billingDocument.findMany.mock.calls[0][0]).toMatchObject({ where: { tenantId, sourceType: "SALES_ORDER", sourceRole: "PRIMARY", fiscalNumber: { contains: "00100001010000000001", mode: "insensitive" } } });
    expect(c.tx.customQuotationVersion.findMany.mock.calls[0][0]).toMatchObject({ where: { tenantId, salesOrderId: { in: ["sales-a"] } } });
    expect(c.tx.operationalFulfillment.findMany.mock.calls[0][0].where).toMatchObject({ tenantId, AND: expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })]) });
  });

  it.each([
    ["TODAY", "2026-10-09T06:00:00.000Z", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["LAST_7_DAYS", "2026-10-03T06:00:00.000Z", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["LAST_15_DAYS", "2026-09-25T06:00:00.000Z", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["LAST_MONTH", "2026-09-10T06:00:00.000Z", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
  ] as const)("applies the %s history date preset in the tenant timezone", async (preset, expectedStart, _today, expectedEnd) => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-09T18:00:00.000Z"));
    const c = context();
    c.tx.operationalFulfillment.findMany.mockResolvedValue([]);
    c.tx.operationalFulfillment.count.mockResolvedValue(0);
    await c.service.listStandaloneCustomQuotationHistory(tenantId, { datePreset: preset });
    const range = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.updatedAt;
    expect(range.gte.toISOString()).toBe(expectedStart);
    expect(range.lt.toISOString()).toBe(expectedEnd);
    jest.useRealTimers();
  });

  it("applies a custom tenant-calendar date range without browser date conversion", async () => {
    const c = context();
    c.tx.operationalFulfillment.findMany.mockResolvedValue([]);
    c.tx.operationalFulfillment.count.mockResolvedValue(0);
    await c.service.listStandaloneCustomQuotationHistory(tenantId, { datePreset: "CUSTOM", dateFrom: "2026-10-01", dateTo: "2026-10-02" });
    const range = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.updatedAt;
    expect(range.gte.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-10-03T06:00:00.000Z");
  });

  it("rejects standalone passenger assignment explicitly", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId, status: "PENDING" });
    await expect(c.service.rejectStandalonePassengerAssignment(tenantId, requirementId)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_STANDALONE_PASSENGERS_UNSUPPORTED" }) });
  });

  it("uses the normal status transition rules for standalone requirements", async () => {
    const c = context();
    c.tx.operationalRequirement.findFirst
      .mockResolvedValueOnce({ id: requirementId, status: "PENDING" })
      .mockResolvedValueOnce(requirement({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: "customer-a", status: "IN_PROGRESS", passengers: [] }));
    c.tx.operationalRequirement.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.transitionStandaloneStatus(tenantId, requirementId, { status: "IN_PROGRESS" }, actor)).resolves.toMatchObject({ status: "IN_PROGRESS" });
    expect(c.tx.operationalRequirement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, status: "PENDING" }), data: expect.objectContaining({ status: "IN_PROGRESS" }) }));
  });
});

function context() {
  const finance = { readMany: jest.fn().mockResolvedValue([]) };
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    travelPackage: { findFirst: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    operationalRequirement: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn() },
    operationalRequirementPassenger: { createMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    operationalFulfillmentPassenger: { findMany: jest.fn() },
    operationalFulfillment: { findMany: jest.fn(), count: jest.fn() },
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    customQuotationVersion: { findMany: jest.fn() },
    billingDocument: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, finance, service: new OperationalRequirementsService(prisma as never, finance) };
}

function customQuotationRequirement(overrides: Record<string, unknown> = {}) {
  return {
    id: "requirement-a",
    sourceId: "version-a",
    sourceLineId: "line-a",
    description: "Alimentación",
    status: "PENDING",
    soldAmount: new Prisma.Decimal("10.00000"),
    soldCurrency: "USD",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    customer: { id: "customer-a", fullName: "Ada Customer", idType: "01", idNumber: "1-0001-0001" },
    fulfillments: [],
    ...overrides,
  };
}

function customQuotationHistoryFulfillment(overrides: Record<string, unknown> = {}) {
  return {
    id: "fulfillment-a",
    status: "CONFIRMED",
    confirmationReference: "CONF-001",
    updatedAt: new Date("2026-10-09T18:00:00.000Z"),
    operationalRequirement: {
      id: "requirement-a",
      status: "FULFILLED",
      description: "Alimentación: Todo incluido",
      sourceId: "version-a",
      customer: { id: "customer-a", fullName: "Ada Customer", idType: "01", idNumber: "1-0001-0001", email: "ada@example.com" },
    },
    purchases: [{
      id: "purchase-a",
      providerName: "Proveedor Uno",
      supplierReference: "PROV-001",
      amount: new Prisma.Decimal("25.00000"),
      currency: "USD",
      taxAmount: new Prisma.Decimal("3.25000"),
      purchasedAt: new Date("2026-10-08T18:00:00.000Z"),
      supplierInvoiceNumber: "FACT-001",
      notes: "Compra histórica",
      evidence: [{ id: "evidence-a", originalFilename: "factura.pdf", mimeType: "application/pdf", byteSize: 100, createdAt: new Date("2026-10-08T18:00:00.000Z") }],
      _count: { evidence: 1 },
    }],
    ...overrides,
  };
}

function acceptedBillingDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "billing-a",
    sourceId: "sales-a",
    documentTypeCode: "01",
    fiscalNumber: "00100001010000000001",
    haciendaKey: "5".repeat(50),
    currencyCode: "USD",
    total: new Prisma.Decimal("30.00000"),
    taxAuthorityStatus: "ACCEPTED",
    ...overrides,
  };
}

function financialResult(overrides: Record<string, any> = {}) {
  return {
    source: { sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "line-a" },
    eligibility: "ELIGIBLE",
    reason: "SETTLED",
    ...overrides,
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    servicePurposeCode: "LODGING",
    servicePurposeName: "Lodging",
    description: "Hotel rooms",
    participantIds: ["participant-a"],
    sourceType: "MANUAL",
    soldValueScope: "NONE",
    ...overrides,
  } as any;
}

function passenger(id = "participant-a") {
  return {
    travelPackageParticipantId: id,
    travelPackageParticipant: { id, clientId: id === "participant-a" ? "client-a" : "client-b", role: "TRAVELER", client: { fullName: "Ada Lovelace" } },
  };
}

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    id: requirementId,
    travelPackageId,
    servicePurposeCode: "LODGING",
    servicePurposeName: "Lodging",
    description: "Hotel rooms",
    status: "PENDING",
    critical: false,
    operationalDeadlineAt: null,
    assignedToUserId: null,
    assignedToName: null,
    sourceType: "MANUAL",
    sourceId: null,
    sourceLineId: null,
    sourceVersionId: null,
    sourceReference: null,
    sourceAcceptedAt: null,
    sourcePassengerGroupId: null,
    sourcePassengerGroupName: null,
    sourcePassengerGroupServiceCode: null,
    soldAmount: null,
    soldCurrency: null,
    soldValueScope: "NONE",
    createdAt: new Date("2026-09-29T10:00:00.000Z"),
    updatedAt: new Date("2026-09-29T10:00:00.000Z"),
    passengers: [passenger()],
    ...overrides,
  };
}
