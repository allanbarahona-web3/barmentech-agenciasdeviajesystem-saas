import { PaymentPurpose, Prisma } from "@prisma/client";
import {
  ContractPaymentFiscalPreparationError,
  ContractPaymentFiscalPreparationService,
  CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS,
  contractPaymentFiscalizationKey,
} from "./contract-payment-fiscal-preparation.service";

describe("ContractPaymentFiscalPreparationService", () => {
  it.each([
    PaymentPurpose.CONTRACT_PAYMENT,
    PaymentPurpose.CONTRACT_RESERVATION,
    PaymentPurpose.CONTRACT_INSTALLMENT,
  ])("prepares an eligible %s payment as one generic fiscal draft", async (purpose) => {
    const context = createContext({ purpose });
    await context.service.prepareOrResume("tenant-a", "payment-a", "user-a");

    expect(context.billing.createOrResumeCrV44CalculatedDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "client-a",
        documentTypeCode: "01",
        paymentConditionCode: "01",
        creditTermDays: null,
        currencyCode: "CRC",
        fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
        source: {
          sourceType: "CONTRACT_PAYMENT",
          sourceId: "payment-a",
          sourceNumber: "RCP-1",
          sourceRole: "PRIMARY",
          creationDeduplicationKey: "contract-payment:fiscalization:payment-a:v1",
        },
      }),
    );
  });

  it("uses an InternalTrip fiscal classification when the Contract has no package", async () => {
    const context = createContext({ useInternalTrip: true });
    await context.service.prepareOrResume("tenant-a", "payment-a", "user-a");
    const command = context.billing.createOrResumeCrV44CalculatedDraft.mock.calls[0][0];
    expect(command.lines[0]).toMatchObject({ cabysCode: "1234567890123" });
    expect(command.lines[0].description).toContain("Aventura local");
    expect(context.travel.validate).toHaveBeenCalledWith(
      "tenant-a",
      "catalog-a",
      "INTERNAL_TRIP",
    );
  });

  it.each([
    [PaymentPurpose.GENERAL, "FULLY_ALLOCATED"],
    [PaymentPurpose.CONTRACT_PAYMENT, "PENDING_VERIFICATION"],
    [PaymentPurpose.CONTRACT_PAYMENT, "REJECTED"],
    [PaymentPurpose.CONTRACT_PAYMENT, "CANCELLED"],
  ])("rejects ineligible payment state %s/%s", async (purpose, status) => {
    const context = createContext({ purpose, status });
    await expect(context.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_NOT_ELIGIBLE,
      });
    expect(context.billing.createOrResumeCrV44CalculatedDraft).not.toHaveBeenCalled();
  });

  it("rejects a payment without a Contract", async () => {
    const context = createContext({ contract: null });
    await expect(context.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_NOT_ELIGIBLE,
      });
  });

  it("uses receiver normalization and rejects invalid identity", async () => {
    const context = createContext({ clientIdType: "PASAPORTE" });
    await expect(context.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.RECEIVER_INVALID,
      });
  });

  it("rejects missing or inactive travel classification", async () => {
    const missing = createContext({ missingClassification: true });
    await expect(missing.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING,
      });

    const inactive = createContext({ classificationError: "TRAVEL_FISCAL_CLASSIFICATION_INACTIVE" });
    await expect(inactive.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_INACTIVE,
      });
  });

  it("requires the calculator total to exactly equal the received amount", async () => {
    const context = createContext({ receivedAmount: "100" });
    await expect(context.service.prepareOrResume("tenant-a", "payment-a", "user-a"))
      .rejects.toMatchObject({
        code: CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CALCULATION_MISMATCH,
      });
    expect(context.billing.createOrResumeCrV44CalculatedDraft).not.toHaveBeenCalled();
  });

  it("has deterministic source idempotency and does not invoke provider or outbox services", async () => {
    const context = createContext();
    await context.service.prepareOrResume("tenant-a", "payment-a", "user-a");
    await context.service.prepareOrResume("tenant-a", "payment-a", "user-a");
    expect(contractPaymentFiscalizationKey("payment-a")).toBe(
      "contract-payment:fiscalization:payment-a:v1",
    );
    expect(context.billing.createOrResumeCrV44CalculatedDraft).toHaveBeenCalledTimes(2);
    expect((context.prisma as any).billingOutboxEvent).toBeUndefined();
    expect((context.prisma as any).accountReceivable).toBeUndefined();
  });
});

function createContext(options: {
  purpose?: PaymentPurpose;
  status?: string;
  receivedAmount?: string;
  contract?: object | null;
  useInternalTrip?: boolean;
  clientIdType?: string;
  missingClassification?: boolean;
  classificationError?: string;
} = {}) {
  const classification = options.missingClassification
    ? null
    : {
        id: "catalog-a",
        name: "Viajes",
        description: null,
        fiscalItemCategory: "SERVICE",
        isActive: true,
        fiscalProfile: {
          additionalServiceCatalogId: "catalog-a",
          cabysCode: "1234567890123",
          unitOfMeasureCode: "Sp",
          taxCode: "01",
          taxRateCode: "08",
          taxPercentage: new Prisma.Decimal("13"),
          isActive: true,
        },
      };
  const contract = options.contract === null ? null : options.contract ?? {
    id: "contract-a",
    tenantId: "tenant-a",
    contractNumber: "ALM-1",
    destination: "Roma",
    clientId: "client-a",
    client: {
      id: "client-a",
      fullName: "Cliente Uno",
      idType: options.clientIdType ?? "CEDULA_FISICA",
      idNumber: "109990999",
      email: "client@example.test",
    },
    travelPackage: options.useInternalTrip ? null : {
      id: "package-a",
      name: "Europa 2027",
      fiscalClassificationCatalogId: "catalog-a",
      fiscalClassificationCatalog: classification,
    },
    internalTrip: options.useInternalTrip ? {
      id: "trip-a",
      name: "Aventura local",
      fiscalClassificationCatalogId: "catalog-a",
      fiscalClassificationCatalog: classification,
    } : null,
  };
  const payment = {
    id: "payment-a",
    tenantId: "tenant-a",
    receiptNumber: "RCP-1",
    currencyCode: "CRC",
    receivedAmount: new Prisma.Decimal(options.receivedAmount ?? "113"),
    paymentMethod: "CASH",
    purpose: options.purpose ?? PaymentPurpose.CONTRACT_PAYMENT,
    status: options.status ?? "FULLY_ALLOCATED",
    contractId: contract ? "contract-a" : null,
    contract,
  };
  const prisma = {
    payment: { findFirst: jest.fn().mockResolvedValue(payment) },
    tenantBillingConfiguration: {
      findUnique: jest.fn().mockResolvedValue({
        billingEnabled: true,
        electronicIssuanceEnabled: true,
        countryCode: "CR",
        fiscalSchemaVersion: "4.4",
      }),
    },
    fiscalIssuer: {
      findMany: jest.fn().mockResolvedValue([{
        id: "issuer-a",
        legalName: "Issuer SA",
        identificationTypeCode: "02",
        identificationNumber: "3101678166",
        email: "issuer@example.test",
        phoneCountryCode: "506",
        phoneNumber: "22223333",
        provinceCode: "1",
        cantonCode: "01",
        districtCode: "01",
        neighborhoodCode: null,
        otherAddressDetails: "Address",
        establishmentCode: "001",
        terminalCode: "00001",
        economicActivities: [{ economicActivityCode: "791100" }],
      }]),
    },
  };
  const travel = {
    validate: jest.fn().mockImplementation(async () => {
      if (options.classificationError) throw new Error(options.classificationError);
      return "catalog-a";
    }),
  };
  const catalog = {
    evaluateFiscalProfiles: jest.fn().mockResolvedValue(new Map([["catalog-a", { isReady: true }]])),
  };
  const billing = {
    createOrResumeCrV44CalculatedDraft: jest.fn().mockResolvedValue({ id: "billing-a" }),
  };
  return {
    prisma,
    travel,
    billing,
    service: new ContractPaymentFiscalPreparationService(
      prisma as any,
      travel as any,
      catalog as any,
      billing as any,
    ),
  };
}
