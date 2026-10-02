import { OperationsTripShell } from '@/components/operations/operations-trip-shell';
import { OperationsAccessGate } from '@/components/operations/operations-access-gate';

export const dynamic = 'force-dynamic';
export default async function OperationsTripPage({ params }: { params: Promise<{ travelPackageId: string }> }) { const { travelPackageId } = await params; return <OperationsAccessGate><OperationsTripShell travelPackageId={travelPackageId} /></OperationsAccessGate>; }
