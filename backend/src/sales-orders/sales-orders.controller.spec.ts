import { SalesOrdersController } from "./sales-orders.controller";
import { SalesOrdersReadService } from "./sales-orders-read.service";

describe("SalesOrdersController", () => {
  it("takes tenant identity from the authenticated request for list and detail", async () => {
    const list = jest.fn().mockResolvedValue({ salesOrders: [] });
    const getById = jest.fn().mockResolvedValue({ id: "sales-order-1" });
    const controller = new SalesOrdersController({
      list,
      getById,
    } as unknown as SalesOrdersReadService);
    const request = { user: { tenantId: "tenant-1" } };

    await controller.list(request, { page: 2 });
    await controller.getById(request, "sales-order-1");

    expect(list).toHaveBeenCalledWith("tenant-1", { page: 2 });
    expect(getById).toHaveBeenCalledWith("tenant-1", "sales-order-1");
  });
});
