export type LearningStyle =
  | "visual"
  | "reading_writing"
  | "auditory_video"
  | "kinesthetic";

export type ConceptStatus = "not_started" | "shaky" | "mastered" | "misconception";

export interface Concept {
  id: string;
  title: string;
  description?: string;
  source?: "notes" | "pdf" | "youtube" | "video" | "handwritten";
  status: ConceptStatus;
  order: number;
}

export interface ChecklistItem {
  id: string;
  conceptId: string;
  title: string;
  completed: boolean;
  source?: string;
}

export interface TopicSummary {
  title: string;
  summary: string;
  concepts: Concept[];
  checklist: ChecklistItem[];
  rawSources: string[];
}

export interface AssessmentResult {
  score: number;
  reasoning: string;
  correct: string[];
  misconceptions: string[];
  unfamiliar: string[];
  conceptScores?: Record<string, number>;
}

export interface LearningPathItem {
  id: string;
  conceptId: string;
  title: string;
  completed: boolean;
  practiceQuestions?: string[];
  checkpointPassed?: boolean;
}

export interface LearningStyleProfile {
  preferredInput: "watch" | "read" | "draw" | "talk";
  whenStuck: "example" | "diagram" | "story" | "steps";
  reviewStyle: "flashcards" | "notes" | "mindmap" | "practice";
  pace: "slow_guided" | "overview_first";
  interests: string[];
  mode: LearningStyle;
}

export interface UserProgress {
  userId: string;
  topicId: string;
  checklistCompleted: boolean;
  assessmentScore?: number;
  case: 1 | 2;
  learningPath?: LearningPathItem[];
  atRiskFlags: number;
  styleProfile?: LearningStyleProfile;
  streak: number;
  badges: string[];
  lastSessionAt?: string;
}
