import { ContractNotesService } from './contract-notes.service';
import {
  TravelContextDto,
  TravelContextType,
} from '../../travel-context/dto/travel-context.dto';

function buildContext(): TravelContextDto {
  return {
    travelId: 'package-1',
    travelType: TravelContextType.INTERNATIONAL,
    displayName: 'Europe 2027',
    destination: 'Europe',
    startDate: new Date('2027-01-10'),
    endDate: new Date('2027-01-20'),
    status: 'OPEN',
    contractNumber: null,
    participants: [
      {
        clientId: 'holder-1',
        fullName: 'Holder Current Name',
        participantRole: 'HOLDER',
        operationalNotes: [],
      },
      {
        clientId: 'companion-1',
        fullName: 'Companion Current Name',
        participantRole: 'COMPANION',
        operationalNotes: [],
      },
      {
        clientId: 'minor-1',
        fullName: 'Minor Current Name',
        participantRole: 'MINOR',
        operationalNotes: [],
      },
      {
        clientId: 'companion-no-notes',
        fullName: 'No Notes',
        participantRole: 'COMPANION',
        operationalNotes: [],
      },
    ],
  };
}

describe('ContractNotesService travel-context enrichment', () => {
  it('resolves holder, companion, and minor notes by contract participation', async () => {
    const prisma = {
      contract: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'holder-contract',
            clientId: 'holder-1',
            contractNumber: 'CT-HOLDER',
            travelPackageId: 'package-1',
            internalTripId: null,
            payload: {},
            createdAt: new Date('2026-04-01'),
            notes: [
              {
                passengerType: 'HOLDER',
                passengerIndex: null,
                note: 'Holder note',
              },
            ],
          },
          {
            id: 'party-contract',
            clientId: 'other-holder',
            contractNumber: 'CT-COMPANION',
            travelPackageId: null,
            internalTripId: null,
            payload: {
              travelPackageId: 'package-1',
              companions: [
                {
                  selectedCustomerId: 'companion-1',
                  fullName: 'Old companion name',
                },
                {
                  selectedCustomerId: 'companion-no-notes',
                  fullName: 'No Notes',
                },
              ],
              minors: [
                {
                  selectedCustomerId: 'minor-1',
                  minorName: 'Old minor name',
                },
              ],
            },
            createdAt: new Date('2026-03-01'),
            notes: [
              {
                passengerType: 'COMPANION',
                passengerIndex: 0,
                note: 'Companion note',
              },
              {
                passengerType: 'MINOR',
                passengerIndex: 0,
                note: 'Minor note',
              },
            ],
          },
          {
            id: 'unrelated-contract',
            clientId: 'companion-1',
            contractNumber: 'CT-UNRELATED',
            travelPackageId: 'package-2',
            internalTripId: null,
            payload: {},
            createdAt: new Date('2026-05-01'),
            notes: [
              {
                passengerType: 'HOLDER',
                passengerIndex: null,
                note: 'Unrelated travel note',
              },
            ],
          },
        ]),
      },
    };
    const service = new ContractNotesService(prisma as any);

    const result = await service.enrichTravelContext(
      'tenant-1',
      buildContext(),
      'companion-1',
    );

    expect(result.contractNumber).toBe('CT-COMPANION');
    expect(result.participants).toEqual([
      expect.objectContaining({ operationalNotes: ['Holder note'] }),
      expect.objectContaining({ operationalNotes: ['Companion note'] }),
      expect.objectContaining({ operationalNotes: ['Minor note'] }),
      expect.objectContaining({ operationalNotes: [] }),
    ]);
    expect(
      result.participants.flatMap(
        (participant) => participant.operationalNotes,
      ),
    ).not.toContain('Unrelated travel note');
  });

  it('does not fall back to the first travel contract', async () => {
    const prisma = {
      contract: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'unrelated-party',
            clientId: 'someone-else',
            contractNumber: 'CT-FIRST',
            travelPackageId: 'package-1',
            internalTripId: null,
            payload: {},
            createdAt: new Date('2026-05-01'),
            notes: [],
          },
        ]),
      },
    };
    const service = new ContractNotesService(prisma as any);

    const result = await service.enrichTravelContext(
      'tenant-1',
      buildContext(),
      'missing-client',
    );

    expect(result.contractNumber).toBeNull();
  });
});
