/** localStorage keys and helpers for user data persistence */

export const STORAGE_KEYS = {
  TOPICS: "adaptive-learning-topics",
  PROGRESS: (id: string) => `progress-${id}`,
  DISMISSED: "adaptive-learning-dismissed",
  LEARNING_STYLE: "adaptive-learning-style",
  POST_SOURCE_QUIZ: (topicId: string) => `post-source-quiz-${topicId}`,
  ACTIVE_RECALL: (topicId: string) => `active-recall-${topicId}`,
  RECALL_NOTIFICATIONS: "active-recall-notifications-sent",
  STREAK: "adaptive-learning-streak",
  SHOP_PURCHASES: "adaptive-learning-shop-purchases",
  COMMUNITY_USERNAME: "adaptive-learning-community-username",
  COMMUNITY_VISITED: "adaptive-learning-community-visited",
  COMMUNITY_DRAFTS: "adaptive-learning-community-drafts",
  COMMUNITY_BLOCKED: "adaptive-learning-community-blocked",
} as const;

export function getCommunityVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMUNITY_VISITED);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markCommunityVisited(boardId: string) {
  const visited = getCommunityVisited();
  visited.add(boardId);
  localStorage.setItem(STORAGE_KEYS.COMMUNITY_VISITED, JSON.stringify(Array.from(visited)));
}

export function getCommunityDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMUNITY_DRAFTS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCommunityDraft(boardId: string, text: string) {
  const drafts = getCommunityDrafts();
  if (text) drafts[boardId] = text;
  else delete drafts[boardId];
  localStorage.setItem(STORAGE_KEYS.COMMUNITY_DRAFTS, JSON.stringify(drafts));
}

export function getBlockedUsers(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMUNITY_BLOCKED);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function blockUser(username: string) {
  const blocked = getBlockedUsers();
  blocked.add(username);
  localStorage.setItem(STORAGE_KEYS.COMMUNITY_BLOCKED, JSON.stringify(Array.from(blocked)));
}

export type PostSourceQuizResult = {
  score: number;
  passed: boolean;
  attempts: { score: number; date: string }[];
  lastAttempt: string;
  misconceptions?: string[];
  unfamiliar?: string[];
};

export type ActiveRecallSchedule = {
  topicId: string;
  topicTitle: string;
  unlockedAt: string; // ISO date when 90-100 achieved
  currentInterval: number; // 1, 3, 7, 14, 30
  nextDueAt: string;
  results: { intervalDay: number; score: number; passed: boolean; date: string }[];
  lastResult?: { score: number; passed: boolean };
};

export type StreakData = {
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  freezes: number;
  maxFreezes: number;
  milestones: number[]; // [30, 50, 100, 200, 300, 365]
  repairWindow?: {
    startDate: string;
    previousStreak: number;
  };
  points?: number; // earned from study, spent in shop
};

export type NotificationSentLog = Record<string, string>; // topicId-intervalDay -> sentAt ISO

export function getRecallNotificationsSent(): NotificationSentLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECALL_NOTIFICATIONS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function markRecallNotificationSent(topicId: string, intervalDay: number) {
  const log = getRecallNotificationsSent();
  log[`${topicId}-${intervalDay}`] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.RECALL_NOTIFICATIONS, JSON.stringify(log));
}

export function getPostSourceQuiz(topicId: string): PostSourceQuizResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.POST_SOURCE_QUIZ(topicId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPostSourceQuiz(topicId: string, data: PostSourceQuizResult) {
  localStorage.setItem(STORAGE_KEYS.POST_SOURCE_QUIZ(topicId), JSON.stringify(data));
}

export function getActiveRecall(topicId: string): ActiveRecallSchedule | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_RECALL(topicId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setActiveRecall(topicId: string, data: ActiveRecallSchedule) {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_RECALL(topicId), JSON.stringify(data));
}

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STREAK);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    streak: 0,
    lastActiveDate: "",
    freezes: 0,
    maxFreezes: 3,
    milestones: [],
    points: 0,
  };
}

export function setStreak(data: StreakData) {
  localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(data));
}

export function getStreakMilestoneLabel(streak: number): string {
  if (streak >= 365) return "GOAT 🐐";
  if (streak >= 300) return "academic weapon ⚔️";
  if (streak >= 200) return "cooking 🧑‍🍳";
  if (streak >= 100) return "locked in 🔒";
  return "";
}

export type ShopPurchase = {
  item: "streak_freeze";
  date: string;
};

export function getShopPurchases(): ShopPurchase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHOP_PURCHASES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addShopPurchase(item: "streak_freeze") {
  const current = getShopPurchases();
  current.push({ item, date: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEYS.SHOP_PURCHASES, JSON.stringify(current));
}

const FREEZE_COST = 50;
export function getFreezeCost() {
  return FREEZE_COST;
}
export function canAffordFreeze(): boolean {
  const streak = getStreak();
  return (streak.points ?? 0) >= FREEZE_COST;
}
export function purchaseFreeze(): boolean {
  const data = getStreak();
  const points = data.points ?? 0;
  if (points < FREEZE_COST) return false;
  if (data.freezes >= data.maxFreezes) return false;
  setStreak({
    ...data,
    points: points - FREEZE_COST,
    freezes: data.freezes + 1,
  });
  addShopPurchase("streak_freeze");
  return true;
}
export function addPoints(amount: number) {
  const data = getStreak();
  setStreak({
    ...data,
    points: (data.points ?? 0) + amount,
  });
}
