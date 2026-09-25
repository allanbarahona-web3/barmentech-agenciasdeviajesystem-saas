import { PassengerGroupsWorkspace } from '@/components/passenger-groups/passenger-groups-workspace';

export const dynamic = 'force-dynamic';

export default async function PassengerGroupsPage({
  params,
}: {
  params: Promise<{ travelPackageId: string }>;
}) {
  const { travelPackageId } = await params;
  return <PassengerGroupsWorkspace travelPackageId={travelPackageId} />;
}
