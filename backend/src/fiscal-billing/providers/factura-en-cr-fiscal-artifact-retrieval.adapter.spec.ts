import type { ConfigService } from '@nestjs/config';
import {
  FiscalArtifactRetrievalError,
  type FiscalArtifactRetrievalInput,
} from './fiscal-artifact-retrieval.provider';
import { FacturaEnCrFiscalArtifactRetrievalAdapter } from './factura-en-cr-fiscal-artifact-retrieval.adapter';

const DOCUMENT_ID = '6a640c68a06e822633e9db71';

describe('FacturaEnCrFiscalArtifactRetrievalAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['SIGNED_FISCAL_XML', '/xml'],
    ['TAX_AUTHORITY_RESPONSE_XML', '/xml-respuesta'],
  ] as const)('uses the exact GET endpoint for %s', async (artifactType, suffix) => {
    const fetchMock = mockFetch(xmlResponse(Buffer.from('<xml/>')));
    await adapter().retrieveFiscalArtifact(input({ artifactType }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`https://api.facturaencr.com/v2/efactura/documents/${DOCUMENT_ID}${suffix}`);
    expect(init).toMatchObject({ method: 'GET', headers: { 'X-API-Key': 'key', 'X-API-Secret': 'secret', Accept: 'application/xml, text/xml' } });
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('preserves raw bytes, normalizes XML MIME, and returns a safe ETag', async () => {
    const bytes = Buffer.from([0x3c, 0x78, 0x6d, 0x6c, 0x2f, 0x3e, 0x00]);
    mockFetch(xmlResponse(bytes, 'text/xml; charset=UTF-8', { etag: '"etag-123"' }));
    const result = await adapter().retrieveFiscalArtifact(input());
    expect(result.bytes).toEqual(bytes); expect(result.normalizedMimeType).toBe('text/xml'); expect(result.sourceEtag).toBe('etag-123'); expect(result.retrievedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['empty', xmlResponse(Buffer.alloc(0))], ['HTML', xmlResponse(Buffer.from('<html/>'), 'text/html')],
    ['JSON', xmlResponse(Buffer.from('{}'), 'application/json')], ['PDF', xmlResponse(Buffer.from('%PDF'), 'application/pdf')],
    ['octet-stream', xmlResponse(Buffer.from('x'), 'application/octet-stream')],
  ])('rejects invalid %s provider content', async (_, response) => {
    mockFetch(response); await expectCode(adapter().retrieveFiscalArtifact(input()), 'FISCAL_ARTIFACT_RETRIEVAL_INVALID_PROVIDER_RESPONSE', false);
  });

  it('accepts exactly 5 MiB and rejects a larger declared or streamed response', async () => {
    const exact = Buffer.alloc(5 * 1024 * 1024, 1); mockFetch(xmlResponse(exact));
    const exactResult = await adapter().retrieveFiscalArtifact(input());
    expect(exactResult.bytes.byteLength).toBe(exact.byteLength); expect(exactResult.bytes[0]).toBe(1);
    jest.restoreAllMocks(); mockFetch(xmlResponse(Buffer.from('x'), 'application/xml', { 'content-length': String(5 * 1024 * 1024 + 1) }));
    await expectCode(adapter().retrieveFiscalArtifact(input()), 'FISCAL_ARTIFACT_RETRIEVAL_RESPONSE_TOO_LARGE', false);
    jest.restoreAllMocks(); mockFetch(xmlResponse(Buffer.alloc(5 * 1024 * 1024 + 1, 1)));
    await expectCode(adapter().retrieveFiscalArtifact(input()), 'FISCAL_ARTIFACT_RETRIEVAL_RESPONSE_TOO_LARGE', false);
  });

  it.each([
    ['429', 429, 'FISCAL_ARTIFACT_RETRIEVAL_RATE_LIMITED'], ['500', 500, 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE'],
    ['502', 502, 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE'], ['503', 503, 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE'], ['504', 504, 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE'],
  ])('classifies %s as retryable', async (_, status, code) => {
    mockFetch(new Response('secret provider body', { status, headers: { 'retry-after': '30' } }));
    const error = await capture(adapter().retrieveFiscalArtifact(input()));
    expectError(error, code, true); if (status === 429) expect(error.retryAfterSeconds).toBe(30);
  });

  it.each([
    [400, 'FISCAL_ARTIFACT_RETRIEVAL_REJECTED'], [401, 'FISCAL_ARTIFACT_RETRIEVAL_AUTHENTICATION_FAILED'],
    [403, 'FISCAL_ARTIFACT_RETRIEVAL_ACCESS_FORBIDDEN'], [404, 'FISCAL_ARTIFACT_RETRIEVAL_NOT_FOUND'], [422, 'FISCAL_ARTIFACT_RETRIEVAL_REJECTED'],
  ])('classifies HTTP %s as non-retryable without reading the provider body', async (status, code) => {
    mockFetch(new Response('provider-body-with-secret', { status }));
    const error = await capture(adapter().retrieveFiscalArtifact(input())); expectError(error, code, false); expect(JSON.stringify(error)).not.toContain('provider-body-with-secret');
  });

  it.each([
    new Error('network private secret'), Object.assign(new Error('timeout private secret'), { name: 'AbortError' }),
  ])('classifies network and timeout failures safely', async (failure) => {
    jest.spyOn(global, 'fetch').mockRejectedValue(failure);
    const error = await capture(adapter().retrieveFiscalArtifact(input()));
    expectError(error, failure.name === 'AbortError' ? 'FISCAL_ARTIFACT_RETRIEVAL_TIMEOUT' : 'FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true);
    expect(JSON.stringify(error)).not.toMatch(/private secret|key|secret/i);
  });

  it.each([
    { artifactType: 'INTERNAL_PDF' }, { artifactType: 'SIGNED_FISCAL_XML', providerEnvironment: 'other' },
    { providerDocumentId: '../document' }, { providerDocumentId: 'document/id' },
  ])('rejects unsupported or unsafe inputs before configuration or HTTP', async (override) => {
    const get = jest.fn(); const fetchMock = mockFetch(xmlResponse(Buffer.from('x')));
    await expectCode(new FacturaEnCrFiscalArtifactRetrievalAdapter({ get } as unknown as ConfigService).retrieveFiscalArtifact(input(override)), 'FISCAL_ARTIFACT_RETRIEVAL_LOCAL_REQUEST_INVALID', false);
    expect(get).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses only established configuration and leaves input immutable', async () => {
    const value = input(); const before = { ...value }; mockFetch(xmlResponse(Buffer.from('x')));
    await adapter().retrieveFiscalArtifact(value); expect(value).toEqual(before);
  });
});

function input(overrides: Record<string, unknown> = {}): FiscalArtifactRetrievalInput {
  return { providerDocumentId: DOCUMENT_ID, artifactType: 'SIGNED_FISCAL_XML', providerEnvironment: 'sandbox', ...overrides } as FiscalArtifactRetrievalInput;
}
function adapter(overrides: Record<string, unknown> = {}) {
  const values = { FACTURA_EN_CR_API_KEY: 'key', FACTURA_EN_CR_API_SECRET: 'secret', FACTURA_EN_CR_BASE_URL: 'https://api.facturaencr.com/v2/efactura', FACTURA_EN_CR_TIMEOUT_MS: '5000', ...overrides };
  return new FacturaEnCrFiscalArtifactRetrievalAdapter({ get: jest.fn((key: string, fallback: unknown) => key in values ? values[key as keyof typeof values] : fallback) } as unknown as ConfigService);
}
function xmlResponse(bytes: Buffer, mime = 'application/xml', headers: Record<string, string> = {}) { return new Response(bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': mime, ...headers } }); }
function mockFetch(value: Response) { return jest.spyOn(global, 'fetch').mockResolvedValue(value); }
async function capture(value: Promise<unknown>): Promise<FiscalArtifactRetrievalError> { try { await value; throw new Error('expected error'); } catch (error) { return error as FiscalArtifactRetrievalError; } }
function expectError(error: FiscalArtifactRetrievalError, code: string, retryable: boolean) { expect(error).toBeInstanceOf(FiscalArtifactRetrievalError); expect(error.code).toBe(code); expect(error.retryable).toBe(retryable); }
async function expectCode(value: Promise<unknown>, code: string, retryable: boolean) { expectError(await capture(value), code, retryable); }
