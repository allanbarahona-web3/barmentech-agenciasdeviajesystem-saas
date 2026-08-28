import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  ImmutableBillingArtifactStorageAdapter,
} from './immutable-billing-artifact-storage.adapter';
import {
  ImmutableBillingArtifactStorageError,
} from './immutable-billing-artifact-storage.port';
import { StorageObjectAlreadyExistsError, StorageObjectCapacityError, StorageService } from './storage.service';

describe('ImmutableBillingArtifactStorageAdapter', () => {
  it.each([
    ['SIGNED_FISCAL_XML', 'application/xml', 'signed-fiscal-xml', 'xml'],
    ['TAX_AUTHORITY_RESPONSE_XML', 'text/xml', 'tax-authority-response-xml', 'xml'],
    ['INTERNAL_PDF', 'application/pdf', 'internal-pdf', 'pdf'],
  ] as const)('builds a deterministic private key for %s', async (artifactType, mimeType, segment, extension) => {
    const c = context(); const bytes = Buffer.from('immutable bytes'); const sha = hash(bytes);
    const result = await c.service.storeImmutable(input({ artifactType, mimeType, bytes, expectedSha256: sha }));
    expect(result.storageKey).toBe(`production/tenants/tenant_a/billing-documents/document_a/artifacts/${segment}/v1/${sha}.${extension}`);
    expect(c.storage.putObjectIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ contentType: mimeType, body: bytes }));
    expect(c.storage.putObjectIfAbsent.mock.calls[0][0]).not.toHaveProperty('acl');
    expect(result).toMatchObject({ storageProvider: 'PRIVATE_OBJECT_STORAGE', sha256: sha, byteSize: BigInt(bytes.length), mimeType });
  });

  it('returns deterministic exact metadata without mutating caller bytes', async () => {
    const c = context(); const bytes = Buffer.from('immutable bytes'); const original = Buffer.from(bytes); const sha = hash(bytes);
    const result = await c.service.storeImmutable(input({ bytes, expectedSha256: sha }));
    expect(bytes).toEqual(original); expect(result.storageEtag).toBe('etag-created'); expect(result.storedAt).toBeInstanceOf(Date);
  });

  it('accepts an exact conditional-write race winner only after rereading and verifying it', async () => {
    const bytes = Buffer.from('same'); const sha = hash(bytes); const storedAt = new Date('2026-09-09T00:00:00.000Z');
    const c = context({ putError: new StorageObjectAlreadyExistsError(), existing: { body: bytes, contentType: 'application/xml', eTag: 'etag-existing', lastModified: storedAt } });
    await expect(c.service.storeImmutable(input({ bytes, expectedSha256: sha }))).resolves.toMatchObject({ sha256: sha, storageEtag: 'etag-existing', storedAt });
    expect(c.storage.readObjectWithMetadata).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['different bytes', { body: Buffer.from('other'), contentType: 'application/xml', lastModified: new Date() }],
    ['different mime', { body: Buffer.from('same'), contentType: 'text/xml', lastModified: new Date() }],
  ])('rejects an existing contradictory immutable object: %s', async (_, existing) => {
    const bytes = Buffer.from('same'); const c = context({ putError: new StorageObjectAlreadyExistsError(), existing });
    await expectCode(c.service.storeImmutable(input({ bytes, expectedSha256: hash(bytes) })), 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_CONFLICT');
  });

  it.each([
    ['wrong MIME', { mimeType: 'application/pdf' }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'], ['empty bytes', { bytes: Buffer.alloc(0) }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'],
    ['over capacity', { bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_CAPACITY_EXCEEDED'], ['unsafe tenant', { tenantId: '../tenant' }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'],
    ['unsafe document', { billingDocumentId: 'document/a' }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'], ['XML version two', { artifactVersion: 2 }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'],
    ['uppercase hash', { expectedSha256: 'A'.repeat(64) }, 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'],
  ])('rejects invalid immutable input: %s', async (_, override, expectedCode) => {
    const c = context(); await expectCode(c.service.storeImmutable(input(override)), expectedCode);
    expect(c.storage.putObjectIfAbsent).not.toHaveBeenCalled();
  });

  it('rejects an SHA-256 that does not match the raw bytes', async () => {
    const c = context(); await expectCode(c.service.storeImmutable(input({ expectedSha256: 'a'.repeat(64) })), 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
  });

  it('reads only an exact private namespace and recomputes byte metadata', async () => {
    const bytes = Buffer.from('read me'); const sha = hash(bytes); const storedAt = new Date('2026-09-09T00:00:00.000Z'); const c = context({ existing: { body: bytes, contentType: 'application/xml', eTag: 'etag-read', lastModified: storedAt } });
    const stored = await c.service.storeImmutable(input({ bytes, expectedSha256: sha }));
    c.storage.readObjectWithMetadata.mockResolvedValueOnce({ body: bytes, contentType: 'application/xml', eTag: 'etag-read', lastModified: storedAt });
    const result = await c.service.readImmutable({ ...input({ bytes, expectedSha256: sha }), storageProvider: stored.storageProvider, storageKey: stored.storageKey });
    expect(result.bytes).toEqual(bytes); expect(result.byteSize).toBe(BigInt(bytes.length)); expect(result.sha256).toBe(sha);
    expect(c.storage.readObjectWithMetadata).toHaveBeenLastCalledWith({ objectKey: stored.storageKey, maximumBytes: 5 * 1024 * 1024 });
  });

  it('rejects foreign keys, oversized reads, and storage failures with stable safe errors', async () => {
    const bytes = Buffer.from('read me'); const sha = hash(bytes); const c = context({ existing: { body: bytes, contentType: 'application/xml', eTag: null, lastModified: new Date() } });
    const stored = await c.service.storeImmutable(input({ bytes, expectedSha256: sha }));
    await expectCode(c.service.readImmutable({ ...input({ bytes, expectedSha256: sha }), storageProvider: stored.storageProvider, storageKey: 'production/other' }), 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    c.storage.readObjectWithMetadata.mockRejectedValueOnce(new StorageObjectCapacityError());
    await expectCode(c.service.readImmutable({ ...input({ bytes, expectedSha256: sha }), storageProvider: stored.storageProvider, storageKey: stored.storageKey }), 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_CAPACITY_EXCEEDED');
    c.storage.readObjectWithMetadata.mockRejectedValueOnce(new Error('sdk secret object key'));
    const error = await capture(c.service.readImmutable({ ...input({ bytes, expectedSha256: sha }), storageProvider: stored.storageProvider, storageKey: stored.storageKey }));
    expect(error.message).toBe('IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE'); expect(error.message).not.toMatch(/sdk|secret|object/i);
  });
});

function input(overrides: Record<string, unknown> = {}) {
  const bytes = (overrides.bytes as Buffer | undefined) ?? Buffer.from('artifact bytes');
  return { tenantId: 'tenant_a', billingDocumentId: 'document_a', artifactType: 'SIGNED_FISCAL_XML' as const, artifactVersion: 1, expectedSha256: hash(bytes), mimeType: 'application/xml', bytes, ...overrides } as const;
}
function hash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function context(options: { putError?: unknown; existing?: { body: Buffer; contentType: string | null; eTag?: string | null; lastModified: Date | null } } = {}) {
  const storage = { putObjectIfAbsent: jest.fn().mockImplementation(async () => { if (options.putError) throw options.putError; return { eTag: 'etag-created' }; }), readObjectWithMetadata: jest.fn().mockResolvedValue(options.existing ?? { body: Buffer.from('artifact bytes'), contentType: 'application/xml', eTag: 'etag-existing', lastModified: new Date('2026-09-09T00:00:00.000Z') }) };
  const config = { get: jest.fn().mockReturnValue('production') };
  return { service: new ImmutableBillingArtifactStorageAdapter(storage as unknown as StorageService, config as unknown as ConfigService), storage };
}
async function expectCode(value: Promise<unknown>, code: string) { await expect(value).rejects.toMatchObject({ code }); }
async function capture(value: Promise<unknown>): Promise<Error> { try { await value; throw new Error('expected error'); } catch (error) { return error as Error; } }
