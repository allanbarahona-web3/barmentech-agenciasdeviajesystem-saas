import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  requireTravelFiscalClassificationUsage,
  TravelFiscalClassificationService,
} from './travel-fiscal-classification.service';

describe('TravelFiscalClassificationService', () => {
  const queryRaw = jest.fn();
  const service = new TravelFiscalClassificationService({
    $queryRaw: queryRaw,
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates an active same-tenant classification in one query', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'catalog-1',
        isActive: true,
        usageAllowed: true,
        fiscalProfileId: 'profile-1',
        fiscalProfileActive: true,
      },
    ]);

    await expect(
      service.validate('tenant-1', 'catalog-1', 'TRAVEL_PACKAGE'),
    ).resolves.toBe('catalog-1');
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const query = queryRaw.mock.calls[0][0];
    const sql = query.strings.join(' ');
    expect(sql).toContain('catalog."tenantId" = ');
    expect(sql).toContain('usage."tenantId" = catalog."tenantId"');
    expect(query.values).toEqual(
      expect.arrayContaining(['TRAVEL_PACKAGE', 'tenant-1', 'catalog-1']),
    );
  });

  it('does not disclose a missing or cross-tenant classification', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      service.validate('tenant-1', 'other-tenant-catalog', 'TRAVEL_PACKAGE'),
    ).rejects.toThrow(
      new NotFoundException('TRAVEL_FISCAL_CLASSIFICATION_NOT_FOUND'),
    );
  });

  it.each([
    [
      'inactive catalog',
      {
        id: 'catalog-1',
        isActive: false,
        usageAllowed: true,
        fiscalProfileId: 'profile-1',
        fiscalProfileActive: true,
      },
      'TRAVEL_FISCAL_CLASSIFICATION_INACTIVE',
    ],
    [
      'incompatible usage',
      {
        id: 'catalog-1',
        isActive: true,
        usageAllowed: false,
        fiscalProfileId: 'profile-1',
        fiscalProfileActive: true,
      },
      'TRAVEL_FISCAL_CLASSIFICATION_USAGE_INCOMPATIBLE',
    ],
    [
      'missing fiscal profile',
      {
        id: 'catalog-1',
        isActive: true,
        usageAllowed: true,
        fiscalProfileId: null,
        fiscalProfileActive: null,
      },
      'TRAVEL_FISCAL_CLASSIFICATION_PROFILE_MISSING',
    ],
    [
      'inactive fiscal profile',
      {
        id: 'catalog-1',
        isActive: true,
        usageAllowed: true,
        fiscalProfileId: 'profile-1',
        fiscalProfileActive: false,
      },
      'TRAVEL_FISCAL_CLASSIFICATION_PROFILE_INACTIVE',
    ],
  ])('rejects %s explicitly', async (_caseName, row, expectedMessage) => {
    queryRaw.mockResolvedValue([row]);

    await expect(
      service.validate('tenant-1', 'catalog-1', 'TRAVEL_PACKAGE'),
    ).rejects.toThrow(new BadRequestException(expectedMessage));
  });

  it('lists only eligible selector metadata without requiring pricing', async () => {
    const options = [
      {
        id: 'catalog-1',
        code: 'TOUR',
        name: 'Paquete turístico',
        description: null,
        fiscalItemCategory: 'SERVICE',
        cabysCode: '6331000000000',
        unitOfMeasureCode: 'Sp',
        taxCode: '01',
        taxRateCode: '08',
        taxPercentage: '13',
      },
    ];
    queryRaw.mockResolvedValue(options);

    await expect(service.list('tenant-1', 'TRAVEL_PACKAGE')).resolves.toEqual(
      options,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const query = queryRaw.mock.calls[0][0];
    const sql = query.strings.join(' ');
    expect(sql).toContain('usage."tenantId" = ');
    expect(sql).toContain('catalog."isActive" = TRUE');
    expect(sql).toContain('profile."isActive" = TRUE');
    expect(sql).toContain('ORDER BY catalog."displayOrder" ASC');
    expect(sql).not.toContain('pricing');
    expect(query.values).toEqual(['tenant-1', 'TRAVEL_PACKAGE']);
  });

  it('rejects unsupported selector usages', () => {
    expect(() => requireTravelFiscalClassificationUsage('MIGRATION_TRIP')).toThrow(
      'TRAVEL_FISCAL_CLASSIFICATION_USAGE_INVALID',
    );
  });
});
