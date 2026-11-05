-- Contracturen voor de interne urenmonitor. Alleen server-side adminroutes mogen dit beheren.
create table if not exists public.staff_hour_contracts (
  rentman_crew_id bigint primary key check (rentman_crew_id > 0),
  weekly_hours numeric(5,2) not null check (weekly_hours > 0 and weekly_hours <= 80),
  tracking_start_week date not null check (extract(isodow from tracking_start_week) = 1),
  opening_balance_hours numeric(10,2) not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.staff_hour_contracts is
  'Weeknormen voor vaste medewerkers in de SHAKENSTYLE urenregistratie; via server-side admin API.';

alter table public.staff_hour_contracts enable row level security;

-- Geen rechtstreekse browser-/Data API-toegang tot vertrouwelijke personeelsinformatie.
revoke all on public.staff_hour_contracts from public, anon, authenticated;
grant select, insert, update, delete on public.staff_hour_contracts to service_role;
