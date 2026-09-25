import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('Agrupaciones exposes international and migration flows while keeping national unavailable', () => {
  const landing = readSource('../src/components/passenger-groups/grouping-landing.tsx');

  assert.match(landing, /Internacionales/);
  assert.match(landing, /Migraciones/);
  assert.match(landing, /Nacionales/);
  assert.match(landing, /Próximamente/);
  assert.match(landing, /\/groups\/international/);
  assert.match(landing, /\/groups\/migration/);
});

test('dedicated grouping cards render only the summary read model and enter the existing Groups route', () => {
  const list = readSource('../src/components/passenger-groups/grouping-travel-package-list.tsx');

  assert.match(list, /listGroupingTravelPackages\(travelType, page, search\)/);
  assert.match(list, /trip\.passengerCount/);
  assert.match(list, /trip\.groupedPassengerCount/);
  assert.match(list, /trip\.ungroupedPassengerCount/);
  assert.match(list, /\/trips\/\$\{trip\.travelPackageId\}\/groups/);
  assert.doesNotMatch(list, /packagePrice|minReservation|formatTravelCommercialPrice/);
  assert.doesNotMatch(list, /listPassengerGroups|getTravelPackageParticipants/);
});

test('commercial TravelPackage cards no longer contain a Groups call to action', () => {
  const trips = readSource('../src/app/trips/page.tsx');

  assert.doesNotMatch(trips, /\/trips\/\$\{pkg\.id\}\/groups/);
  assert.doesNotMatch(trips, />\s*Grupos\s*</);
  assert.match(trips, /\/contracts\?travelPackageId=/);
});

test('navigation uses a distinct Layers3 identity and exposes the parallel trip menus only to the intended roles', () => {
  const nav = readSource('../src/components/vertical-nav.tsx');
  const startMenu = readSource('../src/components/action-menu-modal.tsx');
  const dashboard = readSource('../src/app/agent-dashboard/page.tsx');

  assert.match(nav, /hasPassengerGroupsAccess = isAdmin \|\| role === "AGENT" \|\| role === "OPERACIONES"/);
  assert.match(nav, /import \{ Layers3 \} from "lucide-react"/);
  assert.match(nav, /label: "Agrupaciones"/);
  assert.match(nav, /icon: <Layers3 aria-hidden="true" size=\{18\}/);
  assert.match(nav, /label: "Ventas \/ Contratos"/);
  assert.match(nav, /href: "\/trips\?travelType=INTERNATIONAL"/);
  assert.match(nav, /href: "\/trips\?travelType=MIGRATION"/);
  assert.match(nav, /href: "\/internal-trips-available"/);
  assert.match(nav, /href: "\/groups\/national"/);
  assert.match(startMenu, /onSelectGroups\?: \(\) => void/);
  assert.match(startMenu, />Agrupaciones</);
  assert.match(dashboard, /onSelectGroups=\{\(\) => router\.push\("\/groups"\)\}/);
});

test('grouping cards use readable stat labels and Lucide affordances without commercial data', () => {
  const landing = readSource('../src/components/passenger-groups/grouping-landing.tsx');
  const list = readSource('../src/components/passenger-groups/grouping-travel-package-list.tsx');

  assert.match(landing, /Layers3/);
  assert.match(landing, /border-t-4 border-t-primary\/70/);
  assert.match(landing, /Próximamente/);
  assert.match(list, /Users aria-hidden/);
  assert.match(list, /Layers3 aria-hidden/);
  assert.match(list, /UserMinus aria-hidden/);
  assert.match(list, /label="Pasajeros"/);
  assert.match(list, /label="Con agrupación"/);
  assert.match(list, /label="Sin agrupación"/);
  assert.match(list, /cursor-pointer/);
  assert.doesNotMatch(list, /packagePrice|minReservation|formatTravelCommercialPrice/);
});

test('the detail workspace returns to Agrupaciones and permits the shared Migration TravelPackage domain', () => {
  const workspace = readSource('../src/components/passenger-groups/passenger-groups-workspace.tsx');

  assert.match(workspace, /\['INTERNATIONAL', 'MIGRATION'\]\.includes/);
  assert.match(workspace, /\/groups\/migration/);
  assert.match(workspace, /Agrupaciones \/ \{groupingCategory\}/);
});
