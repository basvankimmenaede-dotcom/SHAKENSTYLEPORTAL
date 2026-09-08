-- SHAKENSTYLE Portal v8.9.3
-- Klantnotities per Rentman equipment item.

begin;

create table if not exists public.equipment_customer_notes (
  equipment_id bigint primary key,
  brand_id bigint not null references public.brands(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists equipment_customer_notes_brand_id_idx
  on public.equipment_customer_notes (brand_id);

alter table public.equipment_customer_notes enable row level security;

-- Geen client-side policies nodig: lezen/schrijven loopt server-side via de portal.
-- De service-role client in de Next.js server kan RLS veilig omzeilen.

commit;
