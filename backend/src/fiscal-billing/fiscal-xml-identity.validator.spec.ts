import {
  FiscalXmlIdentityValidationError,
  FiscalXmlIdentityValidator,
  validateFiscalXmlIdentity,
  type FiscalXmlIdentityValidationInput,
} from './fiscal-xml-identity.validator';

const KEY = '50624072600310167816600100001010000000866142351111';
const NUMBER = '00100001010000000866';

describe('FiscalXmlIdentityValidator', () => {
  it('validates a v4.4 Factura Electronica identity deterministically', () => {
    const input = signed('01'); const result = validateFiscalXmlIdentity(input);
    expect(result).toEqual({ artifactType: 'SIGNED_FISCAL_XML', documentTypeCode: '01', haciendaKey: KEY, fiscalNumber: NUMBER });
  });

  it('validates a v4.4 Tiquete Electronico identity', () => {
    expect(validateFiscalXmlIdentity(signed('04'))).toEqual(expect.objectContaining({ documentTypeCode: '04', fiscalNumber: NUMBER }));
  });

  it.each([['ACCEPTED', 'aceptado'], ['REJECTED', 'rechazado']] as const)('validates a %s MensajeHacienda response', (taxAuthorityStatus, state) => {
    expect(validateFiscalXmlIdentity(response(taxAuthorityStatus, state))).toEqual({ artifactType: 'TAX_AUTHORITY_RESPONSE_XML', documentTypeCode: '01', haciendaKey: KEY, terminalResponseStatus: state });
  });

  it.each([
    ['Clave', signed('01', '<Clave><![CDATA[' + KEY + ']]></Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>')],
    ['NumeroConsecutivo', signed('01', '<Clave>' + KEY + '</Clave><NumeroConsecutivo><![CDATA[' + NUMBER + ']]></NumeroConsecutivo>')],
    ['IndEstado', response('ACCEPTED', '<![CDATA[aceptado]]>')],
  ])('accepts CDATA character content in direct %s identities', (_, value) => expect(() => validateFiscalXmlIdentity(value)).not.toThrow());

  it('accumulates ordinary text and CDATA chunks in one direct identity', () => {
    expect(validateFiscalXmlIdentity(signed('01', '<Clave> ' + KEY.slice(0, 20) + '<![CDATA[' + KEY.slice(20) + ']]> </Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'))).toEqual(expect.objectContaining({ haciendaKey: KEY }));
  });

  it.each([
    ['nested CDATA', signed('01', '<Clave><x><![CDATA[' + KEY + ']]></x></Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>')],
    ['wrong namespace CDATA', signed('01', '<bad:Clave xmlns:bad="urn:bad"><![CDATA[' + KEY + ']]></bad:Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>')],
  ])('does not allow %s to satisfy an identity', (_, value) => expectCode(() => validateFiscalXmlIdentity(value), 'FISCAL_XML_IDENTITY_' + (_ === 'nested CDATA' ? 'UNSAFE_XML' : 'WRONG_ROOT_OR_NAMESPACE')));

  it('accepts correctly bound prefixes and rejects a rebound identity namespace', () => {
    const ns = signedNamespace('01');
    const prefixed = `<?xml version="1.0"?><fe:FacturaElectronica xmlns:fe="${ns}"><fe:Clave>${KEY}</fe:Clave><fe:NumeroConsecutivo>${NUMBER}</fe:NumeroConsecutivo></fe:FacturaElectronica>`;
    expect(validateFiscalXmlIdentity(input({ bytes: Buffer.from(prefixed) }))).toEqual(expect.objectContaining({ fiscalNumber: NUMBER }));
    const rebound = `<?xml version="1.0"?><fe:FacturaElectronica xmlns:fe="${ns}"><fe:Clave xmlns:fe="urn:bad">${KEY}</fe:Clave><fe:NumeroConsecutivo>${NUMBER}</fe:NumeroConsecutivo></fe:FacturaElectronica>`;
    expectCode(() => validateFiscalXmlIdentity(input({ bytes: Buffer.from(rebound) })), 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE');
  });

  it('accepts XML declarations and realistic v4.4-shaped synthetic documents', () => {
    expect(() => validateFiscalXmlIdentity(input({ bytes: Buffer.from(realisticSigned('01')) }))).not.toThrow();
    expect(() => validateFiscalXmlIdentity(input({ documentTypeCode: '04', bytes: Buffer.from(realisticSigned('04')) }))).not.toThrow();
    expect(() => validateFiscalXmlIdentity(input({ artifactType: 'TAX_AUTHORITY_RESPONSE_XML', bytes: Buffer.from(realisticResponse()) }))).not.toThrow();
  });

  it.each([
    ['wrong key', signed('01', '<Clave>other</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_HACIENDA_KEY_MISMATCH'],
    ['wrong number', signed('01', '<Clave>' + KEY + '</Clave><NumeroConsecutivo>other</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_FISCAL_NUMBER_MISMATCH'],
    ['wrong response status', response('ACCEPTED', 'rechazado'), 'FISCAL_XML_IDENTITY_TERMINAL_STATUS_MISMATCH'],
  ])('compares exact authoritative identity: %s', (_, input, code) => expectCode(() => validateFiscalXmlIdentity(input), code));

  it.each([
    ['wrong root', signedXml('Other', signedNamespace('01'), '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'],
    ['missing namespace', signedXml('FacturaElectronica', '', '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'],
    ['wrong namespace', signedXml('FacturaElectronica', 'https://wrong.example/xml', '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'],
    ['missing Clave', signed('01', '<NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_MISSING_IDENTITY'],
    ['duplicate Clave', signed('01', '<Clave>' + KEY + '</Clave><Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_DUPLICATE_IDENTITY'],
    ['missing consecutive', signed('01', '<Clave>' + KEY + '</Clave>'), 'FISCAL_XML_IDENTITY_MISSING_IDENTITY'],
    ['duplicate consecutive', signed('01', '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_DUPLICATE_IDENTITY'],
  ])('rejects root, namespace, and identity defects: %s', (_, xml, code) => expectCode(() => validateFiscalXmlIdentity(typeof xml === 'string' ? input({ bytes: Buffer.from(xml) }) : xml), code));

  it.each([
    ['DOCTYPE', '<!DOCTYPE x [<!ENTITY x "unsafe">]>' + signedXml('FacturaElectronica', signedNamespace('01'), '<Clave>&x;</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_UNSAFE_XML'],
    ['processing instruction', '<?evil data?>' + signedXml('FacturaElectronica', signedNamespace('01'), '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_UNSAFE_XML'],
    ['wrong-namespace identity', signedXml('FacturaElectronica', signedNamespace('01'), '<bad:Clave xmlns:bad="urn:bad">' + KEY + '</bad:Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_WRONG_ROOT_OR_NAMESPACE'],
    ['nested identity spoof', signed('01', '<Clave><x>' + KEY + '</x></Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_UNSAFE_XML'],
    ['second document', signedXml('FacturaElectronica', signedNamespace('01'), '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>') + signedXml('FacturaElectronica', signedNamespace('01'), '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>'), 'FISCAL_XML_IDENTITY_MALFORMED_XML'],
  ])('rejects unsafe or ambiguous XML: %s', (_, xml, code) => expectCode(() => validateFiscalXmlIdentity(typeof xml === 'string' ? input({ bytes: Buffer.from(xml) }) : xml), code));

  it('rejects malformed and invalid UTF-8 XML without exposing parser details', () => {
    expectCode(() => validateFiscalXmlIdentity(input({ bytes: Buffer.from(`<FacturaElectronica xmlns="${signedNamespace('01')}">`) })), 'FISCAL_XML_IDENTITY_MALFORMED_XML');
    expectCode(() => validateFiscalXmlIdentity(input({ bytes: Buffer.from([0xc3, 0x28]) })), 'FISCAL_XML_IDENTITY_MALFORMED_XML');
  });

  it.each([
    ['invalid MIME', input({ normalizedMimeType: 'application/pdf' as never }), 'FISCAL_XML_IDENTITY_CAPACITY_OR_MIME_FAILURE'],
    ['empty', input({ bytes: Buffer.alloc(0) }), 'FISCAL_XML_IDENTITY_CAPACITY_OR_MIME_FAILURE'],
    ['over capacity', input({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }), 'FISCAL_XML_IDENTITY_CAPACITY_OR_MIME_FAILURE'],
  ])('enforces MIME and byte capacity: %s', (_, invalidInput, code) => expectCode(() => validateFiscalXmlIdentity(invalidInput), code));

  it('enforces configured depth, element, and identity text limits', () => {
    expectCode(() => new FiscalXmlIdentityValidator({ maximumDepth: 2 }).validate(signed('01', '<Clave>' + KEY + '</Clave><NumeroConsecutivo><x>' + NUMBER + '</x></NumeroConsecutivo>')), 'FISCAL_XML_IDENTITY_UNSAFE_XML');
    expectCode(() => new FiscalXmlIdentityValidator({ maximumElements: 2 }).validate(signed('01')), 'FISCAL_XML_IDENTITY_UNSAFE_XML');
    expectCode(() => new FiscalXmlIdentityValidator({ maximumIdentityTextLength: 3 }).validate(signed('01')), 'FISCAL_XML_IDENTITY_UNSAFE_XML');
  });

  it('does not mutate inputs or access integration boundaries', () => {
    const value = signed('01'); const before = Buffer.from(value.bytes); const result = validateFiscalXmlIdentity(value);
    expect(value.bytes).toEqual(before); expect(result).not.toHaveProperty('bytes'); expect(result).not.toHaveProperty('parsed');
  });

  it('serializes stable errors without XML, identity, parser cause, or stack', () => {
    let error: unknown;
    try { validateFiscalXmlIdentity(input({ bytes: Buffer.from(`<FacturaElectronica xmlns="${signedNamespace('01')}">${KEY}`) })); } catch (caught) { error = caught; }
    const serialized = JSON.stringify(error);
    expect(serialized).toContain('FISCAL_XML_IDENTITY_MALFORMED_XML');
    expect(serialized).not.toMatch(new RegExp(`${KEY}|stack|cause`, 'i'));
  });
});

function input(overrides: Record<string, unknown> = {}): FiscalXmlIdentityValidationInput {
  return { artifactType: 'SIGNED_FISCAL_XML', documentTypeCode: '01', fiscalNumber: NUMBER, haciendaKey: KEY, taxAuthorityStatus: 'ACCEPTED', bytes: Buffer.from(signedXml('FacturaElectronica', signedNamespace('01'), '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>')), normalizedMimeType: 'application/xml', ...overrides } as FiscalXmlIdentityValidationInput;
}
function signed(type: '01' | '04', children = '<Clave>' + KEY + '</Clave><NumeroConsecutivo>' + NUMBER + '</NumeroConsecutivo>') { return input({ documentTypeCode: type, bytes: Buffer.from(signedXml(type === '01' ? 'FacturaElectronica' : 'TiqueteElectronico', signedNamespace(type), children)) }); }
function response(status: 'ACCEPTED' | 'REJECTED', state: string) { return input({ artifactType: 'TAX_AUTHORITY_RESPONSE_XML', taxAuthorityStatus: status, bytes: Buffer.from(signedXml('MensajeHacienda', 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda', '<Clave>' + KEY + '</Clave><IndEstado>' + state + '</IndEstado>')) }); }
function signedNamespace(type: '01' | '04') { return `https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/${type === '01' ? 'facturaElectronica' : 'tiqueteElectronico'}`; }
function signedXml(root: string, namespace: string, children: string) { return `<?xml version="1.0" encoding="UTF-8"?><${root}${namespace ? ` xmlns="${namespace}"` : ''}>${children}</${root}>`; }
function realisticSigned(type: '01' | '04') { const root = type === '01' ? 'FacturaElectronica' : 'TiqueteElectronico'; return signedXml(root, signedNamespace(type), `<Clave>${KEY}</Clave><NumeroConsecutivo>${NUMBER}</NumeroConsecutivo><FechaEmision>2026-09-09T12:00:00-06:00</FechaEmision><Emisor><Nombre>Emisor Sintetico</Nombre><Identificacion><Tipo>02</Tipo><Numero>3101000000</Numero></Identificacion></Emisor><ResumenFactura><CodigoTipoMoneda>CRC</CodigoTipoMoneda><TotalComprobante>1.00000</TotalComprobante></ResumenFactura>`); }
function realisticResponse() { return signedXml('MensajeHacienda', 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda', `<Clave>${KEY}</Clave><Fecha>2026-09-09T12:00:00-06:00</Fecha><Emisor><Nombre>Emisor Sintetico</Nombre></Emisor><Receptor><Nombre>Receptor Sintetico</Nombre></Receptor><IndEstado>aceptado</IndEstado>`); }
function expectCode(action: () => unknown, code: string) { try { action(); throw new Error('expected error'); } catch (error) { expect(error).toBeInstanceOf(FiscalXmlIdentityValidationError); expect((error as FiscalXmlIdentityValidationError).code).toBe(code); expect(String((error as Error).message)).not.toContain(KEY); } }
