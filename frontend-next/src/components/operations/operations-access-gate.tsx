'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_SESSION_CHANGED_EVENT, getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { PageLoader } from '@/components/loading-spinner';

const allowedRoles = new Set(['ADMIN', 'OPERACIONES']);

export function OperationsAccessGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [access, setAccess] = useState<'resolving' | 'authorized' | 'unauthorized'>('resolving');

  useEffect(() => {
    function resolveAccess() {
      const session = getStoredSession();
      const role = String(session?.user?.role || '').toUpperCase();
      if (!session?.user?.id) { setAccess('unauthorized'); router.replace('/'); return; }
      if (!allowedRoles.has(role)) { setAccess('unauthorized'); router.replace(getHomeRouteForRole(role)); return; }
      setAccess('authorized');
    }
    resolveAccess();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, resolveAccess);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, resolveAccess);
  }, [router]);

  if (access !== 'authorized') return <PageLoader message="Verificando acceso..." />;
  return <>{children}</>;
}
