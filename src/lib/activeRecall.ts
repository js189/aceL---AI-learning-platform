/** Active recall schedule: Day 1, 3, 7, 14, 30 */

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
