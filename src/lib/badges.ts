/** Streak badge milestones and labels */

export const STREAK_BADGES: { days: number; id: string; label: string }[] = [
  { days: 7, id: "streak_7", label: "Week Warrior" },
  { days: 14, id: "streak_14", label: "Two Week Champion" },
  { days: 30, id: "streak_30", label: "Monthly Master" },
  { days: 50, id: "streak_50", label: "50 Day Dynamo" },
  { days: 100, id: "streak_100", label: "Century Scholar" },
  { days: 200, id: "streak_200", label: "200 Day Legend" },
  { days: 300, id: "streak_300", label: "300 Day Titan" },
  { days: 365, id: "streak_365", label: "Year of Excellence" },
];

export function getBadgesForStreak(streak: number): string[] {
  return STREAK_BADGES.filter((b) => streak >= b.days).map((b) => b.id);
}

export function getBadgeLabel(id: string): string {
  return STREAK_BADGES.find((b) => b.id === id)?.label ?? id;
}
