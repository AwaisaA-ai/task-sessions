# Supabase setup (optional cloud sync)

Task Sessions v2 can mirror your local SQLite store to a [Supabase](https://supabase.com)
Postgres database so the same sessions can be opened on another device. **Sync is strictly
optional**: the app works 100% offline with or without it, and nothing forces you to turn it on.

This guide is for connecting your own Supabase project.

---

## What gets created in the database

The app expects two tables plus one helper table:

```sql
create table public.sessions (
  id         text primary key,
  title      text not null check (length(title) between 1 and 200),
  created_at text not null,
  updated_at text not null,
  status     text not null default 'active'
             check (status in ('active','completed','archived')),
  deleted_at text,
  owner_id   uuid,
  dirty      integer not null default 0,
  synced_at  text
);

create index public.idx_sessions_dirty
  on public.sessions (dirty) where dirty = 1;

create table public.tasks (
  id          text primary key,
  session_id text not null references public.sessions (id) on delete cascade,
  description text not null check (length(description) between 1 and 1000),
  is_done     boolean not null default false,
  due_date    text,
  sort_order  integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  owner_id    uuid
);

create index public.idx_tasks_dirty
  on public.tasks (dirty) where dirty = 1;
```

The local schema (`electron/db/connection.ts`) already has the `dirty` / `synced_at` columns;
the Supabase side mirrors them with the same names because the sync engine talks to Postgres
through those columns.

### Row Level Security (important)

Enable RLS on both tables and add a policy that scopes every row to the signed-in user:

```sql
alter table public.sessions enable row level security;
alter table public.tasks enable row level security;

create policy "users can read own sessions"
  on public.sessions for select
  using (auth.uid() = owner_id);

create policy "users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = owner_id);

create policy "users can update own sessions"
  on public.sessions for update
  using (auth.uid() = owner_id);

create policy "users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = owner_id);

create policy "users can read own tasks"
  on public.tasks for select
  using (auth.uid() = owner_id);

create policy "users can insert own tasks"
  on public.tasks for insert
  with check (auth.uid() = owner_id);

create policy "users can update own tasks"
  on public.tasks for update
  using (auth.uid() = owner_id);

create policy "users can delete own tasks"
  on public.tasks for delete
  using (auth.uid() = owner_id);
```

### Notes

- `owner_id` is a `uuid` referencing `auth.users.id` (Supabase's built-in auth user). The client
  sends the user id of the signed-in account.
- The `tasks.session_id` foreign key keeps the "sessions first, tasks second" push order
  correct.
- The free tier is plenty for personal use (500 MB database, 50k MAU).
- If you do not want email confirmation, disable it in **Authentication → Sign In / Up → Confirm
  email** while creating the project.

---

## Connecting the app

1. Create a project at <https://supabase.com/dashboard>.
2. Copy the **Project URL** and the **anon public** key from **Project Settings → API**.
3. Open Task Sessions, click the sync panel at the bottom of the sidebar and choose
   **Set up cloud sync**.
4. Paste the URL and anon key, save, then **Sign in** with your email and password (or create an
   account).
5. The app runs its first sync right after sign-in and every write afterwards.

The credentials are stored only on this machine via Electron `safeStorage` (OS keychain); the
plain-text fallback is used only on platforms without a backend.

---

## How sync behaves

- **Full pull per sync round** - no cursor; the app pulls all rows of the signed-in user and merges.
- **Last write wins** by `updated_at` (compared in epoch milliseconds). Equal timestamps keep the
  local copy; a dirty local row is pushed instead of being overwritten.
- **Soft deletes** are synced as tombstones (the `deleted_at` flag) - nothing is ever hard deleted.
- **Adoption**: rows created before the first sign-in are assigned the signing-in user and uploaded.
- **Retries**: the next background sync (60 s interval, 1.5 s debounce after writes) pushes whatever
  is still marked `dirty = 1`.
- **Offline**: with no network the sync round fails, the status shows the error and changes stay
  local. The app never blocks its normal use.

## Known limits

- Last write wins only - if two devices edit the same row, the newest `updated_at` wins. Concurrent
  edits inside the same millisecond are resolved in favour of the local device.
- No realtime subscriptions yet (sync is pull-based).
- One signed-in user per app profile; signing in as a different account does not reassign existing
  rows.
