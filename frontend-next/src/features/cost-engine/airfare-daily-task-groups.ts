import type { AirfareDailyTask } from "@/lib/cost-engine-api";

export type AirfareDailyTaskProgress = {
  task: AirfareDailyTask;
  completed: boolean;
};

export type AirfareDailyTaskGroup = {
  key: string;
  sourceTravelType: AirfareDailyTask["sourceTravelType"];
  sourceTravelId: string;
  travelName: string;
  startDate: string;
  tasks: AirfareDailyTaskProgress[];
};

export function airfareTaskGroupKey(task: Pick<AirfareDailyTask, "sourceTravelType" | "sourceTravelId">) {
  return `${task.sourceTravelType}:${task.sourceTravelId}`;
}

export function groupAirfareDailyTasks(tasks: readonly AirfareDailyTask[]): AirfareDailyTaskGroup[] {
  const groups = new Map<string, AirfareDailyTaskGroup>();

  for (const task of tasks) {
    const key = airfareTaskGroupKey(task);
    const group = groups.get(key);
    if (group) {
      group.tasks.push({ task, completed: false });
      continue;
    }

    groups.set(key, {
      key,
      sourceTravelType: task.sourceTravelType,
      sourceTravelId: task.sourceTravelId,
      travelName: task.travelName,
      startDate: task.startDate,
      tasks: [{ task, completed: false }],
    });
  }

  return [...groups.values()];
}

export function markAirfareDailyTaskUpdated(groups: readonly AirfareDailyTaskGroup[], costComponentId: string) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((item) => item.task.costComponentId === costComponentId ? { ...item, completed: true } : item),
  }));
}

export function completedAirfareTaskCount(group: AirfareDailyTaskGroup) {
  return group.tasks.filter((item) => item.completed).length;
}
