import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('PERF5 browser instrumentation is explicit, scoped, and reports response timing without identifiers', async () => {
  const source = await read('src/lib/operations-performance.ts');
  assert.match(source, /NEXT_PUBLIC_OPERATIONS_TIMING === '1'/);
  assert.match(source, /pathname\.startsWith\('\/operations\/'\)/);
  assert.match(source, /fetchResponseMs/);
  assert.match(source, /ttfbMs/);
  assert.match(source, /totalResponseMs/);
  assert.match(source, /transferBytes/);
  assert.match(source, /serverTiming/);
  assert.doesNotMatch(source, /console\.info\([^\n]*url/);
});

test('PERF5 instruments both Operations fetch paths and the visible workspace commits', async () => {
  const [apiClient, authApi, shell] = await Promise.all([
    read('src/lib/api-client.ts'),
    read('src/lib/auth-api.ts'),
    read('src/components/operations/operations-trip-shell.tsx'),
  ]);
  assert.match(apiClient, /recordOperationsFetchTiming/);
  assert.match(authApi, /recordOperationsFetchTiming/);
  assert.match(shell, /operations-trip-header/);
  assert.match(shell, /operations-readiness-dashboard/);
  assert.match(shell, /operations-unified-workspace/);
});
