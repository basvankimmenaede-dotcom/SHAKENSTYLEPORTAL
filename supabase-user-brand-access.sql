-- SHAKENSTYLE Portal - rechten per gebruiker
-- 1) maakt user_brand_access aan
-- 2) migreert bestaande distributeur-merkrechten naar alle bestaande customer users
-- 3) klanten mogen alleen hun eigen rechten uitlezen

begin;

create table if not exists public.user_brand_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id bigint not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);

create index if not exists user_brand_access_brand_id_idx
  on public.user_brand_access (brand_id);

alter table public.user_brand_access enable row level security;

-- Herhaalbaar uitvoeren zonder dubbele policies.
drop policy if exists "Users can read own brand access" on public.user_brand_access;
create policy "Users can read own brand access"
  on public.user_brand_access
  for select
  to authenticated
  using (user_id = auth.uid());

-- Eenmalige migratie: huidige distributeurtoegang kopieren naar individuele users.
-- distributor_brands blijft bestaan als historie, maar wordt door de portal niet meer gebruikt voor autorisatie.
insert into public.user_brand_access (user_id, brand_id)
select p.id, db.brand_id
from public.profiles p
join public.distributor_brands db
  on db.distributor_id = p.distributor_id
where p.role = 'customer'
  and p.distributor_id is not null
on conflict (user_id, brand_id) do nothing;

commit;
