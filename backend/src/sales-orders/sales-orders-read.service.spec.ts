import { NotFoundException } from "@nestjs/common";
import type { SalesOrdersRepository } from "./sales-orders.repository.interface";
import { SalesOrdersReadService } from "./sales-orders-read.service";

describe("SalesOrdersReadService", () => {
  it("normalizes list defaults and forwards only the authenticated tenant", async () => {
    const { service, findPage } = setup();
    findPage.mockResolvedValue({
      salesOrders: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });

    await service.list("tenant-1", { search: "  Customer One  " });

    expect(findPage).toHaveBeenCalledWith("tenant-1", {
      page: 1,
      pageSize: 20,
      search: "Customer One",
    });
  });

  it("returns a tenant-owned detail snapshot", async () => {
    const { service, findById } = setup();
    const record = { id: "sales-order-1", lines: [] };
    findById.mockResolvedValue(record);

    await expect(
      service.getById("tenant-1", "sales-order-1"),
    ).resolves.toBe(record);
    expect(findById).toHaveBeenCalledWith("tenant-1", "sales-order-1");
  });

  it("returns not found rather than exposing another tenant's order", async () => {
    const { service, findById } = setup();
    findById.mockResolvedValue(null);

    await expect(
      service.getById("tenant-2", "sales-order-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findById).toHaveBeenCalledWith("tenant-2", "sales-order-1");
  });
});

function setup() {
  const findPage = jest.fn();
  const findById = jest.fn();
  const repository = { findPage, findById } as unknown as SalesOrdersRepository;
  return {
    service: new SalesOrdersReadService(repository),
    findPage,
    findById,
  };
}
