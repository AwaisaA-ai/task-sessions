# Changelog

## 2.1.0 — general settings

### Added

- **General settings dialog** — a gear icon in the session list header (next to "New session") opens
  app-wide preferences.
- **Theme** — System / Light / Dark, applied immediately through `data-theme` on the root element and
  persisted in `localStorage` (UI preference, not user data).
- **Reduce motion** — switches off transitions and animations app-wide, initialised from the OS
  `prefers-reduced-motion` setting and persisted the same way.
- **Smoke coverage** — settings dialog, live theme/motion changes and persistence across a reload
  (26 checks now).

### Changed

- The OS-only dark palette moved to an explicit `:root[data-theme='dark']` block so the in-app theme
  choice can override it in either direction.
- Removed the temporary gear icon from the sidebar sync panel; sync setup stays on its existing
  "Set up cloud sync" / "Change cloud project" buttons.
- The window now opens inside the display work area and clamps its minimum size to it, so the sidebar
  footer (sync panel) is no longer clipped behind the taskbar on short or high-DPI screens.
- Dialog bodies scroll while the title, description and footer stay visible on short screens.

## 2.0.0 — optional Supabase cloud sync

Second feature slice on top of the shipped desktop app. Local-first behaviour is unchanged: the
database remains the source of truth and everything works offline.

### Added

- **Cloud sync (optional)** — last-write-wins sync against a Supabase Postgres project with RLS.
- **Sync schema v2** — `dirty` flags, `synced_at` bookkeeping and `owner_id` on tasks, plus a
  partial index per dirty column. Existing v1 data migrates transparently.
- **Sync engine** — adopt local rows → pull → merge → push dirty → mark clean. Soft deletes sync as
  tombstones; equal timestamps keep the local copy.
- **Auth** — email/password sign-in and sign-up through Supabase, access token held in the main
  process (Electron `safeStorage`, plaintext fallback), token refresh on app start.
- **Background sync** — debounced (1.5 s) after successful writes, 60 s interval; status broadcast to
  the renderer.
- **UI** — sidebar sync panel (offline / signed-out / syncing / idle / error), optional setup dialog
  (Supabase URL + anon key, then auth), dismissible first-launch onboarding banner.
- **Tests** — sync engine against an in-memory fake remote: adoption, convergence, LWW conflicts,
  tombstones, rollback on corrupt rows, mark-clean guards (9 new tests).
- **Task multi-select + bulk delete** — checkbox per task row, "N tasks selected" bar with
  "Delete selected" / "Clear"; the mutation removes every selected task (soft delete) and fixes the
  progress counts. Covered by a new smoke check (21 checks now).

### Changed

- Mutation lifecycle: toggle/delete no longer refetch the list, so optimistic updates cannot be
  reverted by a stale refetch (verified fix from v1.0.x).
- Smoke test extended to 20 checks (onboarding banner + sync dialog flow).

### Deferred

- Realtime subscriptions, task-level undo UI, FTS5 search, drag-and-drop reorder, installer runs,
  multi-user per device.

## 1.0.0 — desktop v1

First shippable slice of the Task Sessions plan (`PLAN.md`), built on the approved Electron fallback
instead of Tauri (no Rust / MSVC toolchain on the target machine).

### Added

- **Sessions** — create, inline rename, status select (Active / Completed / Archived), archive,
  soft delete, restore from the Archived filter.
- **Tasks** — composer with Enter-to-add and Shift+Enter newline, optional due date, inline edit
  dialog, delete, done section, stable sort order.
- **Real-time progress** — optimistic React Query mutation with rollback on failure; the bar moves in
  12–20 ms (limit: 100 ms) and the sidebar count follows immediately.
- **Accessibility** — native `<progress>` / `<input type="checkbox">`, `aria-live="polite"` progress
  announcements throttled to percentage changes, native `<dialog>` focus trapping, 44×44 hit targets,
  text (not colour) for every status, reduced-motion support, full keyboard flow.
- **Search & filters** — session search across titles and task text, status chips, overdue/today/next-7-days task filters, 300 ms debounce.
- **Export** — CSV and JSON through the native save dialog, filenames `{slug}_{YYYY-MM-DD}.{ext}`.
- **Persistence** — local SQLite (`node:sqlite`) with `PRAGMA user_version` migrations, WAL mode, soft deletes,
  UUID v4 keys, ISO-8601 UTC timestamps.
- **Tooling** — strict TypeScript, ESLint, Prettier, Vitest (68 tests), Playwright smoke test (20 checks), electron-builder
  config for Windows/macOS/Linux.

### Deferred (deliberately)

- Cloud sync / auth, multi-device, activity log, templates, bulk actions, notifications.

## 1.0.1 — patch

- Fixed a stale-refetch race that could revert a checkbox after rapid toggles.
- Fixed the Vite dev server host binding (`127.0.0.1`) and CSP dev connection rules.
