import { Prisma } from "@prisma/client";
import { PrismaBillingDocumentRepository } from "./prisma-billing-document.repository";
import { buildRequestIdentity, buildResponseHash } from "../official-exchange-rates/official-exchange-rate.resolver";

describe("PrismaBillingDocumentRepository fiscal allocation", () => {
  it("allocates with a locked tenant document, one atomic increment, and one safe outbox event", async () => {
    const { repository, tx, prisma } = setupNewAllocation();

    const result = await repository.requestElectronicIssuance(
      "tenant-a",
      "document-a",
      "user-a",
      crcPreparation(),
    );

    expect(result).toEqual({
      billingDocumentId: "document-a",
      sequenceId: "sequence-a",
      allocatedSequenceNumber: "225",
      providerBase: "0000000225",
      fiscalNumber: "00100001010000000225",
      issuanceIdempotencyKey:
        "billing-document:document-a:electronic-issuance:v1",
      outboxEventId: "outbox-document-a",
      outboxDeduplicationKey:
        "billing-document:document-a:electronic-issuance-requested:v1",
      lifecycleStatus: "CONFIRMED",
      providerStatus: "PENDING",
      newlyAllocated: true,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 15000 },
    );
    expect(rawSql(tx.$queryRaw, 0)).toContain("FOR UPDATE");
    expect(rawSql(tx.$queryRaw, 0)).toContain('"tenantId"');
    expect(rawSql(tx.$queryRaw, 1)).toContain(
      'SET "nextSequenceNumber" = "nextSequenceNumber" + 1',
    );
    expect(rawSql(tx.$queryRaw, 1)).toContain(
      '"nextSequenceNumber" BETWEEN 1 AND 9999999999',
    );
    expect(rawSql(tx.$queryRaw, 1)).toContain(
      'RETURNING "id", "nextSequenceNumber" - 1',
    );
    expect(tx.billingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_tenantId: { id: "document-a", tenantId: "tenant-a" } },
        data: expect.objectContaining({
          fiscalEmissionAt: new Date("2026-08-22T05:59:59.123Z"),
          fiscalIssueDate: new Date("2026-08-21T00:00:00.000Z"),
          exchangeRate: null,
          officialExchangeRateObservationId: null,
          fiscalExchangeRateEffectiveDate: null,
          fiscalExchangeRateSourceAuthority: null,
          fiscalExchangeRateIndicatorCode: null,
          billingDocumentNumberSequenceId: "sequence-a",
          allocatedSequenceNumber: 225n,
          fiscalNumber: "00100001010000000225",
          lifecycleStatus: "CONFIRMED",
          providerStatus: "PENDING",
          providerDocumentId: null,
          haciendaKey: null,
          taxAuthorityStatus: "NOT_SUBMITTED",
          issuedAt: null,
        }),
      }),
    );
    expect(tx.billingOutboxEvent.createMany).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-a",
        eventType: "billing-document.electronic-issuance-requested",
        eventVersion: 1,
        aggregateType: "BillingDocument",
        aggregateId: "document-a",
        deduplicationKey:
          "billing-document:document-a:electronic-issuance-requested:v1",
        payload: {
          tenantId: "tenant-a",
          billingDocumentId: "document-a",
          eventVersion: 1,
        },
        status: "PENDING",
      },
      skipDuplicates: true,
    });
    expect(
      tx.billingOutboxEvent.createMany.mock.calls[0][0].data,
    ).not.toHaveProperty("causationId");
  });

  it("returns an existing allocation and outbox without incrementing or writing", async () => {
    const document = readyDocument({
      lifecycleStatus: "CONFIRMED",
      providerStatus: "PENDING",
      billingDocumentNumberSequenceId: "sequence-a",
      allocatedSequenceNumber: 225n,
      fiscalNumber: "00100001010000000225",
      fiscalEmissionAt: new Date("2026-08-22T05:59:59.123Z"),
      fiscalIssueDate: new Date("2026-08-21T00:00:00.000Z"),
      issuanceIdempotencyKey:
        "billing-document:document-a:electronic-issuance:v1",
    });
    const { repository, tx } = setupExistingAllocation(document);

    const result = await repository.requestElectronicIssuance(
      "tenant-a",
      "document-a",
      "retrying-user",
      null,
    );

    expect(result.newlyAllocated).toBe(false);
    expect(result.allocatedSequenceNumber).toBe("225");
    expect(result.outboxEventId).toBe("outbox-a");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.officialExchangeRateObservation.findUnique).not.toHaveBeenCalled();
    expect(tx.billingDocument.update).not.toHaveBeenCalled();
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("authoritatively verifies a complete USD snapshot before returning it idempotently", async () => {
    const { repository, tx } = setupExistingAllocation(existingUsdDocument());
    tx.officialExchangeRateObservation.findUnique.mockResolvedValue(
      officialObservationRow(),
    );

    const result = await repository.requestElectronicIssuance(
      "tenant-a",
      "document-a",
      "retrying-user",
      null,
    );

    expect(result).toMatchObject({
      billingDocumentId: "document-a",
      sequenceId: "sequence-a",
      allocatedSequenceNumber: "225",
      fiscalNumber: "00100001010000000225",
      outboxEventId: "outbox-a",
      newlyAllocated: false,
    });
    expect(tx.officialExchangeRateObservation.findUnique).toHaveBeenCalledWith({
      where: { id: "observation-a" },
      select: expect.objectContaining({
        requestIdentity: true,
        responseHash: true,
        value: true,
      }),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
    expect(tx.billingDocument.update).not.toHaveBeenCalled();
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["missing observation", null],
    ["wrong country", { countryCode: "PA" }],
    ["wrong foreign currency", { foreignCurrencyCode: "EUR" }],
    ["wrong local currency", { localCurrencyCode: "USD" }],
    ["wrong rate type", { rateType: "REFERENCE_BUY" }],
    ["wrong effective date", { effectiveDate: new Date("2026-08-21T00:00:00.000Z") }],
    ["wrong authority", { sourceAuthority: "OTHER" }],
    ["wrong indicator", { sourceIndicatorCode: "317" }],
    ["different exact decimal", { value: new Prisma.Decimal("454.340000000002") }],
    ["wrong request identity", { requestIdentity: "wrong-identity" }],
    ["invalid response hash", { responseHash: "0".repeat(64) }],
  ] as const)("rejects an existing USD allocation with %s before any write", async (_label, override) => {
    const { repository, tx } = setupExistingAllocation(existingUsdDocument());
    tx.officialExchangeRateObservation.findUnique.mockResolvedValue(
      override === null ? null : { ...officialObservationRow(), ...override },
    );

    await expectCode(
      repository.requestElectronicIssuance(
        "tenant-a",
        "document-a",
        "retrying-user",
        null,
      ),
      "BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH",
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.billingDocumentNumberSequence.findFirst).not.toHaveBeenCalled();
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
    expect(tx.billingDocument.update).not.toHaveBeenCalled();
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("serializes same-document outcomes as one new allocation and one existing result", async () => {
    const first = setupNewAllocation();
    const existingDocument = readyDocument({
      lifecycleStatus: "CONFIRMED",
      providerStatus: "PENDING",
      billingDocumentNumberSequenceId: "sequence-a",
      allocatedSequenceNumber: 225n,
      fiscalNumber: "00100001010000000225",
      fiscalEmissionAt: new Date("2026-08-22T05:59:59.123Z"),
      fiscalIssueDate: new Date("2026-08-21T00:00:00.000Z"),
      issuanceIdempotencyKey:
        "billing-document:document-a:electronic-issuance:v1",
    });
    const second = setupExistingAllocation(existingDocument);
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((work) => work(first.tx))
        .mockImplementationOnce((work) => work(second.tx)),
    };
    const repository = new PrismaBillingDocumentRepository(prisma as never);

    const [allocated, retried] = await Promise.all([
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-b", null),
    ]);

    expect(allocated.newlyAllocated).toBe(true);
    expect(retried.newlyAllocated).toBe(false);
    expect(allocated.fiscalNumber).toBe(retried.fiscalNumber);
    expect(first.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(second.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns distinct numbers for two documents sharing one sequence", async () => {
    const first = setupNewAllocation({ documentId: "document-a", allocated: 225n });
    const second = setupNewAllocation({ documentId: "document-b", allocated: 226n });

    const [a, b] = await Promise.all([
      first.repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      second.repository.requestElectronicIssuance("tenant-a", "document-b", "user-b", crcPreparation()),
    ]);

    expect(a.sequenceId).toBe("sequence-a");
    expect(b.sequenceId).toBe("sequence-a");
    expect(a.allocatedSequenceNumber).toBe("225");
    expect(b.allocatedSequenceNumber).toBe("226");
    expect(a.fiscalNumber).not.toBe(b.fiscalNumber);
  });

  it("uses independent scope identities for documents on different sequences", async () => {
    const first = setupNewAllocation({ documentId: "document-a", sequenceId: "sequence-a" });
    const second = setupNewAllocation({
      documentId: "document-b",
      sequenceId: "sequence-b",
      documentTypeCode: "04",
      document: { paymentConditionCode: "01", creditTermDays: null },
    });

    const [a, b] = await Promise.all([
      first.repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      second.repository.requestElectronicIssuance("tenant-a", "document-b", "user-b", crcPreparation()),
    ]);

    expect(a.sequenceId).toBe("sequence-a");
    expect(b.sequenceId).toBe("sequence-b");
    expect(a.fiscalNumber.slice(8, 10)).toBe("01");
    expect(b.fiscalNumber.slice(8, 10)).toBe("04");
  });

  it("rejects partial allocation state before sequence access", async () => {
    const { repository, tx } = setupNewAllocation({
      document: { allocatedSequenceNumber: 225n },
    });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", null),
      "BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT",
    );
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("does not advance a sequence when final readiness fails", async () => {
    const { repository, tx } = setupNewAllocation({
      document: { issuerEconomicActivityCode: null },
    });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      "BILLING_DOCUMENT_FISCAL_READINESS_FAILED",
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("verifies and atomically persists the exact USD official observation", async () => {
    const { repository, tx } = setupNewAllocation({
      document: { currencyCode: "USD" },
    });
    tx.officialExchangeRateObservation.findUnique.mockResolvedValue(
      officialObservationRow(),
    );

    await repository.requestElectronicIssuance(
      "tenant-a",
      "document-a",
      "user-a",
      usdPreparation(),
    );

    expect(tx.officialExchangeRateObservation.findUnique).toHaveBeenCalledWith({
      where: { id: "observation-a" },
      select: expect.objectContaining({
        requestIdentity: true,
        responseHash: true,
        value: true,
      }),
    });
    expect(tx.billingDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fiscalEmissionAt: new Date("2026-08-22T06:00:00.456Z"),
          fiscalIssueDate: new Date("2026-08-22T00:00:00.000Z"),
          exchangeRate: new Prisma.Decimal("454.340000000001"),
          officialExchangeRateObservationId: "observation-a",
          fiscalExchangeRateEffectiveDate: new Date("2026-08-22T00:00:00.000Z"),
          fiscalExchangeRateSourceAuthority: "BCCR",
          fiscalExchangeRateIndicatorCode: "318",
          issuedAt: null,
        }),
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects observation or locked-currency mismatch before sequence access", async () => {
    const observationMismatch = setupNewAllocation({ document: { currencyCode: "USD" } });
    observationMismatch.tx.officialExchangeRateObservation.findUnique.mockResolvedValue({
      ...officialObservationRow(),
      value: new Prisma.Decimal("455.00"),
    });
    await expectCode(
      observationMismatch.repository.requestElectronicIssuance(
        "tenant-a", "document-a", "user-a", usdPreparation(),
      ),
      "BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH",
    );
    expect(observationMismatch.tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
    expect(observationMismatch.tx.$queryRaw).toHaveBeenCalledTimes(1);

    const currencyMismatch = setupNewAllocation();
    await expectCode(
      currencyMismatch.repository.requestElectronicIssuance(
        "tenant-a", "document-a", "user-a", usdPreparation(),
      ),
      "BILLING_DOCUMENT_FISCAL_EMISSION_CONFLICT",
    );
    expect(currencyMismatch.tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
  });

  it.each(["02", "08", "09", "10"])(
    "rejects unsupported draft document type %s before sequence access",
    async (documentTypeCode) => {
      const { repository, tx } = setupNewAllocation({ documentTypeCode });

      await expectCode(
        repository.requestElectronicIssuance(
          "tenant-a",
          "document-a",
          "user-a",
          crcPreparation(),
        ),
        "BILLING_DOCUMENT_FISCAL_READINESS_FAILED",
      );

      expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.billingDocument.update).not.toHaveBeenCalled();
      expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
    },
  );

  it("keeps P2002 document-allocation conflicts terminal after increment", async () => {
    const { repository, tx } = setupNewAllocation();
    tx.billingDocument.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique constraint", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );

    const error = await capture(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
    );
    expect(error.getResponse()).toMatchObject({
      code: "BILLING_DOCUMENT_CONCURRENT_ALLOCATION_CONFLICT",
    });
    expect(error.getStatus()).toBe(409);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("maps P2028 during sequence increment to a retryable allocation timeout", async () => {
    const { repository, tx } = setupNewAllocation();
    tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ id: "document-a" }])
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Transaction already closed", {
          code: "P2028",
          clientVersion: "5.22.0",
        }),
      );

    const error = await capture(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
    );

    expect(error.getResponse()).toMatchObject({
      code: "BILLING_DOCUMENT_ALLOCATION_TRANSACTION_TIMEOUT",
    });
    expect(error.getStatus()).toBe(503);
    expect(tx.billingDocument.update).not.toHaveBeenCalled();
    expect(tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("resumes the same draft after a P2028 rollback and allocates it once", async () => {
    const timedOut = setupNewAllocation();
    timedOut.tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([{ id: "document-a" }])
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Transaction already closed", {
          code: "P2028",
          clientVersion: "5.22.0",
        }),
      );
    const recovered = setupNewAllocation();
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((work) => work(timedOut.tx))
        .mockImplementationOnce((work) => work(recovered.tx)),
    };
    const repository = new PrismaBillingDocumentRepository(prisma as never);

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      "BILLING_DOCUMENT_ALLOCATION_TRANSACTION_TIMEOUT",
    );
    const result = await repository.requestElectronicIssuance(
      "tenant-a",
      "document-a",
      "user-a",
      crcPreparation(),
    );

    expect(result.newlyAllocated).toBe(true);
    expect(recovered.tx.billingDocument.update).toHaveBeenCalledTimes(1);
    expect(recovered.tx.billingOutboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("classifies outbox uniqueness failure and aborts the containing transaction", async () => {
    const { repository, tx } = setupNewAllocation();
    tx.billingOutboxEvent.createMany.mockResolvedValue({ count: 0 });
    tx.billingOutboxEvent.findUnique.mockResolvedValue({ id: "conflicting-outbox" });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "document-a", "user-a", crcPreparation()),
      "BILLING_DOCUMENT_OUTBOX_CONFLICT",
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.billingDocument.update).toHaveBeenCalledTimes(1);
  });

  it("accepts a reason-02 monetary partial credit when synthetic quantity matches the original", async () => {
    const { repository, tx } = setupCreditNoteAllocation({
      creditLine: creditLine({ grossAmount: "44.24779", taxAmount: "5.75221", lineTotal: "50" }),
      reasonCode: "02",
    });

    await expect(repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", crcPreparation())).resolves.toMatchObject({
      billingDocumentId: "credit-a",
      newlyAllocated: true,
    });
    expect(tx.billingDocumentNumberSequence.findUnique).toHaveBeenCalledTimes(1);
  });

  it("accepts a true full monetary reproduction only with reason 01", async () => {
    const { repository } = setupCreditNoteAllocation({
      creditLine: creditLine({ grossAmount: "442.47788", taxAmount: "57.52212", lineTotal: "500" }),
      reasonCode: "01",
    });

    await expect(repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", crcPreparation())).resolves.toMatchObject({
      billingDocumentId: "credit-a",
      newlyAllocated: true,
    });
  });

  it.each([
    ["01", creditLine({ grossAmount: "44.24779", taxAmount: "5.75221", lineTotal: "50" })],
    ["02", creditLine({ grossAmount: "442.47788", taxAmount: "57.52212", lineTotal: "500" })],
  ] as const)("rejects reason %s when persisted monetary equivalence does not match its full state", async (reasonCode, line) => {
    const { repository, tx } = setupCreditNoteAllocation({ creditLine: line, reasonCode });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", crcPreparation()),
      "BILLING_CREDIT_NOTE_INPUT_INVALID",
    );
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
  });

  it("enforces accepted monetary final-total capacity for a type-03 draft", async () => {
    const { repository, tx } = setupCreditNoteAllocation({
      creditLine: creditLine({ grossAmount: "44.24779", taxAmount: "5.75221", lineTotal: "50" }),
      reasonCode: "02",
      acceptedLines: [{
        sourceBillingDocumentLineId: "source-line-a",
        quantity: d("1"),
        unitPrice: d("398.23009"),
        grossAmount: d("398.23009"),
        lineTotal: d("450.00001"),
      }],
    });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", crcPreparation()),
      "BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED",
    );
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
  });

  it("does not treat an accepted synthetic monetary quantity as quantity capacity", async () => {
    const { repository } = setupCreditNoteAllocation({
      creditLine: creditLine({ quantity: "0.5", unitPrice: "442.47788", grossAmount: "221.23894", taxAmount: "28.76106", lineTotal: "250" }),
      reasonCode: "02",
      acceptedLines: [{
        sourceBillingDocumentLineId: "source-line-a",
        quantity: d("1"),
        unitPrice: d("44.24779"),
        grossAmount: d("44.24779"),
        lineTotal: d("50"),
      }],
    });

    await expect(repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", crcPreparation())).resolves.toMatchObject({
      billingDocumentId: "credit-a",
      newlyAllocated: true,
    });
  });

  it("accepts a type-03 USD preparation with the original's historical frozen FX date", async () => {
    const { repository, tx } = setupCreditNoteAllocation({
      creditLine: creditLine({ grossAmount: "44.24779", taxAmount: "5.75221", lineTotal: "50" }),
      reasonCode: "02",
      inheritedUsdSnapshot: true,
    });

    await expect(repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", inheritedUsdPreparation())).resolves.toMatchObject({
      billingDocumentId: "credit-a",
      newlyAllocated: true,
    });
    expect(tx.billingDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        exchangeRate: d("526.340000000001"),
        officialExchangeRateObservationId: "original-observation",
        fiscalExchangeRateEffectiveDate: new Date("2026-08-21T00:00:00.000Z"),
      }),
    }));
  });

  it("rejects a type-03 USD FX snapshot that differs from its accepted original", async () => {
    const { repository, tx } = setupCreditNoteAllocation({
      creditLine: creditLine({ grossAmount: "44.24779", taxAmount: "5.75221", lineTotal: "50" }),
      reasonCode: "02",
      inheritedUsdSnapshot: true,
      mismatchedUsdSnapshot: true,
    });

    await expectCode(
      repository.requestElectronicIssuance("tenant-a", "credit-a", "user-a", inheritedUsdPreparation()),
      "BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH",
    );
    expect(tx.billingDocumentNumberSequence.findUnique).not.toHaveBeenCalled();
  });
});

function setupNewAllocation(options: {
  documentId?: string;
  sequenceId?: string;
  documentTypeCode?: string;
  allocated?: bigint;
  document?: Record<string, unknown>;
} = {}) {
  const documentId = options.documentId ?? "document-a";
  const sequenceId = options.sequenceId ?? "sequence-a";
  const allocated = options.allocated ?? 225n;
  const document = readyDocument({
    id: documentId,
    documentTypeCode: options.documentTypeCode ?? "01",
    ...options.document,
  });
  const tx = transactionMock();
  tx.$queryRaw
    .mockResolvedValueOnce([{ id: documentId }])
    .mockResolvedValueOnce([{ id: sequenceId, allocatedSequenceNumber: allocated }]);
  tx.billingDocument.findUnique.mockResolvedValue(document);
  tx.tenantBillingConfiguration.findUnique.mockResolvedValue({
    billingEnabled: true,
    electronicIssuanceEnabled: true,
    countryCode: "CR",
    fiscalSchemaVersion: "4.4",
  });
  tx.fiscalIssuer.findFirst.mockResolvedValue({
    isActive: true,
    countryCode: "CR",
    establishmentCode: "001",
    terminalCode: "00001",
  });
  tx.fiscalIssuerEconomicActivity.findFirst.mockResolvedValue({ id: "activity-a" });
  tx.billingDocumentNumberSequence.findUnique.mockResolvedValue({
    id: sequenceId,
    nextSequenceNumber: allocated,
  });
  tx.billingDocument.update.mockResolvedValue({
    lifecycleStatus: "CONFIRMED",
    providerStatus: "PENDING",
  });
  tx.billingOutboxEvent.createMany.mockResolvedValue({ count: 1 });
  tx.billingOutboxEvent.findUnique.mockResolvedValue({ id: `outbox-${documentId}` });
  const prisma = { $transaction: jest.fn((work) => work(tx)) };
  return {
    tx,
    prisma,
    repository: new PrismaBillingDocumentRepository(prisma as never),
  };
}

function setupExistingAllocation(document: ReturnType<typeof readyDocument>) {
  const tx = transactionMock();
  tx.$queryRaw.mockResolvedValue([{ id: document.id }]);
  tx.billingDocument.findUnique.mockResolvedValue(document);
  tx.billingDocumentNumberSequence.findFirst.mockResolvedValue({ id: "sequence-a" });
  tx.billingOutboxEvent.findUnique.mockResolvedValue({
    id: "outbox-a",
    eventType: "billing-document.electronic-issuance-requested",
    aggregateType: "BillingDocument",
    aggregateId: document.id,
  });
  const prisma = { $transaction: jest.fn((work) => work(tx)) };
  return {
    tx,
    repository: new PrismaBillingDocumentRepository(prisma as never),
  };
}

function setupCreditNoteAllocation(input: {
  creditLine: ReturnType<typeof creditLine>;
  reasonCode: "01" | "02";
  acceptedLines?: Array<{
    sourceBillingDocumentLineId: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    grossAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
  inheritedUsdSnapshot?: boolean;
  mismatchedUsdSnapshot?: boolean;
}) {
  const original = originalCreditSource();
  const credit = creditNoteDraft(input.creditLine, input.reasonCode, original);
  if (input.inheritedUsdSnapshot) {
    const snapshot = {
      currencyCode: "USD",
      exchangeRate: d("526.340000000001"),
      officialExchangeRateObservationId: "original-observation",
      fiscalExchangeRateEffectiveDate: new Date("2026-08-21T00:00:00.000Z"),
      fiscalExchangeRateSourceAuthority: "BCCR",
      fiscalExchangeRateIndicatorCode: "318",
    };
    Object.assign(original, snapshot);
    Object.assign(credit, input.mismatchedUsdSnapshot
      ? { ...snapshot, exchangeRate: d("527.000000000000") }
      : snapshot);
  }
  const context = setupNewAllocation({
    documentId: "credit-a",
    documentTypeCode: "03",
    document: credit,
  });
  context.tx.billingDocument.findUnique
    .mockResolvedValueOnce(credit)
    .mockResolvedValueOnce(original);
  context.tx.$queryRaw.mockReset()
    .mockResolvedValueOnce([{ id: "credit-a" }])
    .mockResolvedValueOnce([{ referenceEmissionAt: original.fiscalEmissionAt }])
    .mockResolvedValueOnce([{ id: original.id }])
    .mockResolvedValueOnce([{
      sourceBillingDocumentLineId: "source-line-a",
      quantity: input.creditLine.quantity,
      unitPrice: input.creditLine.unitPrice,
      grossAmount: input.creditLine.grossAmount,
      lineTotal: input.creditLine.lineTotal,
    }])
    .mockResolvedValueOnce(input.acceptedLines ?? [])
    .mockResolvedValueOnce([{ id: "sequence-a", allocatedSequenceNumber: 225n }]);
  if (input.inheritedUsdSnapshot) {
    context.tx.officialExchangeRateObservation.findUnique.mockResolvedValue(
      inheritedUsdObservationRow(),
    );
  }
  return context;
}

function transactionMock() {
  return {
    $queryRaw: jest.fn(),
    billingDocument: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    billingDocumentNumberSequence: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    tenantBillingConfiguration: { findUnique: jest.fn() },
    fiscalIssuer: { findFirst: jest.fn() },
    fiscalIssuerEconomicActivity: { findFirst: jest.fn() },
    officialExchangeRateObservation: { findUnique: jest.fn() },
    billingOutboxEvent: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

function readyDocument(overrides: Record<string, unknown> = {}) {
  const decimal = (value: string) => new Prisma.Decimal(value);
  return {
    id: "document-a",
    tenantId: "tenant-a",
    billingMode: "ELECTRONIC_PROVIDER",
    fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    lifecycleStatus: "DRAFT",
    providerStatus: "NOT_SUBMITTED",
    taxAuthorityStatus: "NOT_SUBMITTED",
    billingDocumentNumberSequenceId: null,
    allocatedSequenceNumber: null,
    issuanceIdempotencyKey: null,
    providerDocumentId: null,
    fiscalNumber: null,
    fiscalIssuerId: "issuer-a",
    issuerIdentificationType: "02",
    issuerIdentification: "3101000000",
    issuerEstablishmentCode: "001",
    issuerTerminalCode: "00001",
    issuerEconomicActivityCode: "791100",
    documentTypeCode: "01",
    countryCode: "CR",
    schemaVersion: "4.4",
    currencyCode: "CRC",
    exchangeRate: null,
    fiscalEmissionAt: null,
    fiscalIssueDate: null,
    officialExchangeRateObservationId: null,
    fiscalExchangeRateEffectiveDate: null,
    fiscalExchangeRateSourceAuthority: null,
    fiscalExchangeRateIndicatorCode: null,
    receiverName: "Customer",
    receiverIdentificationType: "01",
    receiverIdentification: "101110111",
    grossSubtotal: decimal("100"),
    discountTotal: decimal("0"),
    taxableTotal: decimal("100"),
    exemptTotal: decimal("0"),
    exoneratedTotal: decimal("0"),
    grossTaxTotal: decimal("13"),
    exoneratedTaxTotal: decimal("0"),
    netTaxTotal: decimal("13"),
    total: decimal("113"),
    lines: [
      {
        lineNumber: 1,
        description: "Service",
        unitOfMeasureCode: "Sp",
        quantity: decimal("1"),
        unitPrice: decimal("100"),
        grossAmount: decimal("100"),
        discountAmount: decimal("0"),
        discountCode: null,
        discountReason: null,
        taxableBase: decimal("100"),
        taxAmount: decimal("13"),
        exoneratedTaxAmount: decimal("0"),
        netTaxAmount: decimal("13"),
        lineSubtotal: decimal("100"),
        lineTotal: decimal("113"),
        taxes: [
          {
            taxOrder: 1,
            taxCode: "01",
            rateCode: "08",
            ratePercentage: decimal("13"),
            taxableBase: decimal("100"),
            taxAmount: decimal("13"),
            calculationFactor: null,
            netTaxAmount: decimal("13"),
            exemption: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function d(value: string) {
  return new Prisma.Decimal(value);
}

function creditLine(input: {
  quantity?: string;
  unitPrice?: string;
  grossAmount: string;
  taxAmount: string;
  lineTotal: string;
}) {
  const quantity = d(input.quantity ?? "1");
  const grossAmount = d(input.grossAmount);
  const taxAmount = d(input.taxAmount);
  return {
    id: "credit-line-a",
    lineNumber: 1,
    description: "Servicio original",
    unitOfMeasureCode: "Sp",
    quantity,
    unitPrice: d(input.unitPrice ?? input.grossAmount),
    grossAmount,
    discountAmount: d("0"),
    discountCode: null,
    discountReason: null,
    taxableBase: grossAmount,
    taxAmount,
    exoneratedTaxAmount: d("0"),
    netTaxAmount: taxAmount,
    lineSubtotal: grossAmount,
    lineTotal: d(input.lineTotal),
    taxes: [{
      taxOrder: 1,
      taxCode: "01",
      rateCode: "08",
      ratePercentage: d("13"),
      taxableBase: grossAmount,
      taxAmount,
      calculationFactor: null,
      netTaxAmount: taxAmount,
      exemption: null,
    }],
  };
}

function originalCreditSource() {
  const fiscalIssueDate = new Date("2026-08-21T00:00:00.000Z");
  const fiscalEmissionAt = new Date("2026-08-21T12:00:00.000Z");
  return {
    id: "original-a",
    tenantId: "tenant-a",
    documentTypeCode: "01",
    currencyCode: "CRC",
    taxAuthorityStatus: "ACCEPTED",
    haciendaKey: "5".repeat(50),
    fiscalNumber: "00100001010000000042",
    fiscalIssueDate,
    fiscalEmissionAt,
    exchangeRate: null,
    officialExchangeRateObservationId: null,
    fiscalExchangeRateEffectiveDate: null,
    fiscalExchangeRateSourceAuthority: null,
    fiscalExchangeRateIndicatorCode: null,
    lines: [{
      id: "source-line-a",
      quantity: d("1"),
      unitPrice: d("442.47788"),
      grossAmount: d("442.47788"),
      lineTotal: d("500"),
    }],
  };
}

function creditNoteDraft(
  line: ReturnType<typeof creditLine>,
  reasonCode: "01" | "02",
  original: ReturnType<typeof originalCreditSource>,
) {
  return readyDocument({
    id: "credit-a",
    documentTypeCode: "03",
    grossSubtotal: line.grossAmount,
    discountTotal: d("0"),
    taxableTotal: line.taxableBase,
    exemptTotal: d("0"),
    exoneratedTotal: d("0"),
    grossTaxTotal: line.taxAmount,
    exoneratedTaxTotal: d("0"),
    netTaxTotal: line.netTaxAmount,
    total: line.lineTotal,
    lines: [line],
    references: [{
      id: "reference-a",
      referencedDocumentTypeCode: "01",
      referencedBillingDocumentId: original.id,
      externalDocumentKey: original.haciendaKey,
      externalDocumentNumber: original.fiscalNumber,
      reasonCode,
      reasonDescription: "Corrección parcial",
      referenceDate: original.fiscalIssueDate,
    }],
  });
}

function rawSql(mock: jest.Mock, call: number) {
  return (mock.mock.calls[call][0] as TemplateStringsArray).join("?");
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

async function capture(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}

function crcPreparation() {
  return {
    expectedCurrencyCode: "CRC" as const,
    fiscalEmissionAt: new Date("2026-08-22T05:59:59.123Z"),
    fiscalIssueDate: "2026-08-21",
    officialRate: null,
  };
}

function usdPreparation() {
  return {
    expectedCurrencyCode: "USD" as const,
    fiscalEmissionAt: new Date("2026-08-22T06:00:00.456Z"),
    fiscalIssueDate: "2026-08-22",
    officialRate: {
      observationId: "observation-a",
      value: "454.340000000001",
      effectiveDate: "2026-08-22",
      sourceAuthority: "BCCR",
      sourceIndicatorCode: "318",
    },
  };
}

function inheritedUsdPreparation() {
  return {
    expectedCurrencyCode: "USD" as const,
    fiscalEmissionAt: new Date("2026-08-22T06:00:00.456Z"),
    fiscalIssueDate: "2026-08-22",
    officialRate: {
      observationId: "original-observation",
      value: "526.340000000001",
      effectiveDate: "2026-08-21",
      sourceAuthority: "BCCR",
      sourceIndicatorCode: "318",
      inheritedFromReference: true as const,
    },
  };
}

function inheritedUsdObservationRow() {
  const identity = {
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL" as const,
    effectiveDate: "2026-08-21",
    sourceAuthority: "BCCR",
    sourceIndicatorCode: "318",
  };
  return {
    id: "original-observation",
    ...identity,
    effectiveDate: new Date("2026-08-21T00:00:00.000Z"),
    value: d("526.340000000001"),
    requestIdentity: buildRequestIdentity(identity),
    responseHash: buildResponseHash(identity, "526.340000000001"),
  };
}

function officialObservationRow() {
  const identity = {
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL" as const,
    effectiveDate: "2026-08-22",
    sourceAuthority: "BCCR",
    sourceIndicatorCode: "318",
  };
  return {
    id: "observation-a",
    ...identity,
    effectiveDate: new Date("2026-08-22T00:00:00.000Z"),
    value: new Prisma.Decimal("454.340000000001"),
    requestIdentity: buildRequestIdentity(identity),
    responseHash: buildResponseHash(identity, "454.340000000001"),
  };
}

function existingUsdDocument() {
  return readyDocument({
    lifecycleStatus: "CONFIRMED",
    providerStatus: "PENDING",
    currencyCode: "USD",
    billingDocumentNumberSequenceId: "sequence-a",
    allocatedSequenceNumber: 225n,
    fiscalNumber: "00100001010000000225",
    issuanceIdempotencyKey:
      "billing-document:document-a:electronic-issuance:v1",
    fiscalEmissionAt: new Date("2026-08-22T06:00:00.456Z"),
    fiscalIssueDate: new Date("2026-08-22T00:00:00.000Z"),
    exchangeRate: new Prisma.Decimal("454.340000000001"),
    officialExchangeRateObservationId: "observation-a",
    fiscalExchangeRateEffectiveDate: new Date("2026-08-22T00:00:00.000Z"),
    fiscalExchangeRateSourceAuthority: "BCCR",
    fiscalExchangeRateIndicatorCode: "318",
  });
}
