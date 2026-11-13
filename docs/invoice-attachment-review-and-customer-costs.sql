
-- Applied through Supabase migration invoice_attachment_review_and_customer_costs.
-- Separate classification of PDF attachments from incoming invoice approval.
create table if not exists public.invoice_attachment_reviews (
 id uuid primary key default gen_random_uuid(),
 extraction_id uuid not null unique references public.invoice_pdf_extractions(id) on delete cascade,
 message_id uuid not null references public.invoice_inbox_messages(id) on delete cascade,
 attachment_index integer not null check (attachment_index between 0 and 9),
 classification text not null check (classification in ('receipt','evidence','ignored')),
 merchant text,document_date date,cost_amount numeric(12,2) check(cost_amount is null or cost_amount>=0),
 project_number text check(project_number is null or project_number ~ '^[0-9]{4,8}$'),
 linked_invoice_id uuid references public.crew_invoices(id) on delete set null,
 note text,billing_status text not null default 'pending'
  check(billing_status in ('pending','included','not_bill','already_processed')),
 billing_item_id uuid references public.billing_items(id) on delete restrict,
 sale_description text,sale_price numeric(12,2) check(sale_price is null or sale_price>=0),
 sale_vat_rate integer check(sale_vat_rate is null or sale_vat_rate in (0,9,21)),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(message_id,attachment_index),
 constraint receipt_review_classification_status_check check(classification='receipt' or billing_status='not_bill'),
 constraint receipt_review_included_complete_check check(billing_status<>'included' or
  (classification='receipt' and billing_item_id is not null and sale_price is not null
    and sale_vat_rate is not null and nullif(trim(sale_description),'') is not null)),
 constraint receipt_review_evidence_link_check check(classification<>'evidence' or linked_invoice_id is not null)
);
create index if not exists invoice_attachment_reviews_project_pending_idx on public.invoice_attachment_reviews(project_number,billing_status) where classification='receipt';
create index if not exists invoice_attachment_reviews_message_idx on public.invoice_attachment_reviews(message_id);
create index if not exists invoice_attachment_reviews_billing_item_idx on public.invoice_attachment_reviews(billing_item_id) where billing_status='included';
alter table public.invoice_attachment_reviews enable row level security;
revoke all on public.invoice_attachment_reviews from anon,authenticated,public;
grant select,insert,update,delete on public.invoice_attachment_reviews to service_role;
