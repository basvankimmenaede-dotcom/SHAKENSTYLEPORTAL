-- Inkomende crewfacturen: afgeschermde statuslaag.
create table if not exists public.crew_invoices (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references public.crew_portal_members(id) on delete restrict,
  invoice_number text not null,
  invoice_date date,
  total_amount numeric(12,2) check (total_amount is null or total_amount >= 0),
  status text not null default 'received'
    check (status in ('received','in_review','correction_sending','correction_needed','approved')),
  correction_reason text,
  correction_notified_at timestamptz,
  approved_first_by uuid references auth.users(id),
  approved_second_by uuid references auth.users(id),
  forwarded_at timestamptz,
  original_email_message_id text,
  document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crew_invoice_reason_check check (
    status not in ('correction_needed','correction_sending')
    or (correction_reason is not null and length(trim(correction_reason)) >= 8)
  ),
  constraint crew_invoice_approval_check check (
    status <> 'approved'
    or (approved_first_by is not null and approved_second_by is not null
        and approved_first_by <> approved_second_by and forwarded_at is not null)
  )
);
create index if not exists crew_invoices_member_created_idx
  on public.crew_invoices (crew_member_id, created_at desc);
alter table public.crew_invoices enable row level security;
drop policy if exists "crew read own invoices" on public.crew_invoices;
create policy "crew read own invoices"
  on public.crew_invoices for select to authenticated
  using (exists (
    select 1 from public.crew_portal_members m
    where m.id=crew_invoices.crew_member_id and m.active
      and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
  ));
revoke insert, update, delete on public.crew_invoices from anon, authenticated;
grant select on public.crew_invoices to authenticated;
-- Shift report submission matches the UI opening 2 hours before end.
drop policy if exists "crew submit own reports" on public.crew_shift_reports;
create policy "crew submit own reports"
  on public.crew_shift_reports for insert to authenticated
  with check (status = 'submitted' and exists (
    select 1 from public.crew_portal_assignments a
    join public.crew_portal_members m on m.id=a.crew_member_id
    where a.id=crew_shift_reports.assignment_id
      and m.id=crew_shift_reports.crew_member_id and m.active
      and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
      and a.ends_at <= now() + interval '2 hours'
      and a.starts_at >= now() - interval '120 days'
  ));
