'use client';

type FetchTimingInput = {
  url: string;
  method: string | undefined;
  startedAt: number;
  response: Response;
};

export function operationsTimingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OPERATIONS_TIMING === '1';
}

export function recordOperationsFetchTiming({ url, method, startedAt, response }: FetchTimingInput): void {
  if (!operationsTimingEnabled() || !isOperationsUrl(url)) return;

  window.setTimeout(() => {
    const endedAt = performance.now();
    const resource = resourceTimingFor(url, startedAt);
    const resourceStart = resource?.startTime ?? startedAt;
    const responseStart = resource?.responseStart ?? 0;
    const responseEnd = resource?.responseEnd ?? 0;

    console.info('[operations-timing]', {
      layer: 'browser-fetch',
      endpoint: operationsEndpointLabel(url),
      method: String(method ?? 'GET').toUpperCase(),
      status: response.status,
      fetchResponseMs: round(endedAt - startedAt),
      ttfbMs: responseStart > 0 ? round(responseStart - resourceStart) : null,
      totalResponseMs: responseEnd > 0 ? round(responseEnd - resourceStart) : null,
      transferBytes: resource?.transferSize ?? null,
      encodedBodyBytes: resource?.encodedBodySize ?? null,
      decodedBodyBytes: resource?.decodedBodySize ?? null,
      serverTiming: response.headers.get('server-timing'),
    });
  }, 0);
}

function isOperationsUrl(url: string): boolean {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return pathname.startsWith('/operations/') || /^\/travel-packages\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}

function operationsEndpointLabel(url: string): string {
  const pathname = new URL(url, window.location.origin).pathname;
  if (/^\/travel-packages\/[^/]+$/.test(pathname)) return 'trip-context';
  if (pathname.endsWith('/passenger-roster')) return 'passenger-roster';
  if (pathname.endsWith('/commercial-context')) return 'commercial-context';
  if (pathname.endsWith('/work-items')) return 'work-items';
  if (pathname.endsWith('/readiness')) return 'readiness';
  if (pathname.endsWith('/passenger-matrix')) return 'passenger-matrix';
  if (pathname.includes('/purchases')) return 'purchases';
  if (pathname.includes('/evidence')) return 'evidence';
  if (pathname.includes('/fulfillments')) return 'fulfillments';
  if (pathname.includes('/requirements/')) return 'requirement';
  return 'operations-other';
}

function resourceTimingFor(url: string, startedAt: number): PerformanceResourceTiming | null {
  const entries = performance
    .getEntriesByName(url, 'resource')
    .filter((entry): entry is PerformanceResourceTiming => entry.entryType === 'resource' && entry.startTime >= startedAt - 1);
  return entries.at(-1) ?? null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
