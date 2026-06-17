import type { AgentName, Issue, Project, Rating, Stage, WorkType } from "./types";

export const STAGES: Stage[] = ["inbox", "ready", "inprogress", "review", "done"];

export const COLUMNS: Array<{ key: Stage; label: string; accent: string }> = [
  { key: "inbox", label: "Inbox", accent: "var(--faint2)" },
  { key: "ready", label: "Ready", accent: "var(--blue)" },
  { key: "inprogress", label: "In progress", accent: "var(--cyan)" },
  { key: "review", label: "Review", accent: "var(--violet)" },
  { key: "done", label: "Done", accent: "var(--amber)" },
];

export const STAGE_LABEL: Record<Stage, string> = {
  inbox: "Inbox",
  ready: "Ready",
  inprogress: "In progress",
  review: "Review",
  done: "Done",
};

export const STAGE_ACCENT: Record<Stage, string> = {
  inbox: "var(--faint2)",
  ready: "var(--blue)",
  inprogress: "var(--cyan)",
  review: "var(--violet)",
  done: "var(--amber)",
};

export const ROSTER: AgentName[] = ["Codex", "Claude", "Pi", "Amp", "Cursor", "Factory"];

export const TYPES: WorkType[] = ["feature", "bugfix", "refactor", "perf", "docs", "chore"];

export const RATINGS: Record<AgentName, Rating> = {
  Codex: {
    overall: 7.8,
    n: 34,
    merge: 0.91,
    trend: 0.4,
    roles: { planner: 7.2, executor: 8.1, reviewer: 7.0 },
    types: { feature: 8.0, bugfix: 7.6, refactor: 7.1, perf: 7.4, docs: 6.8, chore: 7.0 },
  },
  Claude: {
    overall: 7.9,
    n: 41,
    merge: 0.93,
    trend: 0.2,
    roles: { planner: 8.4, executor: 7.6, reviewer: 7.8 },
    types: { feature: 7.7, bugfix: 7.5, refactor: 8.2, perf: 7.0, docs: 8.1, chore: 7.3 },
  },
  Pi: {
    overall: 7.6,
    n: 29,
    merge: 0.88,
    trend: 0.6,
    roles: { planner: 7.0, executor: 7.4, reviewer: 8.3 },
    types: { feature: 7.2, bugfix: 8.0, refactor: 7.3, perf: 7.1, docs: 7.4, chore: 7.0 },
  },
  Amp: {
    overall: 7.1,
    n: 23,
    merge: 0.84,
    trend: -0.2,
    roles: { planner: 7.3, executor: 6.9, reviewer: 7.2 },
    types: { feature: 6.9, bugfix: 7.0, refactor: 7.4, perf: 6.7, docs: 7.6, chore: 7.2 },
  },
  Cursor: {
    overall: 7.4,
    n: 18,
    merge: 0.86,
    trend: 0.5,
    roles: { planner: 6.8, executor: 7.9, reviewer: 7.0 },
    types: { feature: 7.8, bugfix: 7.5, refactor: 6.9, perf: 7.2, docs: 6.6, chore: 7.1 },
  },
  Factory: {
    overall: 6.9,
    n: 12,
    merge: 0.8,
    trend: 0.3,
    roles: { planner: 6.5, executor: 7.2, reviewer: 6.8 },
    types: { feature: 7.1, bugfix: 6.8, refactor: 6.7, perf: 6.9, docs: 6.4, chore: 7.3 },
  },
};

export const PROJECTS: Project[] = [
  { id: "checkout", name: "checkout-service", repo: "bannaa/checkout" },
  { id: "web", name: "web-app", repo: "bannaa/web" },
  { id: "infra", name: "infra", repo: "bannaa/infra" },
  { id: "docs", name: "docs-site", repo: "bannaa/docs" },
];

export const REVIEW_NOTES: Record<number, string> = {
  42: "missing null-check on empty cart",
  40: "unhandled timeout on redeem",
};

export const ISSUES: Issue[] = [
  { p: "checkout", id: 42, t: "Empty-cart null-check in loop.flow", type: "bugfix", s: "review", g: "green", roles: ["Claude", "Codex", "Pi"] },
  { p: "checkout", id: 39, t: "Coupon stacking rules", type: "feature", s: "review", g: "green", roles: ["Pi", "Claude", "Amp"] },
  { p: "checkout", id: 41, t: "Stripe webhook idempotency", type: "bugfix", s: "inprogress", g: "running", roles: ["Claude", "Amp", "Pi"] },
  { p: "checkout", id: 44, t: "Refactor pricing engine", type: "refactor", s: "inprogress", g: "red", roles: ["Pi", "Codex", "Claude"] },
  { p: "checkout", id: 40, t: "Gift card redemption", type: "feature", s: "inprogress", g: "pending", roles: ["Amp", "Claude", "Codex"], reviewReason: "execution" },
  { p: "checkout", id: 43, t: "Apple Pay express button", type: "feature", s: "inprogress", g: "pending", roles: ["Codex", "Pi", "Claude"] },
  { p: "checkout", id: 45, t: "Idempotency keys on orders", type: "feature", s: "ready", g: "pending", roles: ["Claude", "Codex", "Pi"] },
  { p: "checkout", id: 46, t: "Tax rounding off-by-one", type: "bugfix", s: "ready", g: "pending", roles: ["Pi", "Amp", "Codex"], blocked: "waits on #44 pricing refactor" },
  { p: "checkout", id: 47, t: "Cart persistence across sessions", type: "feature", s: "inbox", g: "pending", roles: ["Codex", "Claude", "Pi"] },
  { p: "checkout", id: 48, t: "Remove legacy checkout v1", type: "chore", s: "inbox", g: "pending", roles: ["Amp", "Pi", "Claude"] },
  { p: "checkout", id: 38, t: "Inventory reservation race", type: "bugfix", s: "done", g: "green", roles: ["Claude", "Codex", "Pi"] },
  { p: "checkout", id: 37, t: "Checkout latency p99", type: "perf", s: "done", g: "green", roles: ["Pi", "Amp", "Codex"] },
  { p: "web", id: 112, t: "Dark mode design tokens", type: "feature", s: "inprogress", g: "running", roles: ["Claude", "Pi", "Codex"] },
  { p: "web", id: 110, t: "Fix layout shift on hero", type: "bugfix", s: "review", g: "green", roles: ["Codex", "Claude", "Pi"] },
  { p: "web", id: 108, t: "Onboarding wizard · step 3", type: "feature", s: "ready", g: "pending", roles: ["Pi", "Codex", "Amp"] },
  { p: "web", id: 113, t: "Settings page a11y pass", type: "chore", s: "inbox", g: "pending", roles: ["Amp", "Claude", "Pi"] },
  { p: "web", id: 106, t: "Sticky nav scroll jank", type: "bugfix", s: "done", g: "green", roles: ["Claude", "Codex", "Pi"] },
  { p: "web", id: 107, t: "Image lazy-load below fold", type: "perf", s: "done", g: "green", roles: ["Pi", "Amp", "Codex"] },
  { p: "infra", id: 73, t: "Migrate CI to make verify", type: "chore", s: "inprogress", g: "red", roles: ["Codex", "Claude", "Pi"] },
  { p: "infra", id: 71, t: "Rotate KMS keys", type: "chore", s: "review", g: "green", roles: ["Pi", "Codex", "Amp"] },
  { p: "infra", id: 74, t: "Terraform drift on staging", type: "bugfix", s: "inprogress", g: "pending", roles: ["Claude", "Amp", "Pi"], blocked: "needs prod cloud credentials" },
  { p: "infra", id: 70, t: "Nightly grader cron job", type: "feature", s: "ready", g: "pending", roles: ["Amp", "Codex", "Claude"] },
  { p: "infra", id: 68, t: "Pin base container images", type: "chore", s: "done", g: "green", roles: ["Codex", "Pi", "Claude"] },
  { p: "docs", id: 21, t: "Dispatcher config reference", type: "docs", s: "review", g: "green", roles: ["Claude", "Pi", "Codex"] },
  { p: "docs", id: 22, t: "Quickstart: your first issue", type: "docs", s: "ready", g: "pending", roles: ["Pi", "Amp", "Codex"] },
  { p: "docs", id: 19, t: "Roster & roles page", type: "docs", s: "done", g: "green", roles: ["Codex", "Claude", "Pi"] },
  { p: "docs", id: 20, t: "Gate failure runbook", type: "docs", s: "done", g: "green", roles: ["Amp", "Pi", "Claude"] },
  { p: "web", id: 114, t: "Command palette & shortcuts", type: "feature", s: "inprogress", g: "running", roles: ["Cursor", "Factory", "Pi"] },
  { p: "checkout", id: 49, t: "Inline card validation", type: "feature", s: "inprogress", g: "pending", roles: ["Cursor", "Factory", "Claude"] },
  { p: "infra", id: 75, t: "Preview env per pull request", type: "feature", s: "ready", g: "pending", roles: ["Factory", "Cursor", "Amp"] },
];
