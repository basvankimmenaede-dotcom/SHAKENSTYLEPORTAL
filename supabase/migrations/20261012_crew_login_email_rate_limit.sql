-- Apply in staging first. Server-only table for throttling crew login requests.
create table if not exists public.crew_login_requests (
 id uuid primary key default gen_random_uuid(),
 email text not null,
 requested_at timestamptz not null default now()
);
create index if not exists crew_login_requests_email_time on public.crew_login_requests(email,requested_at desc);
alter table public.crew_login_requests enable row level security;
-- No client policies. Only the service-role server can read/write.
