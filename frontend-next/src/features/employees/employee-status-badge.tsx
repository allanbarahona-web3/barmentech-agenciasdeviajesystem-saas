import { Badge } from '@/components/ui/badge';

function EmployeeStatusBadge({ status }: { status: string }) {
  const normalized = String(status || '').toUpperCase();
  const variant = normalized === 'ACTIVO' ? 'success' : normalized === 'SUSPENDIDO' ? 'warning' : 'destructive';

  return <Badge variant={variant}>{status}</Badge>;
}

export { EmployeeStatusBadge };
