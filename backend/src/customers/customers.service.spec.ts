import { CustomersService } from "./customers.service";

describe("CustomersService", () => {
  it("preserves existing profile fields when an upsert omits them", async () => {
    const existingClient = {
      id: "customer-1",
      fullName: "Customer Example",
    };
    const findFirst = jest.fn().mockResolvedValue(existingClient);
    const update = jest.fn().mockResolvedValue(existingClient);
    const prisma = {
      client: {
        findFirst,
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
        findFirst: jest.fn().mockResolvedValue(existingClient),
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

  it("reuses an existing Minor Customer by tenant, ID type, and normalized ID", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: "minor-1",
      fullName: "Minor Example",
    });
    const create = jest.fn();
    const service = new CustomersService(
      {
        client: {
          findFirst,
          create,
        },
      } as any,
      {} as any,
      {} as any,
    );

    const result = await service.resolveMinorCustomer("tenant-1", {
      fullName: " Minor Example ",
      idType: "Cedula",
      idNumber: "1-2345-6789",
    });

    expect(result).toEqual({ id: "minor-1" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        idType: "Cedula",
        idNumber: "0123456789",
      },
      select: {
        id: true,
        fullName: true,
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new Minor Customer with only captured fields and no placeholder email", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: "minor-2" });
    const service = new CustomersService(
      {
        client: {
          findFirst,
          create,
        },
      } as any,
      {} as any,
      {} as any,
    );

    const result = await service.resolveMinorCustomer("tenant-1", {
      fullName: "Minor Two",
      idType: "Pasaporte",
      idNumber: " P-200 ",
    });

    expect(result).toEqual({ id: "minor-2" });
    expect(create).toHaveBeenCalledWith({
      data: {
        fullName: "Minor Two",
        idType: "Pasaporte",
        idNumber: "P-200",
        email: null,
        dateOfBirth: null,
        tenantId: "tenant-1",
      },
      select: {
        id: true,
      },
    });
  });

  it("does not collide Customers that share an ID number under different document types", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: "passport-client" });
    const service = new CustomersService(
      {
        client: {
          findFirst,
          create,
        },
      } as any,
      {} as any,
      {} as any,
    );

    await service.resolveMinorCustomer("tenant-1", {
      fullName: "Passport Minor",
      idType: "Pasaporte",
      idNumber: "123456789",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          idType: "Pasaporte",
          idNumber: "123456789",
        },
      }),
    );
  });
});
