import assert from "node:assert/strict";
import test from "node:test";
import {
  completedAirfareTaskCount,
  groupAirfareDailyTasks,
  markAirfareDailyTaskUpdated,
} from "../src/features/cost-engine/airfare-daily-task-groups.ts";

function task(overrides = {}) {
  return {
    costComponentId: "component-1",
    costingProjectId: "project-1",
    sourceTravelType: "TRAVEL_PACKAGE",
    sourceTravelId: "trip-1",
    travelName: "Viaje de prueba",
    startDate: "2026-10-12",
    endDate: "2026-10-18",
    title: "Aéreo",
    detailPayload: {
      origin: "SJO",
      destination: "MEX",
      departureDate: "2026-10-14",
      airline: "Ejemplo Air",
      cabinClass: "ECONOMY",
    },
    currentSnapshot: null,
    baseCurrency: "USD",
    ...overrides,
  };
}

test("one trip with one airfare produces one parent card with one independently actionable child", () => {
  const groups = groupAirfareDailyTasks([task()]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].tasks.length, 1);
  assert.equal(groups[0].tasks[0].task.costComponentId, "component-1");
  assert.equal(groups[0].tasks[0].task.detailPayload.departureDate, "2026-10-14");
});

test("two airfare components for the same immutable trip identity remain separate children", () => {
  const groups = groupAirfareDailyTasks([
    task(),
    task({ costComponentId: "component-2", detailPayload: { departureDate: "2026-10-16", origin: "MEX", destination: "SJO" } }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tasks.map((item) => item.task.costComponentId), ["component-1", "component-2"]);
  assert.deepEqual(groups[0].tasks.map((item) => item.task.detailPayload.departureDate), ["2026-10-14", "2026-10-16"]);
});

test("different trips remain separate cards even when their display names match", () => {
  const groups = groupAirfareDailyTasks([
    task({ travelName: "Mismo nombre" }),
    task({ costComponentId: "component-2", sourceTravelId: "trip-2", travelName: "Mismo nombre" }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.sourceTravelId), ["trip-1", "trip-2"]);
});

test("progress updates by cost component and marks the parent complete only after every child", () => {
  const original = groupAirfareDailyTasks([
    task(),
    task({ costComponentId: "component-2" }),
  ]);
  const firstUpdated = markAirfareDailyTaskUpdated(original, "component-1");
  const allUpdated = markAirfareDailyTaskUpdated(firstUpdated, "component-2");

  assert.equal(completedAirfareTaskCount(firstUpdated[0]), 1);
  assert.equal(firstUpdated[0].tasks[1].completed, false);
  assert.equal(completedAirfareTaskCount(allUpdated[0]), 2);
  assert.ok(allUpdated[0].tasks.every((item) => item.completed));
});
