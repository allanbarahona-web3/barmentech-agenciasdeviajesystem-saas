import { OperationsAccessGate } from '@/components/operations/operations-access-gate';
import { StandaloneOperationalRequirementsWorkspace } from '@/components/operations/standalone-operational-requirements-workspace';

export const dynamic = 'force-dynamic';

export default function StandaloneOperationsPage() {
  return <OperationsAccessGate><StandaloneOperationalRequirementsWorkspace /></OperationsAccessGate>;
}
