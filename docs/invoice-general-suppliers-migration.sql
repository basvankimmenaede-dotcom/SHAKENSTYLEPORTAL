-- General incoming purchase invoices share the existing approval, PDF and inbox pipeline.
-- Existing crew invoices remain untouched; project numbers are optional for suppliers.
begin;
create table if not exists public.invoice_suppliers (
 id uuid primary key default gen_random_uuid(),
 company_name text not null check (char_length(trim(company_name)) between 2 and 160),
 contact_email text check (contact_email is null or char_length(contact_email)<=254),
 vat_number text check (vat_number is null or char_length(vat_number)<=40),
 kvk_number text check (kvk_number is null or char_length(kvk_number)<=40),
 default_cost_category text not null default 'overig'
  check(default_cost_category in ('algemeen','werkplaats','magazijn','voorraad','transport','marketing','abonnementen','projectkosten','overig')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists invoice_suppliers_normalized_name_unique
 on public.invoice_suppliers (lower(btrim(company_name)));
alter table public.invoice_suppliers enable row level security;
revoke all on public.invoice_suppliers from anon,authenticated;
-- The office routes use the authenticated user's billing/manage role before
-- reading/writing via the server-side service role; suppliers are never exposed to crew.

alter table public.crew_invoices alter column crew_member_id drop not null;
alter table public.crew_invoices add column if not exists supplier_id uuid
 references public.invoice_suppliers(id) on delete restrict;
alter table public.crew_invoices add column if not exists cost_category text;
alter table public.crew_invoices add constraint crew_invoice_exactly_one_party
 check ((crew_member_id is not null) <> (supplier_id is not null));
alter table public.crew_invoices add constraint crew_invoice_supplier_cost_category
 check (
  supplier_id is null or cost_category in
  ('algemeen','werkplaats','magazijn','voorraad','transport','marketing','abonnementen','projectkosten','overig')
 );
create index if not exists crew_invoices_supplier_id_idx
 on public.crew_invoices (supplier_id,created_at desc) where supplier_id is not null;
-- Prevent double payment even if concurrent users click Link at the same time.
create unique index if not exists crew_invoices_unique_crew_number
 on public.crew_invoices (crew_member_id,lower(btrim(invoice_number))) where crew_member_id is not null;
create unique index if not exists crew_invoices_unique_supplier_number
 on public.crew_invoices (supplier_id,lower(btrim(invoice_number))) where supplier_id is not null;
-- Rejection and correction records already exist; keep their actions auditable.
alter table public.invoice_approval_audit drop constraint if exists invoice_approval_audit_action_check;
alter table public.invoice_approval_audit add constraint invoice_approval_audit_action_check
 check(action in ('first_approved','second_approved','forwarded','forward_needs_review','project_review_updated','rejected','correction_requested'));
commit;
