import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(new URL('../src/app/custom-quotations/[id]/page.tsx', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test('la carga inicial inicia raíz y líneas comerciales sin dependencia serial', () => {
  const initialLoad = sourceBetween(detail, 'const load = useCallback', 'const handleCompositionChanged');
  assert.ok(initialLoad.indexOf('void loadCommercialLines();') < initialLoad.indexOf('await refreshQuotation();'));
  assert.doesNotMatch(initialLoad, /await loadCommercialLines\(\)/);
  const rootRefresh = sourceBetween(detail, 'const refreshQuotation = useCallback', 'const load = useCallback');
  assert.doesNotMatch(rootRefresh, /getCustomQuotationCommercialLines/);
  assert.match(detail, /commercialLinesError \? <Alert variant="destructive"/);
});

test('Cotización conserva el componente visitado y deduplica latest/proposal durante la sesión', () => {
  assert.match(detail, /const \[quoteVisited, setQuoteVisited\] = useState\(false\)/);
  assert.match(detail, /quoteVisited \? <div hidden=\{activeTab !== 'QUOTE'\}><CustomQuotationProposalTab/);
  assert.doesNotMatch(detail, /activeTab === 'QUOTE' \? <CustomQuotationProposalTab/);
  assert.match(proposalTab, /const latestLifecycleKeyRef = useRef<string \| null>\(null\)/);
  assert.match(proposalTab, /if \(latestLifecycleKeyRef\.current === lifecycleKey\(quotation\.id, quotation\.status\)\) return/);
  assert.match(proposalTab, /const latestRequestRef = useRef<Promise<CustomQuotationVersion> \| null>\(null\)/);
  assert.match(proposalTab, /const proposalCacheRef = useRef\(new Map<string, CustomQuotationProposalDocument \| null>\(\)\)/);
  assert.match(proposalTab, /if \(!force && proposalCacheRef\.current\.has\(versionId\)\)/);
  assert.match(proposalTab, /const proposalRequestRef = useRef\(new Map<string, Promise<CustomQuotationProposalDocument \| null>>\(\)\)/);
  assert.doesNotMatch(proposalTab, /activeTab/);
});

test('ISSUE tiene una única ruta de refresco y las mutaciones invalidan sólo estado afectado', () => {
  const issue = sourceBetween(proposalTab, 'async function issue()', 'async function generateProposal()');
  assert.match(issue, /await issueCustomQuotation\(quotation\.id\)/);
  assert.match(issue, /await refreshVersion\(\{ loadDocument: true \}\)/);
  assert.match(issue, /await onIssued\(\)/);
  assert.doesNotMatch(issue, /getLatestCustomQuotationVersion/);
  const decision = sourceBetween(proposalTab, 'async function submitManualDecision()', 'if \(draft\)');
  assert.match(decision, /await refreshVersion\(\)/);
  assert.match(decision, /await onQuotationRefreshed\(\)/);
  const generation = sourceBetween(proposalTab, 'async function generateProposal()', 'async function sendProposal()');
  assert.match(generation, /await loadProposal\(version\.versionId, true\)/);
  assert.match(completion, /const persistedVersion = await onVersionRefreshed\(\)/);
  assert.doesNotMatch(completion, /getLatestCustomQuotationVersion/);
});

test('fallos secundarios se mantienen locales y la propuesta se vuelve a leer sólo explícitamente', () => {
  assert.match(proposalTab, /setProposalError\('No se pudo cargar el documento de la propuesta\.'/);
  assert.match(proposalTab, /No se pudo cargar la propuesta/);
  assert.match(proposalTab, /Reintentar cargar propuesta/);
  assert.match(proposalTab, /value\.status === 'ISSUED' && loadDocument/);
  assert.match(proposalTab, /generateCustomQuotationProposal[\s\S]*await loadProposal\(version\.versionId, true\)/);
});
