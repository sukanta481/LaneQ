# LaneQ — Architecture & Build Prompt

*(LaneQ is a placeholder name. Replace before you show a client.)*

Live queue and wait-time visibility for salons, built so the same engine later serves
car service centres, labs, and clinics with config changes only.

---

## Part 1 — Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15, App Router, TypeScript | One codebase for staff PWA + public tracking page |
| Styling | Tailwind | Fast, no design system needed at this size |
| DB / Auth / Realtime | Supabase | Realtime subscriptions for free; skip writing socket plumbing |
| Automation | n8n (self-hosted) | Owns all WhatsApp sending, cron jobs, retries |
| Messaging | Meta WhatsApp Cloud API — called only from n8n | App never holds Meta credentials |
| Hosting | Vercel (v1) | Zero-ops. Move to VPS when a client needs it |

**Not in v1, deliberately:** Gemini/LLM anything, payments, advance booking, membership
packages, loyalty, inventory, staff attendance, multi-branch, billing.

### Tenancy

Single deployment, many salons. Every domain table carries `salon_id`.
Supabase RLS restricts staff to their own salon. The public tracking page uses a
service-role read scoped to a single `tracking_token`.

### Vertical config lives in data, not code

The `salons.terminology` JSONB column holds the words the UI renders:

```json
{
  "lane_singular": "Chair",
  "lane_plural": "Chairs",
  "operator_singular": "Stylist",
  "service_singular": "Service",
  "customer_singular": "Customer"
}
```

Car service centres become `Bay` / `Technician` / `Job`. No code fork.
The UI must never hardcode the word "chair" or "stylist" anywhere.

### Data model

```
salons
  id uuid pk
  name text
  slug text unique
  timezone text default 'Asia/Kolkata'
  terminology jsonb
  branding jsonb          -- { logo_url, primary_color }
  n8n_webhook_url text    -- where this salon's events are posted
  created_at timestamptz

staff_users
  id uuid pk
  salon_id uuid fk -> salons
  auth_user_id uuid        -- Supabase auth.users
  name text
  role text                -- 'owner' | 'reception'

lanes                      -- chair / bay / counter
  id uuid pk
  salon_id uuid fk
  name text                -- "Rahul", "Chair 3"
  is_active boolean default true
  sort_order int

services
  id uuid pk
  salon_id uuid fk
  name text
  default_duration_min int
  is_active boolean default true

visits                     -- the core table
  id uuid pk
  salon_id uuid fk
  tracking_token uuid default gen_random_uuid()   -- public page key
  token_number int                                -- per salon, per day, display only
  customer_name text
  phone text
  service_id uuid fk -> services
  duration_min int          -- copied from service at creation; editable
  requested_lane_id uuid null fk -> lanes         -- null = "any"
  assigned_lane_id uuid null fk -> lanes          -- set only when service starts
  status text               -- 'waiting' | 'in_service' | 'done' | 'walked_out' | 'no_show'
  created_at timestamptz    -- arrival; also the queue ordering key
  started_at timestamptz null
  ended_at timestamptz null
  notified_created_at timestamptz null
  notified_almost_at timestamptz null
```

Indexes: `visits (salon_id, status, created_at)`, `visits (tracking_token)`.

**Not in v1:** a `lane_services` join table. Every lane can perform every service.
Add it only when a client actually has a lane that can't do something.

### The ETA function — the only non-trivial logic

`lib/queue.ts` exports one pure function. No DB access, no I/O, fully testable.

```ts
type Lane = { id: string; name: string }

type Visit = {
  id: string
  durationMin: number
  requestedLaneId: string | null
  assignedLaneId: string | null
  status: 'waiting' | 'in_service'
  createdAt: Date
  startedAt: Date | null
}

type QueueEntry = {
  visitId: string
  position: number        // 1-based, within the whole salon
  laneId: string          // projected lane
  estimatedStartAt: Date
  estimatedWaitMin: number
}

export function computeQueue(
  visits: Visit[],
  lanes: Lane[],
  now: Date
): QueueEntry[]
```

Algorithm:

1. Initialise `freeAt[laneId] = now` for every active lane.
2. For each `in_service` visit: `freeAt[assignedLaneId] = max(now, startedAt + durationMin)`.
   Never project a lane as free in the past.
3. Sort `waiting` visits by `createdAt` ascending.
4. For each waiting visit, in order:
   - eligible lanes = `[requestedLaneId]` if set, else all active lanes
   - pick the eligible lane with the smallest `freeAt` (tie-break: lane `sort_order`)
   - `estimatedStartAt = freeAt[chosen]`
   - `freeAt[chosen] += durationMin`
   - `estimatedWaitMin = max(0, round((estimatedStartAt - now) / 60000))`
5. Return entries in queue order.

**Required tests** (`lib/queue.test.ts`) — write these before the UI:

1. Empty queue → returns `[]`
2. One waiting, one free lane → wait is 0
3. One in-service overrunning its duration → next customer's `freeAt` is `now`, not a past time
4. Three waiting, two lanes → third is projected behind the earlier of the two
5. Requested-lane visit waits for that lane even when another lane is free
6. Requested-lane and any-lane visits interleave correctly by arrival order
7. Inactive lane is never assigned
8. Two lanes free at the same instant → tie broken by `sort_order`, deterministically
9. `walked_out` / `done` / `no_show` visits are ignored entirely
10. Same input always yields the same output (no `Date.now()` inside the function)

### Routes

**Staff (auth required, RLS-scoped)**

| Route | Purpose |
|---|---|
| `/login` | Supabase email + password |
| `/board` | Live queue. Add walk-in, Start, Done, Walked out. Default landing page. |
| `/setup/lanes` | CRUD lanes |
| `/setup/services` | CRUD services and default durations |
| `/history` | Today's visits, filterable by status |

**Public (no auth)**

| Route | Purpose |
|---|---|
| `/t/[token]` | Customer tracking page. Position, ETA, lane name. Auto-refreshes. |

**API (called by n8n only, guarded by a shared bearer token in `N8N_API_SECRET`)**

| Route | Purpose |
|---|---|
| `GET /api/hooks/pending-notifications` | Visits whose `estimatedStartAt` is within 10 min and `notified_almost_at IS NULL` |
| `POST /api/hooks/mark-notified` | Sets `notified_almost_at` / `notified_created_at` |
| `GET /api/hooks/daily-summary?salon_id=` | Today's counts for the owner's evening message |

### The `/board` screen — get this one right

Reception uses this 60+ times a day on a tablet, standing up, often one-handed.

- Columns = lanes. Each column shows the in-service customer plus a projected list beneath.
- A separate "Waiting — any lane" strip at the top for unassigned arrivals.
- Big **+ Walk-in** button, bottom-right, thumb-reachable.
- Add-walk-in form is 4 fields: name, phone, service (chips, not a dropdown), lane (chips, with "Any" first and selected by default). Under 10 seconds to complete.
- Row actions are large tap targets: **Start**, **Done**, **Walked out**.
- **Walked out** must be one tap with no confirmation dialog. It is the single most
  important number in the product and reception will not use it if it costs them friction.
- Realtime: subscribe to `visits` for this `salon_id`; on any change, refetch and
  recompute with `computeQueue`. Also recompute on a 30-second interval so ETAs
  tick down while nothing changes.

### Event flow to n8n

The app POSTs to `salons.n8n_webhook_url` on:

```json
{ "event": "visit_created", "salon_id": "...", "visit_id": "...",
  "customer_name": "...", "phone": "...", "position": 3,
  "estimated_wait_min": 25, "tracking_url": "https://.../t/<token>" }
```

n8n workflows:

1. **On `visit_created`** → send WhatsApp utility template with position, ETA, tracking link → call `mark-notified`.
2. **Cron, every minute** → `GET /api/hooks/pending-notifications` → send "almost your turn" → `mark-notified`. The `notified_almost_at` column is what prevents duplicate sends; do not rely on n8n state.
3. **Cron, 21:00 IST** → `GET /api/hooks/daily-summary` for each salon → WhatsApp the owner: walk-ins, served, walked out, average wait, busiest lane.

Retries, template management, and Meta credentials stay in n8n. The app has no
knowledge of WhatsApp.

### Environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
N8N_API_SECRET=
NEXT_PUBLIC_APP_URL=
```

---

## Part 2 — Build prompt for Claude Code

Paste everything below into Claude Code, with this file present in the repo.

---

Build LaneQ, a multi-tenant live-queue app for salons, per the architecture spec in
`laneq-build-prompt.md` in this repo. Read it fully before writing code.

**Stack:** Next.js 15 App Router + TypeScript + Tailwind, Supabase (Postgres, Auth,
Realtime), deployed on Vercel.

**Build order. Do not skip ahead — each step must pass its check before the next.**

1. **Scaffold.** `create-next-app` with TypeScript, Tailwind, App Router, src dir.
   Add `@supabase/supabase-js` and `@supabase/ssr`. Add Vitest.
   → Verify: dev server boots, `npm test` runs with zero tests.

2. **Schema.** Write `supabase/migrations/0001_init.sql` with every table, index,
   and RLS policy from the spec. Staff read/write only rows where `salon_id` matches
   their `staff_users` row. Add a `supabase/seed.sql` with one demo salon, 4 lanes,
   6 services (Haircut 25, Beard 15, Hair Colour 90, Facial 45, Hair Spa 40,
   Global Colour 150), and one staff user.
   → Verify: migration and seed apply cleanly to a local Supabase instance.

3. **ETA engine.** Write `src/lib/queue.ts` exactly as specified — one pure function,
   no imports, no `Date.now()` inside it. Then write `src/lib/queue.test.ts` covering
   all ten listed cases.
   → Verify: all ten tests pass. Do not proceed until they do.

4. **Auth + shell.** `/login` with Supabase email/password. Middleware protecting
   everything except `/login` and `/t/*`. A layout that loads the current staff user's
   salon and exposes `terminology` via React context.
   → Verify: logged-out user hitting `/board` lands on `/login`; logged-in user sees
   their salon name.

5. **Setup screens.** `/setup/lanes` and `/setup/services` — plain CRUD tables with
   inline add and edit. No modals.
   → Verify: create, rename, deactivate a lane; changes persist after reload.

6. **The board.** `/board` per the spec — lane columns, the "any lane" strip, the
   walk-in form, Start / Done / Walked out actions. Wire the Supabase realtime
   subscription plus a 30-second recompute interval. All queue positions and ETAs
   must come from `computeQueue`; never store an ETA in the database.
   → Verify: open two browser tabs; adding a walk-in in one updates the other within
   two seconds without a manual refresh.

7. **Tracking page.** `/t/[token]` — server-rendered, no auth, reads by
   `tracking_token` only. Shows first name, position, estimated wait, lane name,
   and a "we'll message you when it's nearly your turn" line. Auto-refresh every
   30 seconds. Returns 404 for unknown tokens and for visits already `done`,
   `walked_out`, or `no_show`.
   → Verify: the token URL works in a private window with no session; position and
   ETA match `/board` exactly.

8. **n8n endpoints.** The three API routes from the spec. All must reject requests
   without `Authorization: Bearer ${N8N_API_SECRET}`. Fire the `visit_created` POST
   to `salons.n8n_webhook_url` after a walk-in is created — non-blocking, and a
   failed webhook must never fail the walk-in.
   → Verify: curl each route with and without the bearer token; creating a walk-in
   with an unreachable webhook URL still succeeds.

9. **`/history`.** Today's visits in a table, filterable by status, with the day's
   counts at the top.
   → Verify: a walked-out visit appears with the correct status.

**Rules:**

- Build nothing beyond the nine steps. If you think a feature is missing, list it at
  the end instead of building it.
- No abstractions used in only one place. No config options nobody asked for.
- Never hardcode "chair", "stylist", or "salon" in UI copy — read from `terminology`.
- Every timestamp is stored UTC and rendered in the salon's timezone.
- The board is used one-handed on a tablet: tap targets 44px minimum, primary actions
  reachable in the lower half of the screen.
- Stop and ask if any part of the spec is ambiguous. Do not guess.

When all nine steps pass their checks, report: what you built, anything in the spec
you had to interpret, and any feature you were tempted to add and didn't.
