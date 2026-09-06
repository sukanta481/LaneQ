# LaneQ spec review

Review of `laneq-build-prompt.md` as written, before any code exists.
Line numbers refer to that file.

The scope is good: the "not in v1" list, the pure ETA function, and keeping
WhatsApp entirely behind n8n are all the right calls. What follows is what
should be settled before step 1, ordered by how much rework it prevents.

---

## Blocking — the spec contradicts itself

### 1. The `Lane` type cannot satisfy tests 7 and 8

Line 112 declares:

```ts
type Lane = { id: string; name: string }
```

But test 7 (line 162) requires "inactive lane is never assigned" and test 8
(line 163) requires the tie-break to use `sort_order`. Neither field exists on
the type, so neither test can be written against the pure function.

**Resolution:** widen the type to
`{ id: string; name: string; sortOrder: number; isActive: boolean }`.
The alternative — moving both cases to caller-level tests — defeats the point
of making `computeQueue` pure and fully testable.

### 2. A requested lane that has since been deactivated has no defined behaviour

Line 147: `eligible lanes = [requestedLaneId] if set, else all active lanes`.

If that requested lane is now inactive, the eligible set is empty. The
algorithm then either throws or silently drops the visit from the queue.

**Resolution:** fall back to "any active lane" and flag the visit on the board
so reception can re-assign. A customer physically standing in the salon must
never disappear from the queue. Add this as an eleventh test case.

### 3. Unclear whether `computeQueue` returns entries for `in_service` visits

Steps 3–5 (lines 144–151) only walk `waiting` visits, but `/t/[token]` 404s
only on `done` / `walked_out` / `no_show` (line 288). So an in-service customer
loads a tracking page for which no queue entry exists.

**Resolution:** pick one and write it down — either return in-service visits
with `position: 0`, or state that the tracking page renders a distinct
"you're in the chair now" state without calling the function at all.

### 4. Step 1's own verification gate fails

Line 254: "Verify: dev server boots, `npm test` runs with zero tests."

Vitest exits with code **1** when it finds no test files. Add
`--passWithNoTests` to the test script, or write a trivial smoke test.

---

## Gaps that surface in the first week

### 5. `token_number` has no allocation mechanism

Line 87 defines it as "per salon, per day" with no mechanism. Two receptionists
adding walk-ins at the same moment both read the same `max + 1`.

**Resolution:** allocate in Postgres — a per-salon-per-day counter row updated
in the same transaction, or an advisory lock — plus a unique index on
`(salon_id, service_date, token_number)`.

The day boundary must be computed as
`(created_at AT TIME ZONE salons.timezone)::date`. Plain `date(created_at)` on
a `timestamptz` resolves in the server's timezone and will roll the counter at
the wrong instant.

### 6. `pending-notifications` cannot work as specified

Line 188 filters on `estimatedStartAt`, which by the rule on line 281 is never
stored in the database. The route therefore has to load every salon's waiting
visits, run `computeQueue` per salon, and filter in memory — every minute.

Two consequences the spec should state explicitly:

- It iterates **all** salons. Unlike `daily-summary` (line 190) it takes no
  `salon_id` parameter.
- Each returned row must carry its salon's `n8n_webhook_url`, or n8n has no way
  to know which WhatsApp configuration to send with.

### 7. RLS recursion on `staff_users`

The obvious policy —
`visits.salon_id IN (SELECT salon_id FROM staff_users WHERE auth_user_id = auth.uid())`
— recurses as soon as `staff_users` gets a policy of its own.

**Resolution:** a `SECURITY DEFINER` helper (`auth_salon_id()`), or carry
`salon_id` in the JWT app_metadata. Cheap at step 2, an afternoon lost if it is
discovered at step 6.

### 8. Realtime needs to be enabled explicitly

Step 6 (line 283) subscribes to `visits`, but the table must first be added to
the publication:

```sql
alter publication supabase_realtime add table visits;
alter table visits replica identity full;  -- if old-record payloads are wanted
```

Without it the two-tab verification silently never fires and looks like a
client bug.

### 9. The fire-and-forget webhook dies on Vercel

Line 295 asks for a non-blocking POST after a walk-in is created. An un-awaited
`fetch` is killed when the serverless invocation freezes.

**Resolution:** `after()` from `next/server` (stable in Next 15.1;
`unstable_after` in 15.0). "Non-blocking" and "actually sent" are not the same
thing on this platform.

### 10. `no_show` is unreachable

The status appears in the enum (line 94) but no UI action produces it. Either
add it to the row actions or drop it from the v1 enum.

---

## Product judgement calls worth revisiting

### 11. Overrunning services silently under-promise

Line 142 clamps `freeAt` to `now`, so a chair twenty minutes over its estimate
is projected to free up *instantly*. Every downstream ETA inherits that, and
the "almost your turn" message fires early — precisely the failure that teaches
customers to ignore the product.

**Suggestion:** `max(now + graceMin, startedAt + durationMin)` with a small
grace value, and flag overrunning lanes on the board so reception hits Done.

### 12. A projected lane name is a promise that cannot be kept

Line 286 shows the lane name on the tracking page. For an "any lane" visit the
projected lane reshuffles on every change, so the customer may be told Chair 2
and seated at Chair 3.

**Suggestion:** show the lane name only when it is actually assigned or was
explicitly requested. Otherwise lead with the ETA and omit the lane.

### 13. Service-role read on the public page

Line 30. To compute position, the tracking page must read every waiting visit
in that salon — including other customers' names and phone numbers.

**Mitigations:** project only
`id, duration_min, requested_lane_id, assigned_lane_id, status, created_at, started_at`
in that query, and never let those rows reach the client payload. A
`SECURITY DEFINER` RPC taking the token is safer than handing a public route a
full-bypass key.

### 14. Timezone inconsistency

`salons.timezone` is per-salon (line 55) but the daily summary cron is
hardcoded to 21:00 IST (line 221). Fine for an India-only v1 — but say so
explicitly, or it becomes a silent bug at the first client elsewhere.

### 15. WhatsApp opt-in is not captured

Utility templates still need a lawful opt-in basis for the number, and the
four-field walk-in form (line 199) captures none. Add one line of consent text
beside the phone field and store the timestamp.

---

## Smaller notes

- Additional test cases worth adding: all lanes inactive (empty `lanes` array);
  `durationMin: 0`; an `in_service` visit whose assigned lane is no longer in
  the lane list.
- The board should filter to today's visits, or yesterday's forgotten `waiting`
  rows accumulate indefinitely.
- The bearer check should use a timing-safe comparison, and all three hook
  routes need `export const dynamic = 'force-dynamic'` so they are not cached.
- Line 3's note about the placeholder name is easy to forget. Worth a grep gate
  before any client demo.
