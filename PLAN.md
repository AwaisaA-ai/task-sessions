================================================================================
PLAN.md — Task-Based Chat Sessions (Desktop v1)
Handoff document for Claude Code / OpenCode
================================================================================

--------------------------------------------------------------------------------
0. PROJECT BRIEF (READ THIS FIRST)
--------------------------------------------------------------------------------

Build a local-first desktop application where a user creates sessions
(chat-like workspaces), adds tasks inside each session, and sees a progress bar
update in real time as tasks are marked done. Desktop only: Windows, macOS,
Linux.

v1 is single-user and fully offline. A local SQLite database is the source of
truth. No auth, no cloud, no network calls in v1. The schema is designed so
sync/auth can be added later without migrations that break v1 data.

THE CORE ACCEPTANCE CRITERION FOR THE ENTIRE PROJECT:
Marking a task done updates the progress bar visibly in under 100 ms, is
announced to screen readers, and survives an app restart.

--------------------------------------------------------------------------------
1. LOCKED TECHNICAL DECISIONS (DO NOT SUBSTITUTE)
--------------------------------------------------------------------------------

  Area        | Decision
  ------------|-----------------------------------------------------------------
  Shell       | Tauri 2 (Rust thin layer; bundle <30 MB, ~20 MB shell memory)
  Frontend    | React 18 + TypeScript + Vite
  Local DB    | SQLite via tauri-plugin-sql (SQLite feature), plugin migration API
  State       | React Query for DB-backed reads/writes; no global store unless needed
  Tests       | Vitest for pure logic; React Testing Library for components
  Lint/format | ESLint + Prettier, strict TS (strict: true, no `any`)
  Styling     | CSS Modules (no UI kit; custom UI needed for a11y control)

Fallback only if Tauri toolchain blocks you: Electron + the same React/TS/SQLite
code. Treat the src/ app as ~90% portable; do not architect around Tauri-specific
APIs beyond the SQL plugin and window chrome.

Why this stack for a desktop-first build: TypeScript/React is where coding agents
are strongest and iterate fastest; the Rust surface stays small (window + SQL
plugin); Tauri 2 also has a mobile path, so the eventual mobile version is not a
rewrite.

--------------------------------------------------------------------------------
2. REPOSITORY LAYOUT (TARGET STATE)
--------------------------------------------------------------------------------

task-sessions/
├── src/                        # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── db/
│   │   ├── client.ts           # tauri-plugin-sql init + migrations
│   │   ├── sessions.ts         # session repository
│   │   └── tasks.ts            # task repository
│   ├── domain/
│   │   ├── progress.ts         # pure progress calculation
│   │   ├── progress.test.ts
│   │   ├── filters.ts          # pure filter predicates
│   │   └── filters.test.ts
│   ├── features/
│   │   ├── sessions/           # SessionList, SessionRow, NewSessionDialog
│   │   └── session-detail/     # SessionDetail, ProgressHeader, TaskComposer,
│   │                           # TaskRow, DoneSection
│   ├── components/             # ProgressBar, EmptyState, ConfirmDialog, StatusChip
│   ├── a11y/                   # LiveRegion, useKeyboardShortcuts
│   └── styles/
├── src-tauri/
│   ├── tauri.conf.json
│   ├── capabilities/default.json   # explicit permissions only
│   └── src/main.rs
├── PLAN.md
└── README.md

--------------------------------------------------------------------------------
3. DATA MODEL (ACTUAL DDL — USE VERBATIM)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,              -- UUID v4, client-generated
  title      TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,                 -- ISO-8601 UTC, ms precision
  updated_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK(status IN ('active','completed','archived')),
  deleted_at TEXT,                          -- soft delete
  owner_id   TEXT                           -- NULL in v1; reserved for auth
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,             -- UUID v4
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 1000),
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)),
  due_date    TEXT,                         -- ISO-8601 date or NULL
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_session
  ON tasks(session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status) WHERE deleted_at IS NULL;

Rules the agent must enforce in code:
  - Every read filters deleted_at IS NULL.
  - Every write sets updated_at to current UTC.
  - IDs are UUID v4 generated client-side; never autoincrement.
  - Soft delete only for sessions and tasks; never hard-delete in v1.

--------------------------------------------------------------------------------
4. PROGRESS CALCULATION — EXACT CONTRACT
--------------------------------------------------------------------------------

src/domain/progress.ts exports:

  export type Progress = {
    total: number;
    done: number;
    percent: number;
    label: string;
  };
  export function computeProgress(
    tasks: Pick<Task, 'isDone' | 'deletedAt'>[]
  ): Progress;

  Case                    | Expected
  ------------------------|------------------------------------------------
  0 live tasks            | { total:0, done:0, percent:0,
                          |   label:"No tasks yet" }
  1 of 3 done             | { total:3, done:1, percent:33,
                          |   label:"1 of 3 tasks done" }
  3 of 3 done             | { total:3, done:3, percent:100,
                          |   label:"All 3 tasks done" }
  tasks all soft-deleted  | treated as 0 live tasks
  percent rounding        | Math.round(done / total * 100)

Never auto-complete a session. status changes to 'completed' only on explicit
user action.

--------------------------------------------------------------------------------
5. MILESTONES (EXECUTE IN ORDER; STOP AND REPORT AFTER EACH)
--------------------------------------------------------------------------------

Each milestone must end with ALL verification commands green before starting
the next.

--- M0 — Scaffold (1/2 day) ---
  - npm create tauri-app (React + TS + Vite), pin versions in package.json.
  - Add ESLint, Prettier, Vitest; strict TS.
  - Window: 1100x760 default, min 800x600, app title "Task Sessions".
  - capabilities/default.json grants only core:default + SQL plugin permissions.

  Verify: npm run tauri dev opens a window;
          npm run typecheck && npm run lint && npm run test all pass.

--- M1 — Data layer (1 day) ---
  - Register tauri-plugin-sql with SQLite; run migration in section 3 via the
    plugin's migration API.
  - db/sessions.ts, db/tasks.ts: typed repository functions —
      listSessions, createSession, renameSession, setSessionStatus,
      softDeleteSession, listTasks(sessionId), createTask, updateTask,
      toggleTask, softDeleteTask.
  - domain/progress.ts + full unit test suite from section 4.

  Verify: npm run test covers every progress case; a temporary debug button can
          create a session with 3 tasks and read them back after app restart.

--- M2 — Session list (1 day) ---
  - Home screen per wireframe: header + "New session" button (visible, not a
    FAB), search field (title only in M2), filter chips
    (All / Active / Completed / Archived).
  - Row: title, compact progress bar (~6 px) + done/total text, status chip,
    relative "updated" time.
  - Empty state: one sentence + primary button.
  - Create/rename via modal dialog with labelled input; archive and delete
    behind a confirm dialog.

  Verify: create -> rename -> archive -> search -> restore from Archived filter,
          all with keyboard only.

--- M3 — Session detail + real-time progress (1.5 days) ---
  - Sticky header: editable title, status chip, prominent determinate progress
    bar with visible percent and done/total text adjacent (never hover-only).
  - Add-task composer directly under the header, always reachable: labelled text
    input, optional due-date picker, "Add task" button; Enter submits,
    Shift+Enter newline.
  - Open tasks list; completed tasks in a "Done" section below, de-emphasized.
    No reordering while a user is interacting.
  - Row: large checkbox (>=44x44), description, due-date label, overflow menu
    (Edit, Delete).
  - Toggling a task recomputes progress immediately (optimistic React Query
    mutation, invalidate on settle).

  Verify: manual smoke test in section 7 passes; toggling updates the bar
          without a visible flash or full re-render of the list.

--- M4 — Accessibility hardening (1 day) ---
  - Progress bar: native <progress> with aria-label; pair with visually hidden
    aria-live="polite" status element that updates only on percent change
    (throttled).
  - Checkbox: real <input type="checkbox"> with accessible name from task
    description; Space toggles, Enter opens edit.
  - Visible focus rings everywhere (:focus-visible), logical tab order, no
    keyboard traps; dialogs trap focus and restore it on close.
  - Overdue/done states conveyed by icon or text, never color alone.
  - Respect prefers-reduced-motion: instant progress width change.
  - Desktop shortcuts: Ctrl/Cmd+N new session, Ctrl/Cmd+K focus search,
    Esc close dialog.

  Verify: NVDA (Windows) or VoiceOver (macOS) announces progress changes;
          complete the full core loop using keyboard only.

--- M5 — Search, filter, export (1 day) ---
  - Extend search to task descriptions (SQL LIKE is acceptable in v1; note
    FTS5 as a future upgrade).
  - Filters combine: status + due-date window + session.
  - Export CSV and JSON from the local DB, respecting the active filter;
    filename {session-title}_{YYYY-MM-DD}.csv (slugified); trigger via native
    save dialog.

  Verify: export a filtered view, open the CSV, confirm row count matches
          visible count.

--- M6 — Packaging and handoff (1/2 day) ---
  - App icons; Tauri bundles for the host OS.
  - README.md: prerequisites, dev/build/run commands, known limitations
    (single-user, no sync).
  - Write CHANGELOG.md with what shipped in v1.

  Verify: install the produced bundle on a clean machine (or fresh user
          profile) and run the section 7 smoke test.

--------------------------------------------------------------------------------
6. POST-MVP (DO NOT BUILD IN V1)
--------------------------------------------------------------------------------

Deferred deliberately: auth, cloud sync, multi-device, activity log, templates,
bulk actions, notifications.

Rationale: a desktop app with local SQLite is fully functional standalone, and
sync is the highest-risk subsystem. Do not let it block the desktop MVP.

Seams to leave in place now so sync is additive later:
  - UUID PKs (done)
  - updated_at on every row (done)
  - soft delete with deleted_at (done)
  - nullable owner_id (done)
  - all DB access behind db/*.ts repositories so a sync layer can wrap them

--------------------------------------------------------------------------------
7. FIRST-RUN SMOKE TEST (DEFINITION OF DONE FOR V1)
--------------------------------------------------------------------------------

  1. Launch app -> empty state visible.
  2. Create session "Weekly review" -> appears in list at 0%.
  3. Open it, add tasks "A", "B", "C" -> progress reads 0% / 0 of 3.
  4. Mark "A" done -> progress reads 33% / 1 of 3, announced by screen reader.
  5. Mark all done -> 100% / All 3 tasks done, no auto-status change.
  6. Quit app, relaunch -> session and all task states persist.
  7. Delete session -> disappears from All, appears under Archived / recoverable
     per M2 behavior.
  8. Export the session -> file opens with 3 task rows.

--------------------------------------------------------------------------------
8. GUARDRAILS FOR THE AGENT
--------------------------------------------------------------------------------

DO:
  - One milestone per session; run the verification commands before reporting
    done.
  - Keep all pure logic (progress.ts, filters.ts) unit-tested and
    framework-free.
  - Keep DB access only in src/db/.
  - Prefer deleting code to adding dependencies.

DO NOT:
  - Add a UI kit, state library, router, or ORM without asking.
  - Make network calls, add auth, or add sync in v1.
  - Auto-complete sessions, hard-delete rows, or use autoincrement IDs.
  - Use placeholder-only labels, hover-only information, color-only status, or
    div-based progress bars.
  - Touch src-tauri/ beyond config/capabilities unless a milestone requires it.

--------------------------------------------------------------------------------
9. KICKOFF PROMPT (PASTE TO THE AGENT)
--------------------------------------------------------------------------------

Read PLAN.md fully. Implement M0 only. Do not start M1. Follow section 1 stack
decisions exactly and section 8 guardrails. When finished, run
`npm run typecheck && npm run lint && npm run test`, paste the output, list files
created, and stop for review.

After M0 is reviewed, repeat the same prompt with the next milestone number.

================================================================================
END OF PLAN
================================================================================