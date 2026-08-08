import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceCurrency,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
  CommercialProposalStatus,
} from "../enums";
import { PrismaAdditionalServicesRepository } from "./prisma-additional-services.repository";

describe("PrismaAdditionalServicesRepository dashboard", () => {
  it("uses quoteCustomer in one minimal tenant-scoped page query", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "order-1",
        orderNumber: "ACME-AS-2",
        quoteCustomer: { fullName: "Paying Companion" },
        travelPackageId: "travel-1",
        internalBookingId: null,
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        quotationCurrency: AdditionalServiceCurrency.USD,
        totalSellingPrice: "150.0000",
        status: AdditionalServiceOrderStatus.DRAFT,
        commercialStatus: CommercialProposalStatus.APPROVED,
        createdAt: new Date("2026-07-30T12:00:00.000Z"),
        travelPackage: { id: "travel-1", name: "Miami" },
        internalBooking: null,
      },
      {
        id: "order-2",
        orderNumber: "ACME-AS-1",
        quoteCustomer: { fullName: "Different Customer" },
        travelPackageId: "travel-1",
        internalBookingId: null,
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        quotationCurrency: AdditionalServiceCurrency.CRC,
        totalSellingPrice: "50000.0000",
        status: AdditionalServiceOrderStatus.CONFIRMED,
        commercialStatus: CommercialProposalStatus.SENT,
        createdAt: new Date("2026-07-29T12:00:00.000Z"),
        travelPackage: { id: "travel-1", name: "Miami" },
        internalBooking: null,
      },
      {
        id: "historical-order",
        orderNumber: "ACME-AS-0",
        quoteCustomer: null,
        travelPackageId: "travel-1",
        internalBookingId: null,
        travelType: AdditionalServiceTravelType.INTERNATIONAL,
        quotationCurrency: AdditionalServiceCurrency.USD,
        totalSellingPrice: "10.0000",
        status: AdditionalServiceOrderStatus.DRAFT,
        commercialStatus: CommercialProposalStatus.DRAFT,
        createdAt: new Date("2026-07-28T12:00:00.000Z"),
        travelPackage: { id: "travel-1", name: "Miami" },
        internalBooking: null,
      },
    ]);
    const count = jest.fn().mockResolvedValue(3);
    const prisma = {
      additionalServiceOrder: { findMany, count },
    };
    const repository = new PrismaAdditionalServicesRepository(
      prisma as unknown as PrismaService,
    );
    const createdFrom = new Date("2026-07-01T06:00:00.000Z");
    const createdTo = new Date("2026-07-31T05:59:59.999Z");

    const result = await repository.findOrderDashboardPage("tenant-1", {
      page: 1,
      pageSize: 20,
      search: "2-2222",
      travelNumber: "CTR-100",
      status: AdditionalServiceOrderStatus.DRAFT,
      createdFrom,
      createdTo,
    });

    const orderQuery = findMany.mock.calls[0][0];
    expect(orderQuery).not.toHaveProperty("include");
    expect(orderQuery.select).not.toHaveProperty("lines");
    expect(orderQuery.select).not.toHaveProperty("serviceDetails");
    expect(orderQuery.select.commercialStatus).toBe(true);
    expect(orderQuery.select.quoteCustomer).toEqual({
      select: { fullName: true },
    });
    expect(orderQuery).toEqual(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          AND: [
            {
              OR: [
                {
                  orderNumber: {
                    contains: "2-2222",
                    mode: "insensitive",
                  },
                },
                {
                  quoteCustomer: {
                    is: {
                      fullName: {
                        contains: "2-2222",
                        mode: "insensitive",
                      },
                    },
                  },
                },
                {
                  quoteCustomer: {
                    is: {
                      idNumber: {
                        contains: "2-2222",
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            },
            {
              OR: [
                {
                  travelPackage: {
                    is: {
                      OR: [
                        {
                          packageCode: {
                            contains: "CTR-100",
                            mode: "insensitive",
                          },
                        },
                        {
                          contracts: {
                            some: {
                              contractNumber: {
                                contains: "CTR-100",
                                mode: "insensitive",
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  internalBooking: {
                    is: {
                      bookingCode: {
                        contains: "CTR-100",
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            },
          ],
          status: AdditionalServiceOrderStatus.DRAFT,
          createdAt: {
            gte: createdFrom,
            lte: createdTo,
          },
        },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: orderQuery.where });
    expect(result.orders.map(({ customerName }) => customerName)).toEqual([
      "Paying Companion",
      "Different Customer",
      null,
    ]);
    expect(result.orders.map(({ commercialStatus }) => commercialStatus)).toEqual([
      CommercialProposalStatus.APPROVED,
      CommercialProposalStatus.SENT,
      CommercialProposalStatus.DRAFT,
    ]);
  });
});
