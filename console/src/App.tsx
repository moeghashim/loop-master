import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Flag, Moon, RefreshCw, Sun, X } from "lucide-react";
import {
  COLUMNS,
  ISSUES,
  PROJECTS,
  RATINGS,
  REVIEW_NOTES,
  ROSTER,
  STAGE_ACCENT,
  STAGE_LABEL,
  STAGES,
  TYPES,
} from "./data";
import type {
  AgentName,
  Gate,
  HomeMode,
  InterviewState,
  Issue,
  LeaderboardMetric,
  Project,
  Stage,
  Theme,
  WorkType,
} from "./types";

const STORAGE_KEY = "cc-theme";

function initialTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function initials(name: string): string {
  return name.slice(0, 2).toLowerCase();
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 3)
    .join("-");
}

function flowFor(mode: HomeMode) {
  if (mode === "existing") {
    return [
      { cat: "Current state", q: "Which project is this, and what’s the pain right now? Be concrete." },
      { cat: "Problem", q: "What’s broken or missing today — and how does it show up for a real user?" },
      { cat: "Outcome", q: "What does the fixed state look like? How would someone notice the difference?" },
      { cat: "Constraints", q: "What can’t we break — contracts, data, public behaviour we must preserve?" },
      { cat: "Verify", q: "What should `make verify` assert to prove it’s fixed and stays fixed?" },
      { cat: "Scope", q: "What’s explicitly out of scope for this change?" },
      { cat: "Priority", q: "What’s the first issue you’d want the dispatcher to pick up?" },
    ];
  }
  return [
    { cat: "Problem", q: "In a sentence or two — what problem are you solving, and who feels it most?" },
    { cat: "Outcome", q: "What does “done” look like for the user? The single most important outcome." },
    { cat: "Scope", q: "What’s in scope for the first cut — and what are we deliberately NOT building yet?" },
    { cat: "Constraints", q: "Any hard constraints? Stack, deadlines, data, compliance, performance budgets." },
    { cat: "Verify", q: "Mechanically — what should `make verify` assert so we know it actually works?" },
    { cat: "Risk", q: "Where do you expect this to be hardest, or most likely to go wrong?" },
    { cat: "Priority", q: "If only one thing could ship this week, what is it?" },
  ];
}

function gateMeta(gate: Gate) {
  if (gate === "green") return { text: "✓ exit 0", className: "gate-chip gate-green", color: "var(--amber)" };
  if (gate === "red") return { text: "✗ verify", className: "gate-chip gate-red", color: "var(--red)" };
  if (gate === "running") return { text: "running…", className: "gate-chip gate-running", color: "var(--cyan2)" };
  return { text: "gate ○", className: "gate-chip gate-pending", color: "var(--faint)" };
}

function trendText(value: number): string {
  return `${value >= 0 ? "▲ +" : "▼ "}${Math.abs(value).toFixed(1)}`;
}

function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<"home" | "interview" | "overview" | "board" | "leaderboard">("home");
  const [homeMode, setHomeMode] = useState<HomeMode>("new");
  const [homePrompt, setHomePrompt] = useState("");
  const [interview, setInterview] = useState<InterviewState | null>(null);
  const [projects, setProjects] = useState<Project[]>(() => PROJECTS.map((project) => ({ ...project })));
  const [issues, setIssues] = useState<Issue[]>(() => ISSUES.map((issue) => ({ ...issue, roles: [...issue.roles] })));
  const [activeProject, setActiveProject] = useState("checkout");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [flash, setFlashState] = useState<string | null>(null);
  const [leaderboardBy, setLeaderboardBy] = useState<LeaderboardMetric>("overall");
  const flashTimer = useRef<number | null>(null);
  const interviewTimer = useRef<number | null>(null);
  const verifyTimers = useRef<Record<number, number>>({});

  useEffect(() => {
    document.documentElement.setAttribute("data-cc-theme", theme === "light" ? "light" : "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!detail) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view, detail]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      if (interviewTimer.current) window.clearTimeout(interviewTimer.current);
      Object.values(verifyTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function showFlash(text: string) {
    setFlashState(text);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashState(null), 2800);
  }

  function navigate(next: typeof view) {
    setView(next);
    setDetail(null);
    if (next !== "board") setBlockedOnly(false);
  }

  function openProject(id: string) {
    setActiveProject(id);
    setView("board");
    setDetail(null);
    setBlockedOnly(false);
  }

  function updateIssue(id: number, patch: Partial<Issue>) {
    setIssues((current) => current.map((issue) => (issue.id === id ? { ...issue, ...patch } : issue)));
  }

  function runVerify(id: number) {
    updateIssue(id, { g: "running" });
    if (verifyTimers.current[id]) window.clearTimeout(verifyTimers.current[id]);
    verifyTimers.current[id] = window.setTimeout(() => updateIssue(id, { g: "green" }), 1300);
    showFlash(`#${id}: dispatcher is running make verify.`);
  }

  function promote(id: number) {
    const issue = issues.find((item) => item.id === id);
    if (!issue) return;
    if (issue.blocked) {
      showFlash(`#${id} is blocked — unblock before advancing.`);
      return;
    }
    const next = nextStage(issue.s);
    if (!next) {
      showFlash(`#${id} is merged — nothing past Done.`);
      return;
    }
    if (issue.s === "inprogress" && next === "review" && issue.g !== "green") {
      showFlash(`Gate is ${issue.g === "red" ? "red" : issue.g}. make verify must exit 0 before review.`);
      return;
    }
    updateIssue(id, { s: next, reviewReason: issue.s === "inprogress" ? undefined : issue.reviewReason });
    if (next === "done") showFlash(`#${id} merged. ✓ final.`);
    else if (next === "review") showFlash(`#${id} → Review. reviewer reachable (green gate).`);
    else showFlash(`#${id} → ${STAGE_LABEL[next]}.`);
  }

  function startInterview() {
    const prompt = homePrompt.trim();
    if (!prompt) {
      showFlash("Tell me what you want built first.");
      return;
    }
    const flow = flowFor(homeMode);
    const intro =
      (homeMode === "existing" ? "Existing project — got it." : "New build — let’s go.") +
      " I’ll grill you until this is unambiguous; the dispatcher only acts on issues, and issues are only as sharp as this interview.";
    setInterview({
      mode: homeMode,
      prompt,
      flow,
      step: 0,
      input: "",
      typing: false,
      probed: false,
      done: false,
      answers: {},
      covered: {},
      messages: [{ role: "user", text: prompt }, { role: "assistant", text: intro }, { role: "assistant", text: flow[0].q }],
    });
    setView("interview");
  }

  function sendInterviewAnswer() {
    if (!interview || interview.done || interview.typing) return;
    const text = interview.input.trim();
    if (!text) return;
    const current = interview.flow[interview.step];
    const messages = [...interview.messages, { role: "user" as const, text }];
    if (text.length < 14 && !interview.probed) {
      setInterview({
        ...interview,
        messages: [...messages, { role: "assistant", text: "That’s thin. Be specific — give me the concrete detail behind it." }],
        input: "",
        probed: true,
      });
      return;
    }
    const answers = {
      ...interview.answers,
      [current.cat]: `${interview.answers[current.cat] ? `${interview.answers[current.cat]} ` : ""}${text}`,
    };
    const covered = { ...interview.covered, [current.cat]: true };
    const next = interview.step + 1;
    const acks = ["Got it.", "Noted.", "Makes sense.", "Good — that sharpens it.", "Logged.", "Clear."];
    const ack = acks[interview.step % acks.length];
    setInterview({ ...interview, messages, input: "", typing: true, probed: false, answers, covered });
    if (interviewTimer.current) window.clearTimeout(interviewTimer.current);
    interviewTimer.current = window.setTimeout(() => {
      setInterview((latest) => {
        if (!latest) return latest;
        if (next < interview.flow.length) {
          return {
            ...latest,
            typing: false,
            step: next,
            messages: [...latest.messages, { role: "assistant", text: ack }, { role: "assistant", text: interview.flow[next].q }],
          };
        }
        return {
          ...latest,
          typing: false,
          done: true,
          messages: [
            ...latest.messages,
            { role: "assistant", text: ack },
            {
              role: "assistant",
              text: "That’s enough to act on. Here’s the brief I’ll hand to the dispatcher — review it, then I’ll cut the issues and the loop starts.",
            },
          ],
        };
      });
    }, 900);
  }

  function createInterviewIssues() {
    if (!interview) return;
    const name = slug(interview.prompt) || "new-build";
    const pid = `iv-${Date.now()}`;
    const base = 200 + Math.floor(Math.random() * 700);
    const titles = [
      "Scaffold project & make verify",
      "Implement the core flow",
      "Wire the mechanical gate",
      "Acceptance checks from the brief",
      "Edge cases & validation",
    ];
    const types: WorkType[] = ["chore", "feature", "chore", "feature", "bugfix"];
    const cast = (index: number): [AgentName, AgentName, AgentName] => [
      ROSTER[index % ROSTER.length],
      ROSTER[(index + 1) % ROSTER.length],
      ROSTER[(index + 2) % ROSTER.length],
    ];
    const newIssues: Issue[] = titles.map((title, index) => ({
      p: pid,
      id: base + index,
      t: title,
      type: types[index],
      s: "inbox",
      g: "pending",
      roles: cast(index),
    }));
    setProjects((current) => [...current, { id: pid, name, repo: `bannaa/${name}` }]);
    setIssues((current) => [...current, ...newIssues]);
    setActiveProject(pid);
    setDetail(null);
    setBlockedOnly(false);
    setView("board");
    showFlash(`${newIssues.length} issues created in Inbox — the dispatcher will pick them up.`);
  }

  const active = issues.filter((issue) => issue.s !== "done").length;
  const awaiting = issues.filter((issue) => issue.s === "review" && issue.g === "green").length;
  const red = issues.filter((issue) => issue.g === "red").length;

  return (
    <>
      <div className="ambient" />
      <div className="app-shell">
        <TopBar
          theme={theme}
          view={view}
          onNavigate={navigate}
          onTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          onReference={() => showFlash("Reference source: design/control-center.dc.html")}
        />
        {view === "home" && (
          <HomeView
            mode={homeMode}
            prompt={homePrompt}
            active={active}
            awaiting={awaiting}
            red={red}
            onMode={setHomeMode}
            onPrompt={setHomePrompt}
            onStart={startInterview}
            onOverview={() => navigate("overview")}
          />
        )}
        {view === "interview" && interview && (
          <InterviewView
            interview={interview}
            onBack={() => navigate("home")}
            onRestart={() => navigate("home")}
            onInput={(input) => setInterview({ ...interview, input })}
            onSend={sendInterviewAnswer}
            onCreate={createInterviewIssues}
          />
        )}
        {view === "overview" && <OverviewView issues={issues} projects={projects} onProject={openProject} />}
        {view === "board" && (
          <BoardView
            issues={issues}
            projects={projects}
            activeProject={activeProject}
            blockedOnly={blockedOnly}
            onOverview={() => navigate("overview")}
            onProject={openProject}
            onToggleBlocked={() => setBlockedOnly((current) => !current)}
            onOpenIssue={setDetail}
          />
        )}
        {view === "leaderboard" && <LeaderboardView metric={leaderboardBy} onMetric={setLeaderboardBy} />}
      </div>
      {detail !== null && (
        <DetailDrawer
          issue={issues.find((issue) => issue.id === detail) ?? null}
          onClose={() => setDetail(null)}
          onPromote={promote}
          onVerify={runVerify}
        />
      )}
      {flash && <FlashToast text={flash} />}
    </>
  );
}

interface TopBarProps {
  theme: Theme;
  view: "home" | "interview" | "overview" | "board" | "leaderboard";
  onNavigate: (view: "home" | "overview" | "leaderboard") => void;
  onTheme: () => void;
  onReference: () => void;
}

function TopBar({ theme, view, onNavigate, onTheme, onReference }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" type="button" onClick={() => onNavigate("home")}>
          <RefreshCw size={19} strokeWidth={2.4} className="brand-mark" />
          <span>Loop Master</span>
        </button>
        <nav className="nav">
          <button type="button" className={view === "home" || view === "interview" ? "active" : ""} onClick={() => onNavigate("home")}>
            new
          </button>
          <button type="button" className={view === "overview" ? "active" : ""} onClick={() => onNavigate("overview")}>
            overview
          </button>
          <button type="button" className={view === "leaderboard" ? "active" : ""} onClick={() => onNavigate("leaderboard")}>
            leaderboard
          </button>
          <button type="button" onClick={onReference}>
            reference
          </button>
        </nav>
        <div className="topbar-actions">
          <button className="theme-btn" type="button" onClick={onTheme}>
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            {theme === "dark" ? "light" : "dark"}
          </button>
          <div className="live-pill">
            <span />
            dispatcher live
          </div>
          <div className="avatar">yu</div>
        </div>
      </div>
    </header>
  );
}

interface HomeViewProps {
  mode: HomeMode;
  prompt: string;
  active: number;
  awaiting: number;
  red: number;
  onMode: (mode: HomeMode) => void;
  onPrompt: (prompt: string) => void;
  onStart: () => void;
  onOverview: () => void;
}

function HomeView({ mode, prompt, active, awaiting, red, onMode, onPrompt, onStart, onOverview }: HomeViewProps) {
  return (
    <main className="home-page">
      <section className="hero-copy">
        <div className="eyebrow">Loop Master</div>
        <h1>What do you want built?</h1>
        <p>Describe it loosely. You’ll be interviewed until it’s unambiguous — then it becomes issues and the loop starts.</p>
      </section>

      <section className="prompt-card">
        <div className="seg-row">
          <button className={mode === "new" ? "seg active" : "seg"} type="button" onClick={() => onMode("new")}>
            + new project
          </button>
          <button className={mode === "existing" ? "seg active" : "seg"} type="button" onClick={() => onMode("existing")}>
            existing project
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          placeholder="e.g. A checkout flow that supports gift cards and Apple Pay, with idempotent orders…"
        />
        <div className="prompt-actions">
          <span>the interviewer will grill you for details</span>
          <button type="button" className="primary-btn" onClick={onStart}>
            Start interview →
          </button>
        </div>
      </section>

      <div className="or-row">
        <span />
        <em>or</em>
        <span />
      </div>

      <button type="button" className="state-card" onClick={onOverview}>
        <div>
          <strong>View current state</strong>
          <small>Projects, the kanban board, and what needs you right now.</small>
        </div>
        <div className="state-metrics">
          <Metric value={active} label="active" />
          <Metric value={awaiting} label="await you" tone="amber" />
          <Metric value={red} label="gate red" tone="red" />
          <span>open →</span>
        </div>
      </button>
    </main>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: "amber" | "red" }) {
  return (
    <div className="metric">
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function OverviewView({ issues, projects, onProject }: { issues: Issue[]; projects: Project[]; onProject: (id: string) => void }) {
  const stats = [
    { label: "Active", value: issues.filter((issue) => issue.s !== "done").length, hint: "open issues" },
    { label: "In progress", value: issues.filter((issue) => issue.s === "inprogress").length, hint: "agents working", tone: "cyan" },
    { label: "Awaiting your merge", value: issues.filter((issue) => issue.s === "review" && issue.g === "green").length, hint: "green · your turn", tone: "amber" },
    { label: "Gates red", value: issues.filter((issue) => issue.g === "red").length, hint: "verify failing", tone: "red" },
    { label: "Blocked", value: issues.filter((issue) => issue.blocked).length, hint: "flagged", tone: "gold" },
  ];
  return (
    <main className="overview-page">
      <PageIntro eyebrow="Operator console" title="Your projects">
        Every unit of work is a GitHub issue. Watch progress across projects — and see exactly what needs you.
      </PageIntro>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div className={`stat-cell ${stat.tone ? `stat-${stat.tone}` : ""}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </div>
        ))}
      </div>

      <section className="activity-panel">
        <div className="section-label">Roster activity · now</div>
        <div className="agent-grid">
          {ROSTER.map((name) => {
            const active = issues.filter((issue) => issue.roles.includes(name) && issue.s !== "done").length;
            const execNow = issues.some((issue) => issue.roles[1] === name && issue.s === "inprogress");
            const revNow = issues.some((issue) => issue.roles[2] === name && issue.s === "review");
            return (
              <div className="agent-card" key={name}>
                <div className="agent-avatar">{initials(name)}</div>
                <div>
                  <strong>
                    {name}
                    <span className={`agent-dot ${execNow ? "running" : revNow ? "reviewing" : ""}`} />
                  </strong>
                  <small>{execNow ? "executing now" : revNow ? "reviewing" : active ? "assigned · idle" : "free"}</small>
                </div>
                <em>{active}</em>
              </div>
            );
          })}
        </div>
      </section>

      <div className="section-label projects-label">Projects</div>
      <div className="projects-grid">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} issues={issues.filter((issue) => issue.p === project.id)} onClick={() => onProject(project.id)} />
        ))}
      </div>
    </main>
  );
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="page-intro">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

function ProjectCard({ project, issues, onClick }: { project: Project; issues: Issue[]; onClick: () => void }) {
  const total = issues.length || 1;
  const counts = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  issues.forEach((issue) => {
    counts[issue.s] += 1;
  });
  const done = counts.done;
  const pct = Math.round((done / total) * 100);
  const awaiting = issues.filter((issue) => issue.s === "review" && issue.g === "green").length;
  const red = issues.filter((issue) => issue.g === "red").length;
  const blocked = issues.filter((issue) => issue.blocked).length;
  const badges = [
    awaiting ? { text: `${awaiting} await merge`, tone: "amber" } : null,
    red ? { text: `${red} gate red`, tone: "red" } : null,
    blocked ? { text: `${blocked} blocked`, tone: "gold" } : null,
  ].filter(Boolean) as Array<{ text: string; tone: string }>;

  return (
    <button className="project-card" type="button" onClick={onClick}>
      <div className="project-head">
        <div>
          <strong>{project.name}</strong>
          <span>{project.repo}</span>
        </div>
        <div className="pct">
          <strong>{pct}%</strong>
          <span>done</span>
        </div>
      </div>
      <div className="progress-track">
        {STAGES.filter((stage) => counts[stage] > 0).map((stage) => (
          <span key={stage} style={{ width: `${(counts[stage] / total) * 100}%`, background: STAGE_ACCENT[stage] }} />
        ))}
      </div>
      <div className="legend-row">
        {STAGES.filter((stage) => counts[stage] > 0).map((stage) => (
          <span key={stage}>
            <i style={{ background: STAGE_ACCENT[stage] }} />
            {counts[stage]} {STAGE_LABEL[stage].toLowerCase()}
          </span>
        ))}
      </div>
      <div className="project-foot">
        <div>{badges.length ? badges.map((badge) => <span key={badge.text} className={`badge badge-${badge.tone}`}>{badge.text}</span>) : <span className="badge badge-blue">on track</span>}</div>
        <small>open board →</small>
      </div>
    </button>
  );
}

interface BoardViewProps {
  issues: Issue[];
  projects: Project[];
  activeProject: string;
  blockedOnly: boolean;
  onOverview: () => void;
  onProject: (id: string) => void;
  onToggleBlocked: () => void;
  onOpenIssue: (id: number) => void;
}

function BoardView({ issues, projects, activeProject, blockedOnly, onOverview, onProject, onToggleBlocked, onOpenIssue }: BoardViewProps) {
  const project = projects.find((item) => item.id === activeProject) ?? projects[0];
  const boardIssues = issues.filter((issue) => issue.p === project.id && (!blockedOnly || issue.blocked));
  return (
    <main className="board-page">
      <div className="board-head">
        <button type="button" className="ghost-btn" onClick={onOverview}>
          ← overview
        </button>
        <div>
          <h1>{project.name}</h1>
          <span>{project.repo}</span>
        </div>
      </div>
      <div className="board-filters">
        {projects.map((item) => (
          <button type="button" key={item.id} className={item.id === project.id ? "pill active" : "pill"} onClick={() => onProject(item.id)}>
            {item.name}
          </button>
        ))}
        <button type="button" className={blockedOnly ? "blocked-filter active" : "blocked-filter"} onClick={onToggleBlocked}>
          <Flag size={12} /> blocked only
        </button>
        <div className="board-legend">
          <span><i className="legend-amber" />verify exit 0</span>
          <span><i className="legend-red" />gate red</span>
          <span><i className="legend-violet" />review</span>
        </div>
      </div>
      <div className="kanban">
        {COLUMNS.map((column) => {
          const cards = boardIssues.filter((issue) => issue.s === column.key);
          return (
            <section className="kanban-col" key={column.key}>
              <header style={{ borderTopColor: column.accent }}>
                <strong>{column.label}</strong>
                <span>{cards.length}</span>
              </header>
              <div className="kanban-cards">
                {cards.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} accent={issue.blocked ? "var(--red)" : column.accent} onClick={() => onOpenIssue(issue.id)} />
                ))}
                {!cards.length && <div className="empty-col">— empty —</div>}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function IssueCard({ issue, accent, onClick }: { issue: Issue; accent: string; onClick: () => void }) {
  const gate = gateMeta(issue.g);
  return (
    <button type="button" className={`issue-card ${issue.blocked ? "blocked" : ""}`} style={{ borderLeftColor: accent }} onClick={onClick}>
      <div className="issue-meta">
        <span className="issue-id">#{issue.id}</span>
        <span className="type-chip">{issue.type}</span>
        {issue.blocked && <span className="blocked-chip"><Flag size={10} /> blocked</span>}
      </div>
      <strong>{issue.t}</strong>
      {issue.reviewReason && <small className="review-reason">↩ changes · {issue.reviewReason}</small>}
      <div className="card-foot">
        <RoleChips roles={issue.roles} />
        <span className={gate.className}>{gate.text}</span>
      </div>
    </button>
  );
}

function RoleChips({ roles }: { roles: [AgentName, AgentName, AgentName] }) {
  return (
    <div className="role-chips">
      {roles.map((role, index) => (
        <span key={`${role}-${index}`} className={index === 2 ? "reviewer" : ""} title={["planner", "executor", "reviewer"][index]}>
          {role}
        </span>
      ))}
    </div>
  );
}

interface LeaderboardViewProps {
  metric: LeaderboardMetric;
  onMetric: (metric: LeaderboardMetric) => void;
}

function LeaderboardView({ metric, onMetric }: LeaderboardViewProps) {
  const ranked = useMemo(
    () =>
      ROSTER.slice().sort((a, b) => {
        const bv = metric === "overall" ? RATINGS[b].overall : RATINGS[b].roles[metric];
        const av = metric === "overall" ? RATINGS[a].overall : RATINGS[a].roles[metric];
        return bv - av;
      }),
    [metric],
  );
  const champion = ranked[0];
  const championRating = RATINGS[champion];
  const championScore = metric === "overall" ? championRating.overall : championRating.roles[metric];

  return (
    <main className="leaderboard-page">
      <PageIntro eyebrow="Leaderboard" title="How the agents score">
        Scored nightly by a blinded grader — never an agent that worked the issue. These ratings drive the next cast: exploit best-fit, sometimes explore.
      </PageIntro>
      <div className="leaderboard-top">
        <section className="champion-card">
          <div className="champion-avatar">{initials(champion)}</div>
          <div>
            <span>#1 · {metric} score</span>
            <strong>{champion}</strong>
            <small>{championRating.n} graded · {Math.round(championRating.merge * 100)}% merged</small>
          </div>
          <div className="champion-score">
            <strong>{championScore.toFixed(1)}</strong>
            <span className={championRating.trend >= 0 ? "trend up" : "trend down"}>{trendText(championRating.trend)}</span>
          </div>
        </section>
        <section className="rank-card">
          <div className="section-label">Rank by</div>
          <div className="seg-row">
            {(["overall", "planner", "executor", "reviewer"] as LeaderboardMetric[]).map((option) => (
              <button key={option} type="button" className={metric === option ? "seg active" : "seg"} onClick={() => onMetric(option)}>
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="leaderboard-rows">
        {ranked.map((name, index) => {
          const rating = RATINGS[name];
          const score = metric === "overall" ? rating.overall : rating.roles[metric];
          return (
            <div className={index === 0 ? "leader-row first" : "leader-row"} key={name}>
              <div className="rank">{index + 1}</div>
              <div className="agent-avatar">{initials(name)}</div>
              <div className="leader-name">
                <strong>{name}</strong>
                <span><i style={{ width: `${(score / 10) * 100}%` }} /></span>
              </div>
              <div className="role-scores">
                {(["planner", "executor", "reviewer"] as const).map((role) => (
                  <span key={role} className={metric === role ? "active" : ""}>
                    {role[0].toUpperCase()} {rating.roles[role].toFixed(1)}
                  </span>
                ))}
              </div>
              <div className="merge-rate"><strong>{Math.round(rating.merge * 100)}%</strong><span>merged</span></div>
              <span className={rating.trend >= 0 ? "trend up" : "trend down"}>{trendText(rating.trend)}</span>
              <strong className="score">{score.toFixed(1)}</strong>
            </div>
          );
        })}
      </div>

      <div className="section-label projects-label">Best-fit by work type · drives routing</div>
      <div className="best-fit-grid">
        {TYPES.map((type) => {
          const best = ROSTER.reduce((current, candidate) => (RATINGS[candidate].types[type] > RATINGS[current].types[type] ? candidate : current), ROSTER[0]);
          const score = RATINGS[best].types[type];
          return (
            <div className="best-fit-card" key={type}>
              <div><span>{type}</span><small>best-fit</small></div>
              <strong>{best} <em>{score.toFixed(1)}</em></strong>
              <div><i style={{ width: `${(score / 10) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

interface InterviewViewProps {
  interview: InterviewState;
  onBack: () => void;
  onRestart: () => void;
  onInput: (value: string) => void;
  onSend: () => void;
  onCreate: () => void;
}

function InterviewView({ interview, onBack, onRestart, onInput, onSend, onCreate }: InterviewViewProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [interview.messages, interview.typing, interview.done]);

  const cats = interview.flow.map((step) => step.cat);
  const doneCount = cats.filter((cat) => interview.covered[cat]).length;
  const canSend = Boolean(interview.input.trim()) && !interview.typing && !interview.done;

  return (
    <main className="interview-page">
      <section className="chat-column">
        <div className="interview-head">
          <button type="button" className="ghost-btn" onClick={onBack}>← home</button>
          <span>Interview · {interview.mode === "existing" ? "existing project" : "new build"}</span>
          <button type="button" onClick={onRestart}>restart</button>
        </div>
        <div className="chat-log" ref={chatRef}>
          {interview.messages.map((message, index) => (
            <div className={message.role === "user" ? "chat-row mine" : "chat-row"} key={`${message.role}-${index}`}>
              <div>
                <span>{message.role === "user" ? "you" : "interviewer"}</span>
                <p>{message.text}</p>
              </div>
            </div>
          ))}
          {interview.typing && <div className="typing">interviewer is typing<span>…</span></div>}
          {interview.done && (
            <section className="brief-card">
              <div className="section-label">Brief → dispatcher</div>
              {cats.filter((cat) => interview.answers[cat]).map((cat) => (
                <div key={cat}>
                  <span>{cat}</span>
                  <p>{interview.answers[cat]}</p>
                </div>
              ))}
              <button type="button" className="primary-btn full" onClick={onCreate}>
                Create issues & start the loop →
              </button>
            </section>
          )}
        </div>
        <div className="chat-input">
          <textarea
            value={interview.input}
            disabled={interview.done}
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Type your answer… (Enter to send)"
          />
          <button type="button" disabled={!canSend} onClick={onSend}>send</button>
        </div>
      </section>
      <aside className="coverage-card">
        <div className="section-label">Coverage</div>
        <strong>{doneCount} / {cats.length} covered</strong>
        <div>
          {cats.map((cat) => (
            <span className={interview.covered[cat] ? "covered" : ""} key={cat}>
              <i /> {cat}
            </span>
          ))}
        </div>
        <p>Answer fully — vague answers get grilled. When every topic is covered, the brief becomes issues.</p>
      </aside>
    </main>
  );
}

function DetailDrawer({ issue, onClose, onPromote, onVerify }: { issue: Issue | null; onClose: () => void; onPromote: (id: number) => void; onVerify: (id: number) => void }) {
  if (!issue) return null;
  const gate = gateMeta(issue.g);
  const next = nextStage(issue.s);
  const canVerify = (issue.g === "red" || issue.g === "pending") && issue.s === "inprogress";
  const blocked = Boolean(issue.blocked);
  const canPromote = !blocked && Boolean(next) && !(issue.s === "inprogress" && next === "review" && issue.g !== "green");
  const promoteLabel = blocked
    ? "Blocked"
    : !next
      ? "Merged — done"
      : issue.s === "inprogress" && next === "review" && issue.g !== "green"
        ? "Gate must pass first"
        : next === "done"
          ? "Merge — final ✓"
          : next === "review"
            ? "Send to review"
            : `Advance to ${STAGE_LABEL[next]}`;
  const promoteHint = blocked
    ? "Unblock this issue before it can advance."
    : !next
      ? "This issue is merged. Nothing comes after Done."
      : issue.s === "inprogress" && next === "review" && issue.g !== "green"
        ? "The reviewer is unreachable on a red build. Run make verify until it exits 0."
        : next === "done"
          ? "Your merge is final. No agent ships code — only you do."
          : next === "review"
            ? "Reviewer reachable — the gate is green."
            : `Move this issue to ${STAGE_LABEL[next]}.`;
  const runText = `{ "t":"edit",   "issue":${issue.id} }\n{ "t":"verify", "cmd":"make verify" }\n${
    issue.g === "green"
      ? '{ "t":"gate",   "result":"exit 0", "ok":true }\n'
      : issue.g === "red"
        ? '{ "t":"gate",   "result":"exit 1", "ok":false }\n'
        : '{ "t":"gate",   "status":"running" }\n'
  }`;
  const gateNote =
    issue.g === "green"
      ? "Green. The reviewer is reachable; your merge is the last step."
      : issue.g === "red"
        ? "Failed. The reviewer cannot be reached until this exits 0."
        : issue.g === "running"
          ? "The dispatcher is running the gate now."
          : "Not yet run. The dispatcher runs make verify — never the agent.";

  return (
    <>
      <button type="button" aria-label="Close drawer" className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" aria-label={`Issue ${issue.id} details`}>
        <div className="drawer-inner">
          <div className="drawer-top">
            <div className="issue-meta">
              <span className="issue-id">#{issue.id}</span>
              <span className="type-chip">{issue.type}</span>
              <span className="state-label" style={{ color: STAGE_ACCENT[issue.s], borderColor: `${STAGE_ACCENT[issue.s]}66`, background: `${STAGE_ACCENT[issue.s]}18` }}>
                {STAGE_LABEL[issue.s]}
              </span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close detail drawer"><X size={20} /></button>
          </div>
          <h2>{issue.t}</h2>
          {issue.blocked && <div className="blocked-callout"><Flag size={13} /> <strong>blocked</strong> · {issue.blocked}</div>}

          <DrawerSection title="The cast">
            <div className="cast-list">
              {(["planner", "executor", "reviewer"] as const).map((role, index) => (
                <div key={role}>
                  <span className={role === "reviewer" ? "reviewer" : ""}>{role}</span>
                  <strong>{issue.roles[index]}</strong>
                  <small>{role === "planner" ? "drafts the plan" : role === "executor" ? "writes & runs the gate" : "signs off on green"}</small>
                </div>
              ))}
            </div>
            <p className="code-note">// graded nightly by an agent that didn’t work this issue</p>
          </DrawerSection>

          <DrawerSection title="Mechanical gate">
            <div className={`gate-panel gate-panel-${issue.g}`}>
              <div>
                <strong style={{ color: gate.color }}>make verify</strong>
                <span className={gate.className}>{gate.text}</span>
              </div>
              <p>{gateNote}</p>
              {canVerify && (
                <button type="button" className="primary-btn small" onClick={() => onVerify(issue.id)}>
                  ▸ dispatcher: run make verify
                </button>
              )}
            </div>
          </DrawerSection>

          {issue.s === "inprogress" && (
            <DrawerSection title="Run stream · ndjson">
              <pre className="run-stream">{runText}<span>▋</span></pre>
            </DrawerSection>
          )}

          {issue.reviewReason && (
            <DrawerSection title="Last review verdict">
              <pre className="review-json">{`{ "verdict": "changes",
  "reason":  "${issue.reviewReason}",
  "notes":   "${REVIEW_NOTES[issue.id] ?? "see thread"}" }`}</pre>
            </DrawerSection>
          )}

          <div className="promote-box">
            <button type="button" className={canPromote ? "primary-btn full" : "disabled-btn"} onClick={() => onPromote(issue.id)}>
              {promoteLabel}
            </button>
            <p>{promoteHint}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer-section">
      <div className="section-label">{title}</div>
      {children}
    </section>
  );
}

function FlashToast({ text }: { text: string }) {
  return <div className="flash-toast">{text}</div>;
}
