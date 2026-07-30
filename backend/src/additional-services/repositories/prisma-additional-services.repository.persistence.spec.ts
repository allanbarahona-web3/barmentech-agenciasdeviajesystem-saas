import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceCurrency,
  AdditionalServiceMarginType,
  AdditionalServiceTravelType,
} from "../enums";
import type { CreateAdditionalServiceOrderData } from "./additional-services.repository.interface";
import { PrismaAdditionalServicesRepository } from "./prisma-additional-services.repository";

describe("PrismaAdditionalServicesRepository quote customer persistence", () => {
  it("persists quoteCustomerId on the order without changing participant snapshots", async () => {
    const createOrder = jest.fn().mockResolvedValue({ id: "order-1" });
    const createLines = jest.fn().mockResolvedValue({ count: 1 });
    const createParticipants = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      additionalServiceOrder: {
        create: createOrder,
        findFirst: jest.fn().mockResolvedValue(null),
      },
      additionalServiceOrderLine: { createMany: createLines },
      additionalServiceOrderParticipant: {
        createMany: createParticipants,
      },
    };
    const repository = new PrismaAdditionalServicesRepository(
      prisma as unknown as PrismaService,
    );
    const data: CreateAdditionalServiceOrderData = {
      tenantId: "tenant-1",
      orderNumber: "ACME-AS-1",
      idempotencyKey: "workflow-1",
      quoteCustomerId: "quote-customer",
      travelPackageId: "travel-1",
      travelType: AdditionalServiceTravelType.INTERNATIONAL,
      quotationCurrency: AdditionalServiceCurrency.USD,
      commercialSubtotal: 100,
      totalVat: 13,
      totalSellingPrice: 113,
      createdByUserId: "user-1",
      createdByName: "Agent One",
      lines: [
        {
          additionalServiceCatalogId: "catalog-1",
          serviceCode: "TOUR",
          serviceName: "Tour",
          serviceDetailsVersion: 1,
          serviceDetails: {
            serviceDate: "2026-08-01",
            tourName: "City Tour",
          },
          supplierId: "supplier-1",
          supplierName: "Supplier",
          supplierCost: 80,
          supplierCostCurrency: AdditionalServiceCurrency.USD,
          quotationCurrency: AdditionalServiceCurrency.USD,
          supplierCostInQuotationCurrency: 80,
          exchangeRateId: null,
          exchangeRateDate: null,
          exchangeRateSource: null,
          exchangeRateBuyRate: null,
          exchangeRateSellRate: null,
          exchangeRateType: null,
          appliedExchangeRate: 1,
          marginType: AdditionalServiceMarginType.FIXED,
          marginValue: 20,
          marginAmount: 20,
          subtotal: 100,
          vatPercentage: 13,
          vatAmount: 13,
          finalSellingPrice: 113,
          participants: [
            {
              clientId: "service-recipient",
              role: "COMPANION",
              fullName: "Service Recipient",
              identification: "1-1111-1111",
              email: null,
              phone: null,
            },
          ],
        },
      ],
    };

    await expect(repository.create(data)).rejects.toThrow(
      "Persisted additional service order could not be read.",
    );

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteCustomerId: "quote-customer",
        }),
      }),
    );
    expect(createLines.mock.calls[0][0].data[0]).not.toHaveProperty(
      "quoteCustomerId",
    );
    expect(createParticipants).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          clientId: "service-recipient",
          lineId: expect.any(String),
        }),
      ],
    });
  });
});
