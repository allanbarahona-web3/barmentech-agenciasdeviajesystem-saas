"use client";

export const dynamic = 'force-dynamic';

import { TravelPackagesManager } from "@/components/travel-packages-manager";

export default function MigrationTripsPage() {
  return <TravelPackagesManager travelType="MIGRATION" title="Viajes de Migración" icon="🛂" />;
}
