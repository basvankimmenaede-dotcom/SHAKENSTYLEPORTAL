-- New rejected state for office decisions, no existing invoices modified.
begin;
alter table public.crew_invoices drop constraint if exists crew_invoices_status_check;
alter table public.crew_invoices
 add constraint crew_invoices_status_check check (
  status in ('received','in_review','correction_sending','correction_needed','approved','rejected')
 );
alter table public.crew_invoices drop constraint if exists crew_invoice_reason_check;
alter table public.crew_invoices
 add constraint crew_invoice_reason_check check (
  status not in ('correction_sending','correction_needed','rejected')
  or (correction_reason is not null and length(trim(correction_reason)) >= 8)
 );
commit;
