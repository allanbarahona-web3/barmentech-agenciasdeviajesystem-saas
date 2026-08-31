import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { ImmutableBillingArtifactStorageError, type ImmutableBillingArtifactStoragePort } from '../storage/immutable-billing-artifact-storage.port';
import { FiscalArtifactReadService } from './fiscal-artifact-read.service';

const NOW = new Date('2026-09-09T00:00:00.000Z');

describe('FiscalArtifactReadService', () => {
  it('lists safe, ordered metadata without reading storage', async () => {
    const c = context({ artifacts: [artifact({ status: 'PENDING', artifactType: 'SIGNED_FISCAL_XML', version: 1 }), artifact({ status: 'FAILED', artifactType: 'SIGNED_FISCAL_XML', version: 2, terminalErrorCode: 'RETRIEVAL_FAILED', failedAt: NOW }), artifact({ artifactType: 'TAX_AUTHORITY_RESPONSE_XML', version: 2 })] });
    const result = await c.service.list('tenant-a', 'document-a');
    expect(result[0]).toEqual({ artifactType: 'SIGNED_FISCAL_XML', version: 1, status: 'PENDING', downloadAvailable: false });
    expect(result[1]).toEqual({ artifactType: 'SIGNED_FISCAL_XML', version: 2, status: 'FAILED', terminalErrorCode: 'RETRIEVAL_FAILED', failedAt: NOW, downloadAvailable: false });
    expect(result[2]).toEqual({ artifactType: 'TAX_AUTHORITY_RESPONSE_XML', version: 2, status: 'AVAILABLE', mimeType: 'application/xml', byteSize: '11', retrievedAt: NOW, storedAt: NOW, downloadAvailable: true });
    expect(c.artifacts.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', billingDocumentId: 'document-a' }, take: 100, orderBy: [{ artifactType: 'asc' }, { version: 'asc' }] }));
    expect(c.storage.readImmutable).not.toHaveBeenCalled();
  });

  it('returns an empty list and makes missing/foreign documents indistinguishable', async () => {
    const c = context({ artifacts: [] });
    await expect(c.service.list('tenant-a', 'document-a')).resolves.toEqual([]);
    c.documents.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    for (const id of ['missing', 'foreign']) await expect(c.service.list('tenant-a', id)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FISCAL_ARTIFACT_NOT_FOUND' }) });
  });

  it.each(['SIGNED_FISCAL_XML', 'TAX_AUTHORITY_RESPONSE_XML'] as const)('downloads verified %s bytes with no mutation', async (artifactType) => {
    const bytes = Buffer.from('verified xml'); const row = artifact({ artifactType, sha256: hash(bytes), byteSize: BigInt(bytes.length) }); const c = context({ artifact: row, read: { ...storageMetadata(row), bytes } });
    const result = await c.service.download('tenant-a', 'document-a', artifactType, '1');
    expect(result.bytes).toBe(bytes); expect(result.mimeType).toBe('application/xml');
    expect(result.filename).toBe(artifactType === 'SIGNED_FISCAL_XML' ? 'signed-fiscal-document-v1.xml' : 'tax-authority-response-v1.xml');
    expect(c.storage.readImmutable).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType, artifactVersion: 1, storageKey: 'private/key', storageProvider: 'PRIVATE_OBJECT_STORAGE' }));
  });

  it('downloads an existing internal invoice PDF through the same immutable artifact path', async () => {
    const bytes = Buffer.from('%PDF-1.7 invoice'); const row = artifact({ artifactType: 'INTERNAL_PDF', mimeType: 'application/pdf', sha256: hash(bytes), byteSize: BigInt(bytes.length) }); const c = context({ artifact: row, read: { ...storageMetadata(row), bytes } });
    const result = await c.service.download('tenant-a', 'document-a', 'INTERNAL_PDF', '1');
    expect(result).toEqual({ bytes, mimeType: 'application/pdf', filename: 'fiscal-invoice-v1.pdf' });
    expect(c.storage.readImmutable).toHaveBeenCalledWith(expect.objectContaining({ artifactType: 'INTERNAL_PDF', artifactVersion: 1 }));
  });

  it.each([
    ['unsupported type', 'UNKNOWN', '1', 'FISCAL_ARTIFACT_INVALID_REQUEST'], ['invalid version', 'SIGNED_FISCAL_XML', '0', 'FISCAL_ARTIFACT_INVALID_REQUEST'],
  ])('rejects %s before storage', async (_, type, version, code) => { const c = context(); await expect(c.service.download('tenant-a', 'document-a', type, version)).rejects.toMatchObject({ response: expect.objectContaining({ code }) }); expect(c.storage.readImmutable).not.toHaveBeenCalled(); });

  it.each([
    ['missing', null, 'FISCAL_ARTIFACT_NOT_FOUND'], ['pending', artifact({ status: 'PENDING' }), 'FISCAL_ARTIFACT_NOT_AVAILABLE'], ['failed', artifact({ status: 'FAILED' }), 'FISCAL_ARTIFACT_UNAVAILABLE'], ['incomplete', artifact({ storageKey: null }), 'FISCAL_ARTIFACT_INTEGRITY_FAILURE'],
  ])('rejects %s artifacts safely', async (_, row, code) => { const c = context({ artifact: row }); await expect(c.service.download('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1')).rejects.toMatchObject({ response: expect.objectContaining({ code }) }); expect(c.storage.readImmutable).not.toHaveBeenCalled(); });

  it.each(['sha256', 'byteSize', 'mimeType', 'storageKey', 'storageProvider'] as const)('contains storage %s mismatches as integrity failures', async (field) => {
    const bytes = Buffer.from('verified xml'); const row = artifact({ sha256: hash(bytes), byteSize: BigInt(bytes.length) }); const read = { ...storageMetadata(row), bytes, [field]: field === 'byteSize' ? BigInt(bytes.length + 1) : field === 'mimeType' ? 'text/xml' : `different-${String(field)}` }; const c = context({ artifact: row, read });
    await expect(c.service.download('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FISCAL_ARTIFACT_INTEGRITY_FAILURE' }) });
  });

  it('contains storage infrastructure errors and is deterministic on repeated reads', async () => {
    const bytes = Buffer.from('verified xml'); const row = artifact({ sha256: hash(bytes), byteSize: BigInt(bytes.length) }); const c = context({ artifact: row, read: { ...storageMetadata(row), bytes } });
    const first = await c.service.download('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1'); const second = await c.service.download('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1');
    expect(second).toEqual(first); c.storage.readImmutable.mockRejectedValueOnce(new ImmutableBillingArtifactStorageError('IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE'));
    await expect(c.service.download('tenant-a', 'document-a', 'SIGNED_FISCAL_XML', '1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FISCAL_ARTIFACT_DOWNLOAD_FAILED' }) });
  });
});

function artifact(overrides: Record<string, unknown> = {}) { return { artifactType: 'SIGNED_FISCAL_XML', version: 1, status: 'AVAILABLE', storageProvider: 'PRIVATE_OBJECT_STORAGE', storageKey: 'private/key', sha256: 'a'.repeat(64), byteSize: 11n, mimeType: 'application/xml', retrievedAt: NOW, storedAt: NOW, terminalErrorCode: null, failedAt: null, ...overrides }; }
function storageMetadata(row: ReturnType<typeof artifact>) { return { storageProvider: row.storageProvider, storageKey: row.storageKey, sha256: row.sha256, byteSize: row.byteSize, mimeType: row.mimeType, storedAt: row.storedAt, storageEtag: null }; }
function hash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function context(options: { artifacts?: ReturnType<typeof artifact>[]; artifact?: ReturnType<typeof artifact> | null; read?: unknown } = {}) {
  const documents = { findUnique: jest.fn().mockResolvedValue({ id: 'document-a' }) }; const artifacts = { findMany: jest.fn().mockResolvedValue(options.artifacts ?? []), findFirst: jest.fn().mockResolvedValue(options.artifact === undefined ? artifact() : options.artifact) };
  const prisma = { billingDocument: documents, billingDocumentArtifact: artifacts } as unknown as PrismaService;
  const storage = { readImmutable: jest.fn().mockResolvedValue(options.read ?? { ...storageMetadata(artifact()), bytes: Buffer.from('hello world') }) } as unknown as ImmutableBillingArtifactStoragePort & { readImmutable: jest.Mock };
  return { service: new FiscalArtifactReadService(prisma, storage), documents, artifacts, storage };
}
