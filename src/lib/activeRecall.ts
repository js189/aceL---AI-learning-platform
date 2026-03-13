/**
 * Active recall schedule: Day 1, 3, 7, 14, 30
 *
 * REVIEW SCHEDULING LOGIC (post-source quiz):
 * - If score < 85% → allow retry (new quiz generation)
 * - If score ≥ 85% → mark lesson as passed → unlock active recall phase
 * - The "Day 1 Review" / "Take Day 1 Review" button MUST NOT appear on the same calendar day as the pass.
 * - It becomes visible ONLY starting from the next day (client date comparison: current date > pass date).
 * - Example: pass on 2025-10-15 23:59 → button appears 2025-10-16 00:00 onward.
 * - Do NOT show it immediately after passing — enforce full day delay for spaced repetition correctness.
 */

export const RECALL_INTERVALS = [1, 3, 7, 14, 30] as const;

export function getNextDueDate(
  lastCompletedAt: string,
  currentIntervalIndex: number
): string {
  const d = new Date(lastCompletedAt);
  const days = RECALL_INTERVALS[currentIntervalIndex] ?? 1;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Returns ISO string for start of the NEXT CALENDAR DAY.
 * Used when user scores ≥85% on post-source: Day 1 "Take Review" button must NOT appear same day.
 * It becomes visible ONLY from the next day (current date > pass date).
 * Example: pass 2025-10-15 23:59 → button appears 2025-10-16 00:00 onward.
 */
export function getStartOfNextDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  d.setMilliseconds(0);
  return d.toISOString();
}

/**
 * Returns true when current date >= due date.
 * With nextDueAt = getStartOfNextDay(), ensures "Take Day 1 Review" does NOT show same calendar day as pass.
 */
export function isDue(dateStr: string): boolean {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return now >= due || now.getTime() === due.getTime();
}

export function getIntervalLabel(day: number): string {
  return `Day ${day} review`;
}

type ScheduleShape = {
  topicId: string;
  nextDueAt: string;
  results: { intervalDay: number }[];
  [k: string]: unknown;
};

/**
 * Fix schedules created with wrong nextDueAt (old bug: showed Day 1 button same day).
 * If no results yet and nextDueAt is same calendar day or before today, push to tomorrow.
 */
export function ensureDay1DueTomorrow<T extends ScheduleShape>(
  schedule: T,
  setter: (id: string, s: T) => void
): T {
  if (schedule.results.length > 0) return schedule;
  const due = new Date(schedule.nextDueAt);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  if (now >= due) {
    const fixed = { ...schedule, nextDueAt: getStartOfNextDay() };
    setter(schedule.topicId, fixed);
    return fixed;
  }
  return schedule;
}
