export type View = "home" | "interview" | "overview" | "board" | "leaderboard";

export type Theme = "dark" | "light";

export type Stage = "inbox" | "ready" | "inprogress" | "review" | "done";

export type Gate = "pending" | "running" | "green" | "red";

export type WorkType = "feature" | "bugfix" | "refactor" | "perf" | "docs" | "chore";

export type AgentName = "Codex" | "Claude" | "Pi" | "Amp" | "Cursor" | "Factory";

export type RoleKey = "planner" | "executor" | "reviewer";

export type LeaderboardMetric = "overall" | RoleKey;

export type HomeMode = "new" | "existing";

export interface Rating {
  overall: number;
  n: number;
  merge: number;
  trend: number;
  roles: Record<RoleKey, number>;
  types: Record<WorkType, number>;
}

export interface Project {
  id: string;
  name: string;
  repo: string;
}

export interface Issue {
  p: string;
  id: number;
  t: string;
  type: WorkType;
  s: Stage;
  g: Gate;
  roles: [AgentName, AgentName, AgentName];
  blocked?: string;
  reviewReason?: "execution" | "plan";
}

export interface InterviewStep {
  cat: string;
  q: string;
}

export interface InterviewMessage {
  role: "user" | "assistant";
  text: string;
}

export interface InterviewState {
  mode: HomeMode;
  prompt: string;
  flow: InterviewStep[];
  step: number;
  input: string;
  typing: boolean;
  probed: boolean;
  done: boolean;
  answers: Record<string, string>;
  covered: Record<string, boolean>;
  messages: InterviewMessage[];
}
