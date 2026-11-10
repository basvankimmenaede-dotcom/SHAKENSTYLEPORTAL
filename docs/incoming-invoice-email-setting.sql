-- Bewaar het factuuradres bij de bestaande planninginstellingen.
-- Let op: dit configureert geen mailbox of automatische e-mailontvangst.
alter table public.planning_settings
  add column if not exists incoming_invoice_email text not null default '';
update public.planning_settings
  set incoming_invoice_email = 'facturen@shakenstyle.com'
  where id = 1 and incoming_invoice_email = '';
