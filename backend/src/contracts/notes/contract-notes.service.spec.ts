import { ContractNotesService } from './contract-notes.service';

const contract = {
  id: 'contract-1',
  clientId: 'holder-1',
  travelPackageId: 'package-1',
  payload: {
    companions: [{ selectedCustomerId: 'companion-1', fullName: 'Resolved Companion' }],
    minors: [{ selectedCustomerId: 'minor-1', minorName: 'Resolved Minor' }],
  },
  client: { fullName: 'Resolved Holder' },
};

describe('ContractNotesService stable identity and tenant transactions', () => {
  it.each([
    ['HOLDER', null, 'holder-1', 'Resolved Holder'],
    ['COMPANION', 0, 'companion-1', 'Resolved Companion'],
    ['MINOR', 0, 'minor-1', 'Resolved Minor'],
  ] as const)('normalizes raw %s notes from Contract participation', async (passengerType, passengerIndex, clientId, passengerName) => {
    const c = context();

    await c.service.createContractNote(
      'tenant-1',
      'contract-1',
      passengerType,
      passengerIndex,
      'Arbitrary request name',
      'Operational detail',
      'user-1',
      'User One',
    );

    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        clientId,
        travelPackageId: 'package-1',
        passengerType,
        passengerIndex,
        passengerName,
      }),
    });
    expect(c.root.contractNote.create).not.toHaveBeenCalled();
  });

  it('rejects invalid raw passenger tuples before writing', async () => {
    const c = context();

    await expect(c.service.createContractNote(
      'tenant-1', 'contract-1', 'COMPANION', 4, 'Wrong', 'Note', 'user-1', 'User One',
    )).rejects.toThrow('CONTRACT_NOTE_PARTICIPANT_INVALID');

    expect(c.tx.contractNote.create).not.toHaveBeenCalled();
  });

  it('normalizes customer-derived notes without another Contract scan', async () => {
    const c = context();

    await c.service.createContractNoteForCustomer(
      'tenant-1', 'contract-1', 'minor-1', 'Note', 'user-1', 'User One',
    );

    expect(c.tx.contract.findFirst).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'minor-1',
        travelPackageId: 'package-1',
        passengerType: 'MINOR',
        passengerIndex: 0,
        passengerName: 'Resolved Minor',
      }),
    });
  });

  it('keeps identity immutable during updates and deletes through the tenant transaction', async () => {
    const c = context();
    c.tx.contractNote.findFirst.mockResolvedValue({
      id: 'note-1', tenantId: 'tenant-1', contractId: 'contract-1', status: 'ACTIVE',
      clientId: 'holder-1', travelPackageId: 'package-1', passengerType: 'HOLDER', passengerIndex: null,
    });

    await c.service.updateContractNote('tenant-1', 'contract-1', 'note-1', 'Updated');
    await c.service.deleteContractNote('tenant-1', 'contract-1', 'note-1');

    expect(c.tx.contractNote.update).toHaveBeenCalledWith({ where: { id: 'note-1' }, data: { note: 'Updated' } });
    expect(c.tx.contractNote.delete).toHaveBeenCalledWith({ where: { id: 'note-1' } });
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns same-tenant legacy notes and denies cross-tenant note access', async () => {
    const c = context();
    c.tx.contract.findFirst.mockResolvedValueOnce({ id: 'contract-1' });
    c.tx.contractNote.findMany.mockResolvedValue([{ id: 'legacy-note', clientId: null, travelPackageId: null }]);

    await expect(c.service.listContractNotes('tenant-1', 'contract-1')).resolves.toEqual([
      { id: 'legacy-note', clientId: null, travelPackageId: null },
    ]);

    c.tx.contractNote.findFirst.mockResolvedValueOnce(null);
    await expect(c.service.getContractNote('tenant-1', 'foreign-contract', 'foreign-note'))
      .rejects.toThrow('Nota no encontrada');
    expect(c.tx.contractNote.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'foreign-note', tenantId: 'tenant-1', contractId: 'foreign-contract' },
    });
  });

  it('reads customer operational notes through the tenant transaction using stable identity', async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([]);
    c.tx.contractNote.findMany.mockResolvedValue([]);

    await c.service.listCustomerOperationalNotes('tenant-1', 'companion-1');

    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        OR: [{ clientId: 'companion-1' }],
      }),
    }));
  });

  it('archives expired notes only for an explicit tenant inside one tenant transaction', async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([{ id: 'expired-contract' }]);
    c.tx.contractNote.updateMany.mockResolvedValue({ count: 2 });

    await expect(c.service.archiveExpiredNotes('tenant-1')).resolves.toEqual({ archived: 2 });

    expect(c.tx.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1' }),
    }));
    expect(c.tx.contractNote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1' }),
    }));
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    contract: {
      findFirst: jest.fn().mockResolvedValue(contract),
      findMany: jest.fn().mockResolvedValue([]),
    },
    internalTourBooking: { findFirst: jest.fn() },
    contractNote: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({ id: 'note-1' }),
      updateMany: jest.fn(),
    },
  };
  const root = {
    contractNote: { create: jest.fn() },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  };
  return { service: new ContractNotesService(root as any), tx, root };
}
