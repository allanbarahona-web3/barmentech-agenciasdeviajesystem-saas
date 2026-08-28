import { SaxesParser, type SaxesTagNS } from 'saxes';

export type FiscalXmlArtifactType = 'SIGNED_FISCAL_XML' | 'TAX_AUTHORITY_RESPONSE_XML';
export type FiscalXmlTerminalStatus = 'ACCEPTED' | 'REJECTED';

export interface FiscalXmlIdentityValidationInput {
  readonly artifactType: FiscalXmlArtifactType;
  readonly documentTypeCode: '01' | '04';
  readonly fiscalNumber: string;
  readonly haciendaKey: string;
  readonly taxAuthorityStatus: FiscalXmlTerminalStatus;
  readonly bytes: Buffer;
  readonly normalizedMimeType: 'application/xml' | 'text/xml';
}

export interface FiscalXmlIdentityValidationResult {
  readonly artifactType: FiscalXmlArtifactType;
  readonly documentTypeCode: '01' | '04';
  readonly haciendaKey: string;
  readonly fiscalNumber?: string;
  readonly terminalResponseStatus?: 'aceptado' | 'rechazado';
}

export type FiscalXmlIdentityValidationErrorCode =
  | 'FISCAL_XML_IDENTITY_MALFORMED_XML'
  | 'FISCAL_XML_IDENTITY_UNSAFE_XML'
  | 'FISCAL_XML_IDENTITY_UNSUPPORTED_DOCUMENT_TYPE'
  | 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'
  | 'FISCAL_XML_IDENTITY_MISSING_IDENTITY'
  | 'FISCAL_XML_IDENTITY_DUPLICATE_IDENTITY'
  | 'FISCAL_XML_IDENTITY_HACIENDA_KEY_MISMATCH'
  | 'FISCAL_XML_IDENTITY_FISCAL_NUMBER_MISMATCH'
  | 'FISCAL_XML_IDENTITY_TERMINAL_STATUS_MISMATCH'
  | 'FISCAL_XML_IDENTITY_CAPACITY_OR_MIME_FAILURE';

export class FiscalXmlIdentityValidationError extends Error {
  constructor(readonly code: FiscalXmlIdentityValidationErrorCode) {
    super(code);
    this.name = 'FiscalXmlIdentityValidationError';
  }
}

export interface FiscalXmlIdentityValidatorLimits {
  readonly maximumDepth?: number;
  readonly maximumElements?: number;
  readonly maximumIdentityTextLength?: number;
}

const MAXIMUM_BYTES = 5 * 1024 * 1024;
const DEFAULT_LIMITS = { maximumDepth: 64, maximumElements: 10_000, maximumIdentityTextLength: 256 } as const;
const SIGNED_DOCUMENTS = {
  '01': { root: 'FacturaElectronica', namespace: 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica' },
  '04': { root: 'TiqueteElectronico', namespace: 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico' },
} as const;
const RESPONSE_ROOT = { root: 'MensajeHacienda', namespace: 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda' } as const;

export class FiscalXmlIdentityValidator {
  private readonly limits: Required<FiscalXmlIdentityValidatorLimits>;

  constructor(limits: FiscalXmlIdentityValidatorLimits = {}) {
    this.limits = {
      maximumDepth: positiveInteger(limits.maximumDepth, DEFAULT_LIMITS.maximumDepth),
      maximumElements: positiveInteger(limits.maximumElements, DEFAULT_LIMITS.maximumElements),
      maximumIdentityTextLength: positiveInteger(limits.maximumIdentityTextLength, DEFAULT_LIMITS.maximumIdentityTextLength),
    };
  }

  validate(input: FiscalXmlIdentityValidationInput): FiscalXmlIdentityValidationResult {
    validateInput(input);
    const xml = decodeUtf8(input.bytes);
    const expected = input.artifactType === 'SIGNED_FISCAL_XML' ? SIGNED_DOCUMENTS[input.documentTypeCode] : RESPONSE_ROOT;
    if (!expected) fail('FISCAL_XML_IDENTITY_UNSUPPORTED_DOCUMENT_TYPE');

    let failure: FiscalXmlIdentityValidationErrorCode | null = null;
    let depth = 0;
    let elementCount = 0;
    let rootSeen = false;
    let rootClosed = false;
    let activeIdentity: 'Clave' | 'NumeroConsecutivo' | 'IndEstado' | null = null;
    let identityDepth = 0;
    const values = new Map<'Clave' | 'NumeroConsecutivo' | 'IndEstado', string>();
    const counts = new Map<'Clave' | 'NumeroConsecutivo' | 'IndEstado', number>();
    const setFailure = (code: FiscalXmlIdentityValidationErrorCode) => { if (!failure) failure = code; };
    const parser = new SaxesParser({ xmlns: true, fragment: false, position: false });

    parser.on('xmldecl', (declaration) => {
      if (declaration.encoding && !/^utf-?8$/i.test(declaration.encoding)) setFailure('FISCAL_XML_IDENTITY_MALFORMED_XML');
    });
    parser.on('doctype', () => setFailure('FISCAL_XML_IDENTITY_UNSAFE_XML'));
    parser.on('processinginstruction', () => setFailure('FISCAL_XML_IDENTITY_UNSAFE_XML'));
    parser.on('error', () => setFailure('FISCAL_XML_IDENTITY_MALFORMED_XML'));
    parser.on('opentag', (tag) => {
      if (failure) return;
      depth += 1;
      elementCount += 1;
      if (depth > this.limits.maximumDepth || elementCount > this.limits.maximumElements) {
        setFailure('FISCAL_XML_IDENTITY_UNSAFE_XML'); return;
      }
      if (!rootSeen) {
        rootSeen = true;
        if (tag.local !== expected.root || tag.uri !== expected.namespace) setFailure('FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE');
        return;
      }
      if (rootClosed) { setFailure('FISCAL_XML_IDENTITY_MALFORMED_XML'); return; }
      if (activeIdentity && depth > identityDepth) { setFailure('FISCAL_XML_IDENTITY_UNSAFE_XML'); return; }
      const identity = identityFor(tag, input.artifactType);
      if (!identity) return;
      if (depth !== 2 || tag.uri !== expected.namespace) {
        setFailure('FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'); return;
      }
      const count = (counts.get(identity) ?? 0) + 1;
      counts.set(identity, count);
      if (count > 1) { setFailure('FISCAL_XML_IDENTITY_DUPLICATE_IDENTITY'); return; }
      activeIdentity = identity;
      identityDepth = depth;
      values.set(identity, '');
    });
    const appendIdentityText = (text: string) => {
      if (failure || !activeIdentity) return;
      const current = (values.get(activeIdentity) ?? '') + text;
      if (current.length > this.limits.maximumIdentityTextLength) { setFailure('FISCAL_XML_IDENTITY_UNSAFE_XML'); return; }
      values.set(activeIdentity, current);
    };
    parser.on('text', appendIdentityText);
    parser.on('cdata', appendIdentityText);
    parser.on('closetag', () => {
      if (failure) return;
      if (activeIdentity && depth === identityDepth) activeIdentity = null;
      depth -= 1;
      if (depth === 0) rootClosed = true;
      if (depth < 0) setFailure('FISCAL_XML_IDENTITY_MALFORMED_XML');
    });

    try { parser.write(xml).close(); } catch { setFailure('FISCAL_XML_IDENTITY_MALFORMED_XML'); }
    if (failure) fail(failure);
    if (!rootSeen || !rootClosed || depth !== 0) fail('FISCAL_XML_IDENTITY_MALFORMED_XML');
    const clave = required(values, counts, 'Clave');
    if (clave !== input.haciendaKey) fail('FISCAL_XML_IDENTITY_HACIENDA_KEY_MISMATCH');

    if (input.artifactType === 'SIGNED_FISCAL_XML') {
      const fiscalNumber = required(values, counts, 'NumeroConsecutivo');
      if (fiscalNumber !== input.fiscalNumber) fail('FISCAL_XML_IDENTITY_FISCAL_NUMBER_MISMATCH');
      return { artifactType: input.artifactType, documentTypeCode: input.documentTypeCode, haciendaKey: input.haciendaKey, fiscalNumber };
    }

    const responseStatus = required(values, counts, 'IndEstado');
    const expectedStatus = input.taxAuthorityStatus === 'ACCEPTED' ? 'aceptado' : 'rechazado';
    if (responseStatus !== expectedStatus) fail('FISCAL_XML_IDENTITY_TERMINAL_STATUS_MISMATCH');
    return { artifactType: input.artifactType, documentTypeCode: input.documentTypeCode, haciendaKey: input.haciendaKey, terminalResponseStatus: expectedStatus };
  }
}

export function validateFiscalXmlIdentity(input: FiscalXmlIdentityValidationInput): FiscalXmlIdentityValidationResult {
  return new FiscalXmlIdentityValidator().validate(input);
}

function identityFor(tag: SaxesTagNS, artifactType: FiscalXmlArtifactType): 'Clave' | 'NumeroConsecutivo' | 'IndEstado' | null {
  if (artifactType === 'SIGNED_FISCAL_XML') return tag.local === 'Clave' || tag.local === 'NumeroConsecutivo' ? tag.local : null;
  return tag.local === 'Clave' || tag.local === 'IndEstado' ? tag.local : null;
}

function required(values: Map<string, string>, counts: Map<string, number>, key: string): string {
  if ((counts.get(key) ?? 0) === 0 || !values.get(key)?.trim()) fail('FISCAL_XML_IDENTITY_MISSING_IDENTITY');
  return values.get(key)!.trim();
}

function validateInput(input: FiscalXmlIdentityValidationInput): void {
  if (!record(input) || !Buffer.isBuffer(input.bytes) || input.bytes.length === 0 || input.bytes.length > MAXIMUM_BYTES ||
    (input.artifactType !== 'SIGNED_FISCAL_XML' && input.artifactType !== 'TAX_AUTHORITY_RESPONSE_XML') ||
    (input.documentTypeCode !== '01' && input.documentTypeCode !== '04') ||
    (input.taxAuthorityStatus !== 'ACCEPTED' && input.taxAuthorityStatus !== 'REJECTED') ||
    (input.normalizedMimeType !== 'application/xml' && input.normalizedMimeType !== 'text/xml') ||
    !nonEmptyBounded(input.fiscalNumber, 20) || !nonEmptyBounded(input.haciendaKey, 50)) fail('FISCAL_XML_IDENTITY_CAPACITY_OR_MIME_FAILURE');
}

function decodeUtf8(bytes: Buffer): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('FISCAL_XML_IDENTITY_UNSAFE_XML');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('FISCAL_XML_IDENTITY_MALFORMED_XML'); }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new FiscalXmlIdentityValidationError('FISCAL_XML_IDENTITY_UNSAFE_XML');
  return value;
}
function nonEmptyBounded(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function fail(code: FiscalXmlIdentityValidationErrorCode): never { throw new FiscalXmlIdentityValidationError(code); }
