-- Portal access is a SHAKENSTYLE decision, never derived from Rentman after this migration.
-- Existing users retain their pre-migration eligibility; Jurr (#369) is explicitly enabled.
alter table public.crew_portal_members add column if not exists portal_enabled boolean;
update public.crew_portal_members
set portal_enabled = active and not manual_disabled and not portal_deleted
where portal_enabled is null;
alter table public.crew_portal_members alter column portal_enabled set default false;
alter table public.crew_portal_members alter column portal_enabled set not null;
alter table public.crew_portal_members
 add column if not exists portal_access_updated_at timestamptz,
 add column if not exists portal_access_updated_by uuid references auth.users(id);
update public.crew_portal_members set portal_enabled=true,portal_access_updated_at=now()
where rentman_crew_id=369 and not portal_deleted and not manual_disabled and not portal_enabled;
comment on column public.crew_portal_members.portal_enabled is 'SHAKENSTYLE-managed crew portal access; Rentman active is only planning metadata.';

alter policy "crew read own identity" on public.crew_portal_members
 using (
  portal_enabled and not manual_disabled and not portal_deleted
  and lower(coalesce(nullif(login_email_override,''),email))=lower(auth.jwt()->>'email')
 );
alter policy "crew read own assignments" on public.crew_portal_assignments
 using (
  exists(select 1 from public.crew_portal_members m
   where m.id=crew_portal_assignments.crew_member_id
   and m.portal_enabled and not m.manual_disabled and not m.portal_deleted
   and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
  )
 );
alter policy "crew read own invoices" on public.crew_invoices
 using (
  exists(select 1 from public.crew_portal_members m
   where m.id=crew_invoices.crew_member_id
   and m.portal_enabled and not m.manual_disabled and not m.portal_deleted
   and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
  )
 );
alter policy "crew read own reports" on public.crew_shift_reports
 using (
  exists(select 1 from public.crew_portal_members m
   where m.id=crew_shift_reports.crew_member_id
   and m.portal_enabled and not m.manual_disabled and not m.portal_deleted
   and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
  )
 );
alter policy "crew submit own reports" on public.crew_shift_reports
 with check (
  status='submitted'
  and exists(select 1 from public.crew_portal_assignments a
   join public.crew_portal_members m on m.id=a.crew_member_id
   where a.id=crew_shift_reports.assignment_id
   and m.id=crew_shift_reports.crew_member_id
   and m.portal_enabled and not m.manual_disabled and not m.portal_deleted
   and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
   and a.ends_at <= now()+interval '2 hours'
   and a.starts_at >= now()-interval '120 days'
  )
 );
