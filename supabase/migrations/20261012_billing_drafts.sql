-- Draft invoices remain independent of Rentman and Exact Online.
create table if not exists public.billing_drafts (
  billing_item_id uuid primary key references public.billing_items(id) on delete cascade,
  reference text,
  customer_name text,
  customer_email text,
  customer_address text,
  description text,
  currency text not null default 'EUR' check (currency = 'EUR'),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  notes text,
  exact_customer_id text,
  exact_invoice_id text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.billing_drafts enable row level security;
-- Only server-side service-role code accesses draft details, after module authorization.
