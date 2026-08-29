import { ContractsService } from "./contracts.service";

type CustomerRecord = {
  id: string;
  tenantId: string;
  fullName: string;
  idNumber: string;
  idType: string;
};

const holder: CustomerRecord = {
  id: "holder-1",
  tenantId: "tenant-1",
  fullName: "Holder Example",
  idNumber: "0102345678",
  idType: "Cedula",
};

const companionOne: CustomerRecord = {
  id: "companion-1",
  tenantId: "tenant-1",
  fullName: "Companion One",
  idNumber: "P100",
  idType: "Pasaporte",
};

const companionTwo: CustomerRecord = {
  id: "companion-2",
  tenantId: "tenant-1",
  fullName: "Companion Two",
  idNumber: "P200",
  idType: "Pasaporte",
};

const minor: CustomerRecord = {
  id: "minor-1",
  tenantId: "tenant-1",
  fullName: "Minor Example",
  idNumber: "P300",
  idType: "Pasaporte",
};

function createService(records: CustomerRecord[]) {
  const create = jest.fn();
  const update = jest.fn();
  const findFirst = jest.fn(({ where }: any) => {
    return Promise.resolve(
      records.find(
        (record) =>
          record.tenantId === where.tenantId &&
          (where.id
            ? record.id === where.id
            : record.idType === where.idType &&
              record.idNumber === where.idNumber),
      ) || null,
    )
  });
  const prisma = {
    client: {
      findFirst,
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          records
            .filter(
              (record) =>
                record.tenantId === where.tenantId &&
                where.OR.some(
                  (identity: any) =>
                    identity.idType === record.idType &&
                    identity.idNumber === record.idNumber,
                ),
            )
            .slice(0, 2),
        ),
      ),
      create,
      update,
    },
  };
  const dependencies = [prisma, ...Array(17).fill({})];
  const service = Reflect.construct(ContractsService, dependencies) as any;

  return {
    service,
    client: { findFirst, create, update },
  };
}

function createArchiveService(records: CustomerRecord[]) {
  const customerCreate = jest.fn();
  const customerUpdate = jest.fn();
  const contractCreate = jest.fn(({ data }: any) =>
    Promise.resolve({
      id: "contract-1",
      contractNumber: data.contractNumber,
      clientId: data.clientId,
      paymentReference: data.paymentReference,
      status: data.status,
      createdAt: new Date("2026-07-26T12:00:00.000Z"),
      documents: [],
    }),
  );
  const prisma = {
    client: {
      findFirst: jest.fn(({ where }: any) => {
        return Promise.resolve(
          records.find(
            (record) =>
              record.tenantId === where.tenantId &&
              (where.id
                ? record.id === where.id
                : record.idType === where.idType &&
                  record.idNumber === where.idNumber),
          ) || null,
        )
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          records
            .filter(
              (record) =>
                record.tenantId === where.tenantId &&
                where.OR.some(
                  (identity: any) =>
                    identity.idType === record.idType &&
                    identity.idNumber === record.idNumber,
                ),
            )
            .slice(0, 2),
        ),
      ),
      create: customerCreate,
      update: customerUpdate,
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ subdomain: "tenant-one" }),
    },
    contract: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: contractCreate,
    },
  };
  const billing = {
    validateTripCapacity: jest.fn().mockResolvedValue(undefined),
  };
  const jobDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };
  const dependencies = [
    prisma,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) },
    {},
    billing,
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    jobDispatcher,
    {},
  ];
  const service = Reflect.construct(ContractsService, dependencies) as any;

  return {
    service,
    contractCreate,
    customerCreate,
    customerUpdate,
  };
}

function holderPayload(overrides: Record<string, unknown> = {}) {
  return {
    selectedCustomerId: holder.id,
    fullName: holder.fullName,
    idNumber: holder.idNumber,
    idType: holder.idType,
    ...overrides,
  };
}

function companionPayload(
  customer: CustomerRecord,
  overrides: Record<string, unknown> = {},
) {
  return {
    selectedCustomerId: customer.id,
    fullName: customer.fullName,
    idNumber: customer.idNumber,
    idType: customer.idType,
    ...overrides,
  };
}

describe("ContractsService archive customer identity resolution", () => {
  it("uses the holder ID selected in Customer Lookup without mutating Customers", async () => {
    const { service, client } = createService([holder]);

    const result = await service.resolveArchiveParticipants(
      holder.tenantId,
      holderPayload(),
      [],
      [],
    );

    expect(result.client.id).toBe(holder.id);
    expect(client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: holder.id, tenantId: holder.tenantId },
      }),
    );
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid holder ID", async () => {
    const { service } = createService([holder]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload({ selectedCustomerId: "missing" }),
        [],
        [],
      ),
    ).rejects.toThrow(/cliente inválido/);
  });

  it("rejects a cross-tenant holder ID", async () => {
    const foreignHolder = { ...holder, tenantId: "tenant-2" };
    const { service } = createService([foreignHolder]);

    await expect(
      service.resolveArchiveParticipants(
        "tenant-1",
        holderPayload(),
        [],
        [],
      ),
    ).rejects.toThrow(/otro tenant/);
  });

  it("rejects a holder identity mismatch", async () => {
    const { service } = createService([holder]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload({ fullName: "Different Person" }),
        [],
        [],
      ),
    ).rejects.toThrow(/no coincide/);
  });

  it("preserves IDs for multiple companions selected through Companion Lookup", async () => {
    const { service } = createService([
      holder,
      companionOne,
      companionTwo,
    ]);

    const result = await service.resolveArchiveParticipants(
      holder.tenantId,
      holderPayload(),
      [
        companionPayload(companionOne),
        companionPayload(companionTwo),
      ],
      [],
    );

    expect(result.enrichedCompanions).toEqual([
      expect.objectContaining({ selectedCustomerId: companionOne.id }),
      expect.objectContaining({ selectedCustomerId: companionTwo.id }),
    ]);
  });

  it("rejects duplicate companion IDs, including reuse of the holder ID", async () => {
    const { service } = createService([holder, companionOne]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload(),
        [
          companionPayload(companionOne),
          companionPayload(companionOne),
        ],
        [],
      ),
    ).rejects.toThrow(/duplicado/);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload(),
        [companionPayload(holder)],
        [],
      ),
    ).rejects.toThrow(/duplicado/);
  });

  it("rejects invalid and cross-tenant companion IDs", async () => {
    const foreignCompanion = {
      ...companionOne,
      tenantId: "tenant-2",
    };
    const { service } = createService([holder, foreignCompanion]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload(),
        [companionPayload(companionOne)],
        [],
      ),
    ).rejects.toThrow(/otro tenant/);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload(),
        [
          companionPayload(companionOne, {
            selectedCustomerId: "missing",
          }),
        ],
        [],
      ),
    ).rejects.toThrow(/cliente inválido/);
  });

  it("rejects a companion identity mismatch", async () => {
    const { service } = createService([holder, companionOne]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload(),
        [companionPayload(companionOne, { idNumber: "DIFFERENT" })],
        [],
      ),
    ).rejects.toThrow(/no coincide/);
  });

  it("resolves a legacy draft without selectedCustomerId through existing Customers", async () => {
    const { service, client } = createService([holder, companionOne]);

    const result = await service.resolveArchiveParticipants(
      holder.tenantId,
      holderPayload({ selectedCustomerId: undefined }),
      [
        companionPayload(companionOne, {
          selectedCustomerId: undefined,
        }),
      ],
      [],
    );

    expect(result.client.id).toBe(holder.id);
    expect(result.enrichedCompanions[0].selectedCustomerId).toBe(
      companionOne.id,
    );
    expect(client.findFirst).toHaveBeenCalledTimes(2);
  });

  it("resolves a formatted canonical physical identity without creating a Customer", async () => {
    const canonicalHolder: CustomerRecord = {
      id: "canonical-holder",
      tenantId: "tenant-1",
      fullName: "Canonical Holder",
      idType: "CEDULA_FISICA",
      idNumber: "303570962",
    };
    const { service, client } = createService([canonicalHolder]);

    const result = await service.resolveArchiveParticipants(
      canonicalHolder.tenantId,
      {
        selectedCustomerId: undefined,
        fullName: canonicalHolder.fullName,
        idType: canonicalHolder.idType,
        idNumber: "3-357-962",
      },
      [],
      [],
    );

    expect(result.client.id).toBe(canonicalHolder.id);
    expect(client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: canonicalHolder.tenantId,
          idType: "CEDULA_FISICA",
          idNumber: "303570962",
        },
      }),
    );
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("rejects a legacy draft when its Customer no longer exists", async () => {
    const { service } = createService([]);

    await expect(
      service.resolveArchiveParticipants(
        holder.tenantId,
        holderPayload({ selectedCustomerId: undefined }),
        [],
        [],
      ),
    ).rejects.toThrow(/no existe como cliente/);
  });

  it("archives authoritative holder and companion IDs for dashboard, billing, notes, documents, and travel consumers", async () => {
    const {
      service,
      contractCreate,
      customerCreate,
      customerUpdate,
    } = createArchiveService([holder, companionOne, minor]);
    const companion = companionPayload(companionOne);

    await service.archiveContract(
      {
        id: "agent-1",
        email: "agent@example.com",
        fullName: "Agent Example",
        tenantId: holder.tenantId,
      },
      {
        contractNumber: "CT-1",
        clientFullName: holder.fullName,
        clientIdNumber: holder.idNumber,
        clientEmail: "holder@example.com",
        destination: "Destination",
        payloadJson: JSON.stringify({
          selectedCustomerId: holder.id,
          clientIdType: holder.idType,
          companions: [companion],
          minors: [
            {
              selectedCustomerId: minor.id,
              minorName: minor.fullName,
              minorIdType: minor.idType,
              minorId: minor.idNumber,
            },
          ],
        }),
        internalTripId: "internal-trip-1",
      },
      [],
    );

    expect(contractCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: holder.id,
          payload: expect.objectContaining({
            selectedCustomerId: holder.id,
            companions: [
              expect.objectContaining({
                selectedCustomerId: companionOne.id,
              }),
            ],
            minors: [
              expect.objectContaining({
                selectedCustomerId: minor.id,
              }),
            ],
          }),
        }),
      }),
    );
    expect(customerCreate).not.toHaveBeenCalled();
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it("resolves existing minors without retaining an archive-time Customer creation path", async () => {
    const { service, client } = createService([holder, minor]);

    const result = await service.resolveArchiveParticipants(
      holder.tenantId,
      holderPayload(),
      [],
      [
        {
          minorName: minor.fullName,
          minorId: minor.idNumber,
          minorIdType: minor.idType,
        },
      ],
    );

    expect(result.enrichedMinors[0].selectedCustomerId).toBe(minor.id);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("keeps legacy minors without idType working when exactly one existing Customer matches", async () => {
    const { service } = createService([holder, minor]);

    const result = await service.resolveArchiveParticipants(
      holder.tenantId,
      holderPayload(),
      [],
      [
        {
          minorName: minor.fullName,
          minorId: minor.idNumber,
        },
      ],
    );

    expect(result.enrichedMinors[0].selectedCustomerId).toBe(minor.id);
  });
});
