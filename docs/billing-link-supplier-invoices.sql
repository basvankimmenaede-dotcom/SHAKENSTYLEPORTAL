-- Link a manually created outgoing billing work item to one incoming supplier invoice.
-- This is an explicit action, never created automatically from an incoming invoice.
-- Existing manual/Rentman billing rows remain unchanged.
begin;
alter table public.billing_items
  add column if not exists supplier_invoice_id uuid
  references public.crew_invoices(id) on delete restrict;
create unique index if not exists billing_items_supplier_invoice_unique
  on public.billing_items (supplier_invoice_id)
  where supplier_invoice_id is not null;
alter table public.billing_items
  add constraint billing_items_supplier_link_manual_only
  check (supplier_invoice_id is null or source_type='manual');
commit;
