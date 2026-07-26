import { CustomersService } from "./customers.service";

describe("CustomersService", () => {
  it("preserves existing profile fields when an upsert omits them", async () => {
    const existingClient = {
      id: "customer-1",
      fullName: "Customer Example",
    };
    const findUnique = jest.fn().mockResolvedValue(existingClient);
    const update = jest.fn().mockResolvedValue(existingClient);
    const prisma = {
      client: {
        findUnique,
        update,
      },
    };
    const service = new CustomersService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await service.upsertClient({
      fullName: "Customer Example",
      idNumber: "P123456",
      idType: "Pasaporte",
      email: "customer@example.com",
      phone: "8888-8888",
      emergencyContactName: "Emergency Contact",
      emergencyContactPhone: "8777-7777",
      tenantId: "tenant-1",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: existingClient.id },
      data: {
        email: "customer@example.com",
        phone: "8888-8888",
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "8777-7777",
      },
    });
  });

  it("updates profile fields when an upsert explicitly supplies them", async () => {
    const existingClient = {
      id: "customer-1",
      fullName: "Customer Example",
    };
    const update = jest.fn().mockResolvedValue(existingClient);
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue(existingClient),
        update,
      },
    };
    const service = new CustomersService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await service.upsertClient({
      fullName: "Customer Example",
      idNumber: "P123456",
      idType: "Pasaporte",
      email: "customer@example.com",
      nationality: " Costa Rica ",
      occupation: " Engineer ",
      maritalStatus: " Soltero ",
      address: " San José ",
      tenantId: "tenant-1",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: existingClient.id },
      data: {
        email: "customer@example.com",
        phone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        nationality: "Costa Rica",
        occupation: "Engineer",
        maritalStatus: "Soltero",
        address: "San José",
      },
    });
  });
});
