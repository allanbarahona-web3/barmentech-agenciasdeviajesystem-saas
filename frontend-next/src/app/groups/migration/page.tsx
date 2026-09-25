import { GroupingTravelPackageList } from '@/components/passenger-groups/grouping-travel-package-list';

export const dynamic = 'force-dynamic';

export default function MigrationGroupsPage() {
  return <GroupingTravelPackageList travelType="MIGRATION" />;
}
