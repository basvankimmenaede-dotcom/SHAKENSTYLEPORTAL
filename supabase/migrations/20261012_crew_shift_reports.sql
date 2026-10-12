-- Phase 2: private crew portal. Apply only after review in a staging database.
create table if not exists public.crew_portal_members (
 id uuid primary key default gen_random_uuid(),
 rentman_crew_id bigint not null unique,
 full_name text not null,
 email text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists crew_portal_members_email_unique on public.crew_portal_members (lower(email));
create table if not exists public.crew_portal_assignments (
 id uuid primary key default gen_random_uuid(),
 rentman_projectcrew_id bigint not null unique,
 crew_member_id uuid not null references public.crew_portal_members(id),
 rentman_project_id bigint not null,
 project_name text not null,
 project_location text,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists crew_portal_assignments_member_time on public.crew_portal_assignments(crew_member_id,starts_at);
create table if not exists public.crew_shift_reports (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null unique references public.crew_portal_assignments(id),
 crew_member_id uuid not null references public.crew_portal_members(id),
 work_started_at timestamptz not null,
 work_ended_at timestamptz not null,
 break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
 travel_minutes integer not null default 0 check (travel_minutes >= 0 and travel_minutes <= 1440),
 expenses_amount numeric(10,2) not null default 0 check (expenses_amount >= 0),
 expenses_description text,
 breakage_over_ten boolean not null default false,
 missing_materials boolean not null default false,
 missing_materials_description text,
 notes text,
 status text not null default 'submitted' check(status in ('submitted','approved','rejected')),
 submitted_at timestamptz not null default now(),
 constraint valid_work_times check(work_ended_at > work_started_at and work_ended_at <= work_started_at + interval '24 hours'),
 constraint missing_description_required check(not missing_materials or length(trim(coalesce(missing_materials_description,''))) > 0),
 constraint expense_description_required check(expenses_amount = 0 or length(trim(coalesce(expenses_description,''))) > 0)
);
alter table public.crew_portal_members enable row level security;
alter table public.crew_portal_assignments enable row level security;
alter table public.crew_shift_reports enable row level security;
-- Employee identity is proven by Supabase Auth email verification. No public anonymous reads.
create policy "crew read own identity" on public.crew_portal_members for select to authenticated
 using (active and lower(email) = lower(auth.jwt()->>'email'));
create policy "crew read own assignments" on public.crew_portal_assignments for select to authenticated
 using (exists(select 1 from public.crew_portal_members m where m.id=crew_member_id and m.active and lower(m.email)=lower(auth.jwt()->>'email')));
create policy "crew read own reports" on public.crew_shift_reports for select to authenticated
 using (exists(select 1 from public.crew_portal_members m where m.id=crew_member_id and m.active and lower(m.email)=lower(auth.jwt()->>'email')));
create policy "crew submit own reports" on public.crew_shift_reports for insert to authenticated
 with check (
 status='submitted'
 and exists(select 1 from public.crew_portal_assignments a join public.crew_portal_members m on m.id=a.crew_member_id
 where a.id=assignment_id and m.id=crew_member_id and m.active and lower(m.email)=lower(auth.jwt()->>'email')
 and a.ends_at <= now() and a.starts_at >= now() - interval '7 days' and a.starts_at <= now() + interval '7 days')
 );
-- Office management and sync writes must use separately authorized server-side operations.
