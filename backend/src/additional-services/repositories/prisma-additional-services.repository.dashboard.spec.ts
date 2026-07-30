import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceCurrency,
  AdditionalServiceOrderStatus,
  AdditionalServiceTravelType,
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

    const result = await repository.findOrderDashboardPage("tenant-1", {
      page: 1,
      pageSize: 20,
      customerId: "client-2",
      customer: "2-2222",
      travelNumber: "CTR-100",
      status: AdditionalServiceOrderStatus.DRAFT,
    });

    const orderQuery = findMany.mock.calls[0][0];
    expect(orderQuery).not.toHaveProperty("include");
    expect(orderQuery.select).not.toHaveProperty("lines");
    expect(orderQuery.select).not.toHaveProperty("serviceDetails");
    expect(orderQuery.select.quoteCustomer).toEqual({
      select: { fullName: true },
    });
    expect(orderQuery).toEqual(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          quoteCustomerId: "client-2",
          quoteCustomer: {
            is: {
              OR: [
                {
                  fullName: {
                    contains: "2-2222",
                    mode: "insensitive",
                  },
                },
                {
                  idNumber: {
                    contains: "2-2222",
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
          AND: [
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
  });
});
