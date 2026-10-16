'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getStoredSession } from '@/lib/auth-api';

const CUSTOMER_PROFILE_ROLES = new Set(['ADMIN', 'AGENT', 'FACTURACION_COBROS']);
const LEAD_DETAIL_ROLES = new Set(['ADMIN', 'AGENT']);

function useCurrentRole() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(String(getStoredSession()?.user?.role ?? '').toUpperCase() || null);
  }, []);

  return role;
}

export function CustomerProfileLink({ customerId }: { customerId: string | null | undefined }) {
  const role = useCurrentRole();
  if (!customerId || !role || !CUSTOMER_PROFILE_ROLES.has(role)) return null;

  return (
    <Button asChild type="button" variant="outline" size="sm">
      <Link href={`/admin/customers/${encodeURIComponent(customerId)}`} target="_blank" rel="noopener noreferrer">
        Ver cliente
        <ExternalLink aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function LeadDetailLink({ leadId }: { leadId: string | null | undefined }) {
  const role = useCurrentRole();
  if (!leadId || !role || !LEAD_DETAIL_ROLES.has(role)) return null;

  return (
    <Button asChild type="button" variant="outline" size="sm">
      <Link href={`/leads/${encodeURIComponent(leadId)}`} target="_blank" rel="noopener noreferrer">
        Ver prospecto
        <ExternalLink aria-hidden="true" />
      </Link>
    </Button>
  );
}
