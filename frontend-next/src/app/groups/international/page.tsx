import { GroupingTravelPackageList } from '@/components/passenger-groups/grouping-travel-package-list';

export const dynamic = 'force-dynamic';

export default function InternationalGroupsPage() {
  return <GroupingTravelPackageList travelType="INTERNATIONAL" />;
}
