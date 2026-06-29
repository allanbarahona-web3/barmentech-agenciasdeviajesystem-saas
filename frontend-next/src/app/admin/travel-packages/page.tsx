"use client";

export const dynamic = 'force-dynamic';

import { TravelPackagesManager } from "@/components/travel-packages-manager";

export default function TravelPackagesPage() {
  return <TravelPackagesManager travelType="INTERNATIONAL" title="Viajes Internacionales" icon="✈️" />;
}
