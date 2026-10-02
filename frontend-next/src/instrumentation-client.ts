import { operationsTimingEnabled } from './lib/operations-performance';

if (operationsTimingEnabled()) {
  performance.mark('operations-timing:client-ready');
}

export function onRouterTransitionStart(url: string, navigationType: 'push' | 'replace' | 'traverse') {
  if (!operationsTimingEnabled() || !url.startsWith('/operations')) return;
  performance.mark(`operations-timing:navigation:${navigationType}`);
  console.info('[operations-timing]', {
    layer: 'navigation',
    navigationType,
    destination: '/operations',
  });
}
