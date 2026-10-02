'use client';

import { Profiler, type ReactNode } from 'react';
import { operationsTimingEnabled } from '@/lib/operations-performance';

export function OperationsTimingProfiler({ id, children }: { id: string; children: ReactNode }) {
  if (!operationsTimingEnabled()) return children;

  return <Profiler id={id} onRender={(profilerId, phase, actualDuration, baseDuration, startTime, commitTime) => {
    console.info('[operations-timing]', {
      layer: 'react-render',
      id: profilerId,
      phase,
      actualDurationMs: round(actualDuration),
      baseDurationMs: round(baseDuration),
      startTimeMs: round(startTime),
      commitTimeMs: round(commitTime),
    });
  }}>{children}</Profiler>;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
