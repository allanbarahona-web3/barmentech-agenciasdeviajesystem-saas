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
