# LaneQ

Live queue and wait-time visibility for salons, built so the same engine later
serves car service centres, labs, and clinics with config changes only.

*(LaneQ is a placeholder name. Replace before showing a client.)*

## Documents

| Document | What it is |
|---|---|
| [`laneq-build-prompt.md`](laneq-build-prompt.md) | Architecture spec and the nine-step build prompt |
| [`docs/SPEC-REVIEW.md`](docs/SPEC-REVIEW.md) | Review of that spec — contradictions, gaps, and decisions taken |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase
(Postgres, Auth, Realtime) · Vitest. WhatsApp sending lives entirely in n8n;
this app holds no Meta credentials.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project values
npm run dev
```

Apply `supabase/migrations/0001_init.sql` then `supabase/seed.sql` to your
Supabase project. The seed creates a demo salon with four chairs, six services,
and a login of `owner@demo.test` / `password123`.

```bash
npm test          # ETA engine unit tests
npm run build     # production build
```

## Verification status

Passing, checked automatically:

```bash
npm test        # 16 ETA-engine tests
npm run build   # typecheck + production build
npx eslint .
```

The schema, RLS, per-day token allocation under concurrency, and the
one-in-service-per-lane constraint were all verified against a real Postgres 16.

Four checks need a live Supabase project and have **not** been run:

1. Sign in at `/login` and land on `/board`.
2. Create, rename and deactivate a lane; confirm it survives a reload.
3. Open `/board` in two tabs; adding a walk-in in one updates the other within
   two seconds. If this fails, check the table is in the `supabase_realtime`
   publication — the migration adds it.
4. Open a `/t/<token>` URL in a private window; position and wait must match
   `/board` exactly.

## Layout

```
src/lib/queue.ts          the ETA engine — one pure function, no I/O
src/lib/queue.test.ts     16 tests, no database required
src/proxy.ts              session refresh + logged-out redirect (Next 16 renamed middleware to proxy)
src/app/(staff)/          board, history, setup — auth required, RLS-scoped
src/app/t/[token]/        public tracking page, no auth
src/app/api/hooks/        n8n endpoints, bearer-guarded
supabase/migrations/      schema, RLS, token allocation, realtime publication
```

## Two rules that are easy to break

**Never store an ETA.** Positions and wait times come from `computeQueue` at
read time. Writing one to the database means it is wrong the moment anything
else moves.

**Never hardcode "chair", "stylist" or "salon" in UI copy.** Every such word
comes from `salons.terminology`, which is what lets a car service centre become
Bay / Technician / Job without a code fork.
