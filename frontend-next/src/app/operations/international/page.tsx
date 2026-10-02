import { OperationsTravelPackageList } from '@/components/operations/operations-travel-package-list';
import { OperationsAccessGate } from '@/components/operations/operations-access-gate';

export const dynamic = 'force-dynamic';
export default function OperationsInternationalPage() { return <OperationsAccessGate><OperationsTravelPackageList travelType="INTERNATIONAL" /></OperationsAccessGate>; }
