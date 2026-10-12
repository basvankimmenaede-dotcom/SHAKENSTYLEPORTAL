-- Crew login address may differ from Rentman contact email.
-- Login address is authoritative for RLS and must be unique.
alter table public.crew_portal_members
 add column if not exists rentman_email text,
 add column if not exists login_email_override text,
 add column if not exists last_synced_at timestamptz;
update public.crew_portal_members set rentman_email=email where rentman_email is null;
create unique index if not exists crew_login_override_unique
 on public.crew_portal_members(lower(login_email_override))
 where login_email_override is not null;
-- Prevent two employees from sharing the same effective login email.
create or replace function public.crew_unique_login_email() returns trigger language plpgsql as $$
begin
 if exists (
  select 1 from public.crew_portal_members m
  where m.id <> new.id
  and lower(coalesce(nullif(m.login_email_override,''),m.email))
    = lower(coalesce(nullif(new.login_email_override,''),new.email))
 ) then raise exception 'Crew login email is already in use'; end if;
 return new;
end $$;
drop trigger if exists crew_unique_login_email_trigger on public.crew_portal_members;
create trigger crew_unique_login_email_trigger before insert or update of email,login_email_override
 on public.crew_portal_members for each row execute function public.crew_unique_login_email();
drop policy if exists "crew read own identity" on public.crew_portal_members;
create policy "crew read own identity" on public.crew_portal_members for select to authenticated
 using (active and lower(coalesce(nullif(login_email_override,''),email))=lower(auth.jwt()->>'email'));
drop policy if exists "crew read own assignments" on public.crew_portal_assignments;
create policy "crew read own assignments" on public.crew_portal_assignments for select to authenticated
 using (exists(select 1 from public.crew_portal_members m where m.id=crew_member_id and m.active
 and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')));
drop policy if exists "crew read own reports" on public.crew_shift_reports;
create policy "crew read own reports" on public.crew_shift_reports for select to authenticated
 using (exists(select 1 from public.crew_portal_members m where m.id=crew_member_id and m.active
 and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')));
drop policy if exists "crew submit own reports" on public.crew_shift_reports;
create policy "crew submit own reports" on public.crew_shift_reports for insert to authenticated
 with check (status='submitted' and exists(
 select 1 from public.crew_portal_assignments a join public.crew_portal_members m on m.id=a.crew_member_id
 where a.id=assignment_id and m.id=crew_member_id and m.active
 and lower(coalesce(nullif(m.login_email_override,''),m.email))=lower(auth.jwt()->>'email')
 and a.ends_at <= now() and a.starts_at >= now()-interval '7 days'
 ));
