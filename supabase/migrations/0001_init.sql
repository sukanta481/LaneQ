-- LaneQ initial schema.
--
-- Tenancy: one deployment, many salons. Every domain table carries salon_id and
-- is closed by RLS to the caller's own salon. The public tracking page and the
-- n8n hook routes use the service role, which bypasses RLS entirely.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists salons (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  timezone        text not null default 'Asia/Kolkata',
  terminology     jsonb not null default '{
    "lane_singular": "Lane",
    "lane_plural": "Lanes",
    "operator_singular": "Operator",
    "service_singular": "Service",
    "customer_singular": "Customer"
  }'::jsonb,
  branding        jsonb not null default '{}'::jsonb,
  n8n_webhook_url text,
  created_at      timestamptz not null default now()
);

create table if not exists staff_users (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references salons (id) on delete cascade,
  auth_user_id uuid not null unique,
  name         text not null,
  role         text not null check (role in ('owner', 'reception'))
);

create table if not exists lanes (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references salons (id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  sort_order int not null default 0
);

create table if not exists services (
  id                   uuid primary key default gen_random_uuid(),
  salon_id             uuid not null references salons (id) on delete cascade,
  name                 text not null,
  default_duration_min int not null check (default_duration_min > 0),
  is_active            boolean not null default true
);

create table if not exists visits (
  id                   uuid primary key default gen_random_uuid(),
  salon_id             uuid not null references salons (id) on delete cascade,
  tracking_token       uuid not null unique default gen_random_uuid(),

  -- Display-only, restarts per salon per day. service_date is the salon-local
  -- day, resolved at insert time; it is NOT in the original spec but per-day
  -- numbering and "today" filtering are both wrong without it, because
  -- date(created_at) on a timestamptz resolves in the server's timezone.
  service_date         date not null,
  token_number         int  not null,

  customer_name        text not null,
  phone                text,
  service_id           uuid references services (id) on delete restrict,
  duration_min         int  not null check (duration_min >= 0),

  requested_lane_id    uuid references lanes (id) on delete set null,
  assigned_lane_id     uuid references lanes (id) on delete set null,

  status               text not null default 'waiting'
                       check (status in ('waiting', 'in_service', 'done', 'walked_out', 'no_show')),

  created_at           timestamptz not null default now(),
  started_at           timestamptz,
  ended_at             timestamptz,
  notified_created_at  timestamptz,
  notified_almost_at   timestamptz,

  constraint visits_token_unique_per_day unique (salon_id, service_date, token_number)
);

create index if not exists visits_salon_status_created_idx on visits (salon_id, status, created_at);
create index if not exists visits_tracking_token_idx       on visits (tracking_token);
create index if not exists visits_salon_service_date_idx   on visits (salon_id, service_date);
create index if not exists lanes_salon_idx                 on lanes (salon_id, sort_order);
create index if not exists services_salon_idx              on services (salon_id);
create index if not exists staff_users_auth_idx            on staff_users (auth_user_id);

-- --------------------------------------------------- per-day token numbers
--
-- Two receptionists adding walk-ins in the same second must not receive the
-- same number, so the counter is allocated in the database rather than by
-- reading max(token_number) + 1 from the app.

create table if not exists visit_counters (
  salon_id     uuid not null references salons (id) on delete cascade,
  service_date date not null,
  last_number  int  not null default 0,
  primary key (salon_id, service_date)
);

-- SECURITY DEFINER so the counter can be written while visit_counters itself
-- stays closed to every client. Without this the trigger would run as the
-- signed-in user and RLS would block the very insert it exists to serve.
create or replace function assign_visit_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz   text;
  v_date date;
  v_next int;
begin
  select timezone into v_tz from salons where id = new.salon_id;
  v_date := (new.created_at at time zone coalesce(v_tz, 'UTC'))::date;

  insert into visit_counters (salon_id, service_date, last_number)
  values (new.salon_id, v_date, 1)
  on conflict (salon_id, service_date)
  do update set last_number = visit_counters.last_number + 1
  returning last_number into v_next;

  new.service_date := v_date;
  new.token_number := v_next;
  return new;
end;
$$;

drop trigger if exists visits_assign_token on visits;
create trigger visits_assign_token
  before insert on visits
  for each row execute function assign_visit_token();

-- ------------------------------------------------------------------- RLS
--
-- The salon lookup is SECURITY DEFINER on purpose. A policy that inlines
-- "select salon_id from staff_users where auth_user_id = auth.uid()" recurses
-- as soon as staff_users has a policy of its own; a definer function reads the
-- table with RLS bypassed and breaks the cycle.

create or replace function current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from staff_users where auth_user_id = auth.uid() limit 1;
$$;

-- No policies: nothing reaches this table except the definer trigger above.
alter table visit_counters enable row level security;

alter table salons      enable row level security;
alter table staff_users enable row level security;
alter table lanes       enable row level security;
alter table services    enable row level security;
alter table visits      enable row level security;

drop policy if exists salons_own on salons;
create policy salons_own on salons
  for select using (id = current_salon_id());

drop policy if exists staff_users_own on staff_users;
create policy staff_users_own on staff_users
  for select using (salon_id = current_salon_id());

drop policy if exists lanes_own on lanes;
create policy lanes_own on lanes
  for all using (salon_id = current_salon_id())
  with check (salon_id = current_salon_id());

drop policy if exists services_own on services;
create policy services_own on services
  for all using (salon_id = current_salon_id())
  with check (salon_id = current_salon_id());

drop policy if exists visits_own on visits;
create policy visits_own on visits
  for all using (salon_id = current_salon_id())
  with check (salon_id = current_salon_id());

-- -------------------------------------------------------------- realtime
--
-- /board subscribes to visits. Without the table being in this publication the
-- subscription connects and simply never fires, which reads as a client bug.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visits'
  ) then
    alter publication supabase_realtime add table visits;
  end if;
end
$$;
