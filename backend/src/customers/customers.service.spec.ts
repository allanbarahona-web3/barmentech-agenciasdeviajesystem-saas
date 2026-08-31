import { CustomersService } from "./customers.service";
import { ConflictException } from "@nestjs/common";

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
      idType: "PASAPORTE",
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
      idType: "PASAPORTE",
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
      idType: "CEDULA_FISICA",
      idNumber: "1-2345-6789",
    });

    expect(result).toEqual({ id: "minor-1" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        idType: "CEDULA_FISICA",
        idNumber: "123456789",
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
      idType: "PASAPORTE",
      idNumber: " P-200 ",
    });

    expect(result).toEqual({ id: "minor-2" });
    expect(create).toHaveBeenCalledWith({
      data: {
        fullName: "Minor Two",
        idType: "PASAPORTE",
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
      idType: "PASAPORTE",
      idNumber: "123456789",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          idType: "PASAPORTE",
          idNumber: "123456789",
        },
      }),
    );
  });

  it.each(["Cedula", "ARBITRARY", null])(
    "rejects non-canonical type %p before a new write",
    async (idType) => {
      const findFirst = jest.fn();
      const create = jest.fn();
      const service = new CustomersService(
        { client: { findFirst, create } } as any,
        {} as any,
        {} as any,
      );

      await expect(
        service.upsertClient({
          fullName: "Canonical Customer",
          idType: idType as any,
          idNumber: "123456789",
          email: "customer@example.com",
          tenantId: "tenant-1",
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          message: "CLIENT_IDENTIFICATION_TYPE_INVALID",
        }),
      );
      expect(findFirst).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(["303570962", "3-357-962", "0303570962"])(
    "uses one canonical duplicate identity for physical input %s",
    async (idNumber) => {
      const existingClient = {
        id: "customer-physical",
        fullName: "Physical Customer",
      };
      const findFirst = jest.fn().mockResolvedValue(existingClient);
      const create = jest.fn();
      const update = jest.fn().mockResolvedValue(existingClient);
      const service = new CustomersService(
        { client: { findFirst, create, update } } as any,
        {} as any,
        {} as any,
      );

      await service.upsertClient({
        fullName: "Physical Customer",
        idType: "CEDULA_FISICA",
        idNumber,
        email: "physical@example.com",
        tenantId: "tenant-1",
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          idType: "CEDULA_FISICA",
          idNumber: "303570962",
        },
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["CEDULA_FISICA", "3-357-962", "303570962"],
    ["CEDULA_JURIDICA", "3-101-123456", "3101123456"],
    ["DIMEX", "1-234-56789012", "123456789012"],
    ["NITE", "1-234-567890", "1234567890"],
  ] as const)(
    "uses canonical %s identity in typed customer search",
    async (idType, search, expectedIdNumber) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const service = new CustomersService(
        { client: { findMany, count } } as any,
        {} as any,
        {} as any,
      );

      await service.listCustomers("tenant-1", { search, idType });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            OR: expect.arrayContaining([
              { idType, idNumber: expectedIdNumber },
            ]),
          }),
        }),
      );
    },
  );

  it("does not infer an identity type during untyped free-text search", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new CustomersService(
      { client: { findMany, count } } as any,
      {} as any,
      {} as any,
    );

    await service.listCustomers("tenant-1", { search: "3-357-962" });

    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      idNumber: { contains: "3-357-962", mode: "insensitive" },
    });
    expect(where.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ idType: expect.any(String) }),
      ]),
    );
  });

  it("revalidates the existing number when idType changes", async () => {
    const update = jest.fn();
    const service = new CustomersService(
      {
        client: {
          findFirst: jest.fn().mockResolvedValue({
            id: "customer-1",
            tenantId: "tenant-1",
            idType: "CEDULA_FISICA",
            idNumber: "123456789",
          }),
          update,
        },
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateCustomer("tenant-1", "customer-1", {
        idType: "CEDULA_JURIDICA",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it("validates a changed number against the current canonical type", async () => {
    const update = jest.fn().mockResolvedValue({ id: "customer-1" });
    const service = new CustomersService(
      {
        client: {
          findFirst: jest.fn().mockResolvedValue({
            id: "customer-1",
            tenantId: "tenant-1",
            idType: "CEDULA_JURIDICA",
            idNumber: "3101123456",
          }),
          update,
        },
      } as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, "getCustomerProfile").mockResolvedValue({} as any);

    await service.updateCustomer("tenant-1", "customer-1", {
      idNumber: "3-101-654321",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: {
        idType: "CEDULA_JURIDICA",
        idNumber: "3101654321",
      },
    });
  });

  it("rejects an invalid changed number before persistence", async () => {
    const update = jest.fn();
    const service = new CustomersService(
      {
        client: {
          findFirst: jest.fn().mockResolvedValue({
            id: "customer-1",
            tenantId: "tenant-1",
            idType: "NITE",
            idNumber: "1234567890",
          }),
          update,
        },
      } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateCustomer("tenant-1", "customer-1", {
        idNumber: "123456789",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps contract companion creation on the centralized canonical path", async () => {
    const create = jest.fn().mockResolvedValue({ id: "companion-1" });
    const service = new CustomersService(
      {
        client: {
          findFirst: jest.fn().mockResolvedValue(null),
          create,
        },
      } as any,
      {} as any,
      {} as any,
    );

    await service.registerCompanionsAsClients(
      [
        {
          fullName: "Legal Entity",
          idType: "CEDULA_JURIDICA",
          idNumber: "3-101-123456",
          email: "legal@example.com",
        },
      ],
      "tenant-1",
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idType: "CEDULA_JURIDICA",
        idNumber: "3101123456",
        tenantId: "tenant-1",
      }),
    });
  });

  it("uses the canonical pair for customer identity validation and lookup", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new CustomersService(
      { client: { findFirst } } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.validateCustomerIdentity("tenant-1", {
        fullName: "Physical Customer",
        idType: "CEDULA_FISICA",
        idNumber: "1-2345-6789",
      }),
    ).resolves.toEqual({
      valid: true,
      message: "Número de identificación disponible",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          idType: "CEDULA_FISICA",
          idNumber: "123456789",
        },
      }),
    );
  });

  it("rejects an invalid identity-validation pair without a lookup", async () => {
    const findFirst = jest.fn();
    const service = new CustomersService(
      { client: { findFirst } } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.validateCustomerIdentity("tenant-1", {
        fullName: "Invalid Customer",
        idType: "CEDULA_FISICA",
        idNumber: "1234567890",
      }),
    ).resolves.toEqual({
      valid: false,
      message: "CLIENT_IDENTIFICATION_NUMBER_INVALID",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("includes Minor participation and its responsible Companion in the existing profile response", async () => {
    const minor = profileCustomer("minor-1", "Minor Passenger");
    const responsibleAdult = {
      id: "companion-1",
      fullName: "Responsible Adult",
    };
    const contract = profileContract({
      clientId: "holder-1",
      client: { id: "holder-1", fullName: "Contract Holder" },
      payload: {
        companions: [
          {
            selectedCustomerId: responsibleAdult.id,
            fullName: responsibleAdult.fullName,
          },
        ],
        minors: [
          {
            selectedCustomerId: minor.id,
            minorName: minor.fullName,
            travelingWith: responsibleAdult.fullName,
          },
        ],
      },
    });
    const { service, prisma } = profileService({
      customer: minor,
      holderContracts: [],
      otherContracts: [contract],
      responsibleAdult,
    });

    const result = await service.getCustomerProfile("tenant-1", minor.id);

    expect(result.contracts).toEqual([
      expect.objectContaining({
        id: contract.id,
        role: "MINOR",
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        participationRole: "MINOR",
        currentTrip: {
          id: "trip-1",
          name: "Current Trip",
          destination: "Destination",
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        currentContract: expect.objectContaining({
          id: contract.id,
          role: "MINOR",
        }),
        responsibleAdult: {
          clientId: responsibleAdult.id,
          fullName: responsibleAdult.fullName,
          participationRole: "COMPANION",
        },
      }),
    );
    expect(prisma.client.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: responsibleAdult.id,
        tenantId: "tenant-1",
      },
      select: {
        id: true,
        fullName: true,
      },
    });
  });

  it.each([
    {
      label: "Holder",
      customerId: "holder-1",
      holderContracts: [
        profileContract({
          clientId: "holder-1",
          client: { id: "holder-1", fullName: "Adult Holder" },
        }),
      ],
      otherContracts: [],
      expectedRole: "HOLDER",
    },
    {
      label: "Companion",
      customerId: "companion-1",
      holderContracts: [],
      otherContracts: [
        profileContract({
          clientId: "holder-1",
          client: { id: "holder-1", fullName: "Adult Holder" },
          payload: {
            companions: [
              {
                selectedCustomerId: "companion-1",
                fullName: "Adult Companion",
              },
            ],
          },
        }),
      ],
      expectedRole: "COMPANION",
    },
  ])(
    "keeps the existing $label profile response shape unchanged",
    async ({
      customerId,
      holderContracts,
      otherContracts,
      expectedRole,
    }) => {
      const { service } = profileService({
        customer: profileCustomer(customerId, `Adult ${expectedRole}`),
        holderContracts,
        otherContracts,
      });

      const result = await service.getCustomerProfile(
        "tenant-1",
        customerId,
      );

      expect(result.contracts[0].role).toBe(expectedRole);
      expect(result.contracts[0]).not.toHaveProperty("responsibleMinors");
      expect(result).not.toHaveProperty("participationRole");
      expect(result).not.toHaveProperty("currentTrip");
      expect(result).not.toHaveProperty("currentContract");
      expect(result).not.toHaveProperty("responsibleAdult");
    },
  );

  it.each([
    {
      label: "Holder",
      customerId: "holder-1",
      customerName: "Responsible Holder",
      holderContracts: [
        profileContract({
          clientId: "holder-1",
          client: { id: "holder-1", fullName: "Responsible Holder" },
          payload: {
            clientFullName: "Responsible Holder",
            minors: [
              {
                selectedCustomerId: "minor-1",
                minorName: "Esteban",
                travelingWith: "Responsible Holder",
              },
              {
                selectedCustomerId: "minor-2",
                minorName: "Sofía",
                travelingWith: "Responsible Holder",
              },
            ],
          },
        }),
      ],
      otherContracts: [],
    },
    {
      label: "Companion",
      customerId: "companion-1",
      customerName: "Responsible Companion",
      holderContracts: [],
      otherContracts: [
        profileContract({
          payload: {
            companions: [
              {
                selectedCustomerId: "companion-1",
                fullName: "Responsible Companion",
              },
            ],
            minors: [
              {
                selectedCustomerId: "minor-1",
                minorName: "Esteban",
                travelingWith: "Responsible Companion",
              },
              {
                selectedCustomerId: "minor-2",
                minorName: "Sofía",
                travelingWith: "Responsible Companion",
              },
            ],
          },
        }),
      ],
    },
  ])(
    "includes contract-scoped Minor responsibilities for a $label",
    async ({
      customerId,
      customerName,
      holderContracts,
      otherContracts,
    }) => {
      const { service } = profileService({
        customer: profileCustomer(customerId, customerName),
        holderContracts,
        otherContracts,
      });

      const result = await service.getCustomerProfile(
        "tenant-1",
        customerId,
      );

      expect(result.contracts[0].responsibleMinors).toEqual([
        { clientId: "minor-1", fullName: "Esteban" },
        { clientId: "minor-2", fullName: "Sofía" },
      ]);
    },
  );

  it("exposes the complete contract roster in Holder, Companion, Minor order", async () => {
    const holder = profileCustomer("holder-1", "Contract Holder");
    const contract = profileContract({
      clientId: holder.id,
      client: { id: holder.id, fullName: holder.fullName },
      payload: {
        companions: [
          {
            selectedCustomerId: "companion-1",
            fullName: "First Companion",
          },
          {
            selectedCustomerId: "companion-2",
            fullName: "Second Companion",
          },
        ],
        minors: [
          {
            selectedCustomerId: "minor-1",
            minorName: "First Minor",
          },
          {
            selectedCustomerId: "minor-2",
            minorName: "Second Minor",
          },
        ],
      },
    });
    const { service } = profileService({
      customer: holder,
      holderContracts: [contract],
      otherContracts: [],
    });

    const result = await service.getCustomerProfile("tenant-1", holder.id);

    expect(result.contracts[0].participants).toEqual([
      {
        clientId: holder.id,
        fullName: holder.fullName,
        participationRole: "HOLDER",
      },
      {
        clientId: "companion-1",
        fullName: "First Companion",
        participationRole: "COMPANION",
      },
      {
        clientId: "companion-2",
        fullName: "Second Companion",
        participationRole: "COMPANION",
      },
      {
        clientId: "minor-1",
        fullName: "First Minor",
        participationRole: "MINOR",
      },
      {
        clientId: "minor-2",
        fullName: "Second Minor",
        participationRole: "MINOR",
      },
    ]);
  });
});

function profileCustomer(id: string, fullName: string) {
  const now = new Date("2026-07-26T12:00:00.000Z");
  return {
    id,
    fullName,
    idNumber: "123456789",
    idType: "Cedula",
    email: null,
    phone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    createdAt: now,
    updatedAt: now,
    dateOfBirth: null,
    nationality: null,
    occupation: null,
    maritalStatus: null,
    address: null,
    city: null,
    country: null,
    postalCode: null,
    secondaryEmail: null,
    secondaryPhone: null,
    emergencyContactRelationship: null,
    emergencyContactEmail: null,
    leadSource: null,
    customerStatus: "ACTIVE",
    assignedToUserId: null,
    lastContactDate: null,
    nextFollowUpDate: null,
    preferredLanguage: null,
    tags: null,
    bloodType: null,
    allergies: null,
    medicalConditions: null,
    medications: null,
  };
}

function profileContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    clientId: "holder-1",
    contractNumber: "CTR-001",
    destination: "Destination",
    status: "SIGNED",
    source: "SCHEDULED_TRIP",
    participantCount: 2,
    createdAt: new Date("2026-07-25T12:00:00.000Z"),
    payload: {},
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-08T00:00:00.000Z"),
    travelPackage: {
      id: "trip-1",
      name: "Current Trip",
    },
    client: {
      id: "holder-1",
      fullName: "Contract Holder",
    },
    ...overrides,
  };
}

function profileService(params: {
  customer: ReturnType<typeof profileCustomer>;
  holderContracts: ReturnType<typeof profileContract>[];
  otherContracts: ReturnType<typeof profileContract>[];
  responsibleAdult?: { id: string; fullName: string };
}) {
  const clientFindFirst = jest
    .fn()
    .mockResolvedValueOnce(params.customer);
  if (params.responsibleAdult) {
    clientFindFirst.mockResolvedValueOnce(params.responsibleAdult);
  }

  const prisma = {
    client: {
      findFirst: clientFindFirst,
    },
    contract: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(params.holderContracts)
        .mockResolvedValueOnce(params.otherContracts),
    },
    billingInvoice: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    billingPayment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    billingClientBalance: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    billingReceipt: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new CustomersService(
    prisma as any,
    {
      listCustomerDocuments: jest.fn().mockResolvedValue([]),
    } as any,
    {
      listCustomerNotes: jest.fn().mockResolvedValue([]),
    } as any,
  );

  return { service, prisma };
}
