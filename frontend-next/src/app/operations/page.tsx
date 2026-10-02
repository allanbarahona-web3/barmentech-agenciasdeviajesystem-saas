import { OperationsLanding } from '@/components/operations/operations-landing';
import { OperationsAccessGate } from '@/components/operations/operations-access-gate';

export const dynamic = 'force-dynamic';
export default function OperationsPage() { return <OperationsAccessGate><OperationsLanding /></OperationsAccessGate>; }
