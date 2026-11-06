import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addDaysIso,
  applyMoneyDerivedValues,
  createInitialFormState,
  getDateRangeValidityMessage,
  getTodayIsoLocal,
  syncTourDates,
} from "../src/features/contracts-form/utils.ts";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const utilsSource = read("features/contracts-form/utils.ts");
const wizardSource = read("features/contracts-form/wizard/ContractsWizard.tsx");
const travelStepSource = read("features/contracts-form/wizard/steps/travel/TravelStep.tsx");
const minorsStepSource = read("features/contracts-form/wizard/steps/minors/MinorsStep.tsx");

test("Contracts today follows the active tenant timezone at a UTC/local midnight boundary", () => {
  const instant = new Date("2026-09-20T05:30:00.000Z");
  assert.equal(getTodayIsoLocal("America/Costa_Rica", instant), "2026-09-19");
  assert.equal(getTodayIsoLocal("America/Lima", instant), "2026-09-20");
});

test("Contracts calendar arithmetic is timezone-independent and validates invalid dates", () => {
  const previousTimeZone = process.env.TZ;
  const evaluate = (timeZone) => {
    process.env.TZ = timeZone;
    return {
      leap: addDaysIso("2024-02-28", 1),
      yearBoundary: addDaysIso("2025-01-01", -1),
      invalid: addDaysIso("2023-02-29", 1),
    };
  };

  try {
    assert.deepEqual(evaluate("UTC"), evaluate("Pacific/Auckland"));
    assert.deepEqual(evaluate("UTC"), evaluate("America/New_York"));
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  assert.equal(addDaysIso("2024-02-28", 1), "2024-02-29");
  assert.equal(addDaysIso("2025-01-01", -1), "2024-12-31");
  assert.equal(addDaysIso("2023-02-29", 1), "");
});

test("Contracts keep date-only values intact and do not make invalid ranges plausible", () => {
  const initial = createInitialFormState(undefined, "America/Costa_Rica");
  const state = {
    ...initial,
    issuedAt: "2024-02-28",
    startDate: "2024-02-28",
    endDate: "2024-02-29",
    paymentDueDate: "2024-02-06",
    itinerary: [
      { id: "opening", kind: "opening", date: "2024-02-28", detail: "" },
      { id: "custom", kind: "custom", date: "2024-02-29", detail: "Escala" },
      { id: "closing", kind: "closing", date: "2024-02-29", detail: "" },
    ],
  };
  const synced = syncTourDates(state, "end", "2024-02-29", "2024-01-01");

  assert.equal(synced.startDate, "2024-02-28");
  assert.equal(synced.endDate, "2024-02-29");
  assert.equal(synced.itinerary[1].date, "2024-02-29");
  assert.equal(synced.paymentDueDate, "2024-02-06");
  assert.match(getDateRangeValidityMessage({ ...state, startDate: "2024-02-30" }, "2024-01-01"), /no es válida/);
  assert.equal(applyMoneyDerivedValues({ ...state, issuedAt: "2024-02-30" }).installmentCount, "");
  assert.match(utilsSource, /calendarDayDifference\(startIso, endIso\)/);
  assert.match(utilsSource, /addCalendarDays\(dateIso, days\)/);
  assert.doesNotMatch(utilsSource, /new Date\(`\$\{dateIso\}T00:00:00`\)/);
});

test("Contracts wait for regional configuration and pass tenant today without resetting form state", () => {
  assert.match(wizardSource, /const \{ timeZone, isConfigured \} = useTenantRegional\(\)/);
  assert.match(wizardSource, /if \(!isConfigured\)/);
  assert.match(wizardSource, /return <ContractsWizardContent \{\.\.\.props\} timeZone=\{timeZone\} \/>;/);
  assert.match(wizardSource, /createInitialFormState\(agent \|\| undefined, timeZone\)/);
  assert.match(wizardSource, /const \[state, setState\] = useState\(\(\) => createInitialFormState\(agent \|\| undefined, timeZone\)\)/);
  assert.match(wizardSource, /getTodayIsoLocal\(timeZone\)/);
  assert.doesNotMatch(wizardSource, /key=\{timeZone\}/);
  assert.match(travelStepSource, /syncTourDates\(prev, "start", safe, todayIso\)/);
  assert.match(travelStepSource, /syncTourDates\(prev, "end", event\.target\.value, todayIso\)/);
  assert.match(minorsStepSource, /max=\{todayIso\}/);
});

test("initial entity hydration reads current regional calendar context without rerunning on refresh", () => {
  assert.match(
    wizardSource,
    /const currentRegionalCalendarRef = useRef\(\{ timeZone, todayIso \}\);[\s\S]*?currentRegionalCalendarRef\.current = \{ timeZone, todayIso \};[\s\S]*?\[timeZone, todayIso\]/,
  );
  assert.match(
    wizardSource,
    /const \{ timeZone: currentTimeZone, todayIso: currentTodayIso \} = currentRegionalCalendarRef\.current;[\s\S]*?createInitialFormState\(agent \|\| undefined, currentTimeZone\)[\s\S]*?syncTourDates\(restoredState, "start", restoredState\.startDate, currentTodayIso\)/,
  );
  assert.match(wizardSource, /const \{ todayIso: currentTodayIso \} = currentRegionalCalendarRef\.current;/);
  assert.match(wizardSource, /if \(loadedDraftIdRef\.current !== draftId\) return;/);
  assert.match(wizardSource, /if \(loadedTravelPackageIdRef\.current !== packageId\) return;/);
  assert.match(wizardSource, /if \(loadedInternalTripIdRef\.current !== tripId\) return;/);
  assert.match(wizardSource, /A draft is authoritative over package defaults; invalidate any pending package load\./);
  assert.match(wizardSource, /A draft is authoritative over trip defaults; invalidate any pending trip load\./);
});
