import { getStreak, setStreak, getStreakMilestoneLabel, addPoints } from "./storage";
import { dispatchProgressUpdate } from "./progressEvents";
import { getBadgesForStreak } from "./badges";

export type StreakData = {
  streak: number;
  lastActiveDate: string;
  freezes: number;
  maxFreezes: number;
  milestones: number[];
  repairWindow?: { startDate: string; previousStreak: number };
};

export function recordStudyActivity(): void {
  const data = getStreak();
  const today = new Date().toISOString().slice(0, 10);

  if (data.lastActiveDate === today) return;

  let newStreak = data.streak;
  let newFreezes = data.freezes;
  let newMaxFreezes = data.maxFreezes;
  const milestones = [...data.milestones];

  const last = data.lastActiveDate ? new Date(data.lastActiveDate) : null;
  const todayDate = new Date(today);

  if (last) {
    const diffDays = Math.floor(
      (todayDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      const missedDays = diffDays - 1;
      if (newFreezes >= missedDays) {
        newStreak += 1;
        newFreezes -= missedDays;
        } else {
          if (newFreezes > 0) {
            const protectable = newFreezes;
            newFreezes = 0;
            if (missedDays - protectable === 1) {
              newStreak += 1;
            } else {
              newStreak = 0;
              data.repairWindow = {
                startDate: today,
                previousStreak: data.streak,
              };
            }
          } else {
            newStreak = 0;
            data.repairWindow = {
              startDate: today,
              previousStreak: data.streak,
            };
          }
        }
    }
  } else {
    newStreak = 1;
  }

  if (newStreak >= 7 && !milestones.includes(7)) milestones.push(7);
  if (newStreak >= 14 && !milestones.includes(14)) milestones.push(14);
  if (newStreak >= 30 && !milestones.includes(30)) {
    milestones.push(30);
    newFreezes = Math.min(newFreezes + 1, newMaxFreezes);
  }
  if (newStreak >= 50 && !milestones.includes(50)) {
    milestones.push(50);
    newMaxFreezes = 5;
    newFreezes = Math.min(newFreezes + 3, 5);
  }
  if (newStreak >= 100 && !milestones.includes(100)) milestones.push(100);
  if (newStreak >= 200 && !milestones.includes(200)) milestones.push(200);
  if (newStreak >= 300 && !milestones.includes(300)) milestones.push(300);
  if (newStreak >= 365 && !milestones.includes(365)) milestones.push(365);

  setStreak({
    ...data,
    streak: newStreak,
    lastActiveDate: today,
    freezes: newFreezes,
    maxFreezes: newMaxFreezes,
    milestones,
  });
  addPoints(10);

  if (typeof window !== "undefined") {
    const badges = getBadgesForStreak(newStreak);
    fetch("/api/streak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streak: newStreak, badges }),
    })
      .catch(() => {})
      .finally(() => dispatchProgressUpdate());
  }
}

export function getMilestoneLabel(streak: number): string {
  return getStreakMilestoneLabel(streak);
}

export function isInRepairWindow(): boolean {
  const data = getStreak();
  if (!data.repairWindow) return false;
  const start = new Date(data.repairWindow.startDate);
  const now = new Date();
  const daysSince = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSince <= 3;
}

export function getRepairWindowDaysLeft(): number {
  const data = getStreak();
  if (!data.repairWindow) return 0;
  const start = new Date(data.repairWindow.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  const now = new Date();
  if (now >= end) return 0;
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function useStreakFreeze(): boolean {
  const data = getStreak();
  if (data.freezes <= 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastActiveDate === today) return false;
  const last = data.lastActiveDate ? new Date(data.lastActiveDate) : null;
  const todayDate = new Date(today);
  if (!last) return false;
  const diffDays = Math.floor(
    (todayDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays !== 1) return false;
  setStreak({
    ...data,
    freezes: data.freezes - 1,
    lastActiveDate: today,
    streak: data.streak + 1,
  });
  return true;
}
