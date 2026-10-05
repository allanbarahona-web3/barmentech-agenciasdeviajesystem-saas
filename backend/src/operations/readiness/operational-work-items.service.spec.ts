import { OperationalWorkItemsService } from "./operational-work-items.service";

const tenantId = "tenant-a", travelPackageId = "trip-a";

describe("OperationalWorkItemsService", () => {
  it("preserves participant work-item, coverage, rollup, and Finance semantics with one batched Finance read", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw
      .mockResolvedValueOnce([
        pageRow({ id: "r-contract", sourceType: "CONTRACT", sourceId: "contract-a" }),
        pageRow({ id: "r-service", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" }),
        pageRow({ id: "r-manual", sourceType: "MANUAL", sourceId: null }),
      ])
      .mockResolvedValueOnce([
        enrichment("r-contract", { fulfilledPassengerCount: 1, fulfillmentCount: 2, confirmedFulfillmentCount: 1, purchaseCount: 2, evidenceCount: 3, coveredParticipantIds: ["participant-a"] }),
        enrichment("r-service", { coveredParticipantIds: [] }),
        enrichment("r-manual", { coveredParticipantIds: [] }),
      ]);
    c.finance.readMany.mockResolvedValue([
      { source: { sourceType: "CONTRACT", sourceId: "contract-a" }, eligibility: "ELIGIBLE", reason: "SETTLED" },
      { source: { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" },
    ]);

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20, active: "true", participantId: "participant-a" } as any)).resolves.toMatchObject({
      items: [
        { id: "r-contract", sourceType: "CONTRACT", sourceCategory: null, participantCoverageStatus: "FULFILLED", coverage: { fulfilledPassengerCount: 1, totalPassengerCount: 2 }, management: { fulfillmentCount: 2, confirmedFulfillmentCount: 1, purchaseCount: 2, evidenceCount: 3 }, finance: { state: "ELIGIBLE" } },
        { id: "r-service", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceCategory: "ADDITIONAL_SERVICES", participantCoverageStatus: "PENDING", finance: { state: "BLOCKED", reason: "OUTSTANDING_BALANCE" } },
        { id: "r-manual", sourceType: "MANUAL", sourceCategory: null, finance: { state: "UNAVAILABLE" } },
      ],
      total: 3,
    });
    expect(c.finance.readMany).toHaveBeenCalledTimes(1);
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [
      { sourceType: "CONTRACT", sourceId: "contract-a" },
      { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId },
    ] });
  });

  it("uses a bounded page/count query and one bounded enrichment query instead of per-item Operations reads", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ total: 1 })]).mockResolvedValueOnce([enrichment("requirement-a")]);

    await c.service.list(tenantId, travelPackageId, { page: 2, pageSize: 20, active: "true", participantId: "participant-a", passengerGroupId: "group-a", critical: "true", deadlineState: "OVERDUE" } as any);

    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(Object.keys(c.tx)).toEqual(["$executeRaw", "$queryRaw", "travelPackage"]);
  });

  it("pushes BASE_TRIP and ADDITIONAL_SERVICES source categories into the shared query before effective status pagination", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a", total: 1 })]).mockResolvedValueOnce([enrichment("requirement-a")]);

    await expect(c.service.list(tenantId, travelPackageId, { page: 2, pageSize: 20, sourceCategory: "BASE_TRIP", status: "PENDING", search: "Hotel", participantId: "participant-a", passengerGroupId: "group-a" } as any)).resolves.toMatchObject({
      items: [{ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceCategory: "BASE_TRIP", finance: { state: "AUTHORIZED_BY_SOURCE_POLICY", reason: "TRAVEL_PACKAGE_BASE_COMPONENT" } }],
    });

    const baseCall = c.tx.$queryRaw.mock.calls[0];
    expect(nestedSqlValues(baseCall)).toContain("TRAVEL_PACKAGE_COST_COMPONENT");
    expect(String(baseCall[0])).toContain("filtered AS MATERIALIZED");
    expect(String(baseCall[0])).toContain("OFFSET");

    c.tx.$queryRaw.mockClear();
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", total: 1 })]).mockResolvedValueOnce([enrichment("requirement-a")]);
    c.finance.readMany.mockResolvedValueOnce([{ source: { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }]);
    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20, sourceCategory: "ADDITIONAL_SERVICES", active: "true" } as any)).resolves.toMatchObject({
      items: [{ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceCategory: "ADDITIONAL_SERVICES", finance: { state: "BLOCKED", reason: "OUTSTANDING_BALANCE" } }],
    });
    expect(nestedSqlValues(c.tx.$queryRaw.mock.calls[0])).toContain("ADDITIONAL_SERVICE_ORDER_LINE");
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }] });
  });

  it("keeps ALL and omitted filters compatible with historical CONTRACT and MANUAL work", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ id: "contract", sourceType: "CONTRACT" }), pageRow({ id: "manual", sourceType: "MANUAL" })]).mockResolvedValueOnce([enrichment("contract"), enrichment("manual")]);

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20, sourceCategory: "ALL" } as any)).resolves.toMatchObject({
      items: [
        { id: "contract", sourceType: "CONTRACT", sourceCategory: null },
        { id: "manual", sourceType: "MANUAL", sourceCategory: null },
      ],
    });
  });

  it("reports base work as source-authorized without a Finance read", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a", total: 1 })]).mockResolvedValueOnce([enrichment("requirement-a")]);
    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 } as any)).resolves.toMatchObject({
      items: [{ finance: { state: "AUTHORIZED_BY_SOURCE_POLICY", reason: "TRAVEL_PACKAGE_BASE_COMPONENT" } }],
    });
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it("projects coverage-complete work as FULFILLED and filters it from active work before pagination", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([pageRow({ status: "FULFILLED", total: 1, totalPassengers: 1 })]).mockResolvedValueOnce([enrichment("requirement-a", { fulfilledPassengerCount: 1 })]);
    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20, status: "FULFILLED" } as any)).resolves.toMatchObject({ items: [{ status: "FULFILLED", coverage: { fulfilledPassengerCount: 1, totalPassengerCount: 1 } }] });
    const query = String(c.tx.$queryRaw.mock.calls[0][0]);
    expect(query).toContain("requirement_coverage AS MATERIALIZED");
    expect(query).toContain("WHEN COALESCE(coverage");
    expect(query).toContain("filtered AS MATERIALIZED");
  });

  it("keeps the tenant-scoped package validation before returning an empty page", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue({ id: travelPackageId });
    c.tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(c.service.list(tenantId, travelPackageId, { page: 1, pageSize: 20 } as any)).resolves.toMatchObject({ items: [], total: 0, totalPages: 0 });
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn(), travelPackage: { findFirst: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const finance = { readMany: jest.fn().mockResolvedValue([]) };
  return { tx, finance, service: new OperationalWorkItemsService(prisma as never, finance as never) };
}

function pageRow(overrides: Record<string, unknown>) {
  return {
    id: "requirement-a", travelPackageId, servicePurposeCode: "LODGING", servicePurposeName: "Hospedaje", description: "Hotel con desayuno", status: "PENDING", critical: false, operationalDeadlineAt: null,
    assignedToUserId: null, assignedToName: null, sourceType: "CONTRACT", sourceId: "contract-a", sourceLineId: null, sourceVersionId: null,
    sourcePassengerGroupId: null, sourcePassengerGroupName: null, soldValueScope: "EXACT_SERVICE_LINE", soldAmount: { toFixed: () => "1250.00" }, soldCurrency: "USD",
    createdAt: new Date(), updatedAt: new Date(), total: 3, totalPassengers: 2, ...overrides,
  };
}

function enrichment(id: string, overrides: Record<string, unknown> = {}) {
  return { id, fulfilledPassengerCount: 0, fulfillmentCount: 0, confirmedFulfillmentCount: 0, purchaseCount: 0, evidenceCount: 0, passengerPreview: [], coveredParticipantIds: [], ...overrides };
}

function nestedSqlValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(nestedSqlValues);
  if (value && typeof value === "object") {
    const values = (value as { values?: unknown }).values;
    if (Array.isArray(values)) return values.flatMap(nestedSqlValues);
    return [];
  }
  return [value];
}
