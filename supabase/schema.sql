-- =====================================================================
-- Girvi Gold & Silver Pawn Manager — Supabase schema
-- ---------------------------------------------------------------------
-- This is the exact schema running on the live project
-- (Girvi-Mumbai, ref lxohavutliiuexqbtwvg, region ap-south-1).
--
-- It was applied as four migrations:
--   girvi_core_tables · girvi_rls_policies · girvi_rpcs_and_triggers
--   girvi_storage_bucket · girvi_harden_helper_functions
--
-- Re-running this file is safe (everything is create-if-not-exists or
-- create-or-replace), so you can use it to stand up a second project.
--
-- Security model
--   * Every business row carries a store_id.
--   * A user sees a row only if they are an ACTIVE member of that store.
--   * Membership is checked through SECURITY DEFINER helpers that live in a
--     `private` schema, so the policies never recurse on store_members and the
--     helpers are not exposed as REST endpoints.
--   * Verified live: a signed-in outsider holding a store's exact UUID cannot
--     read, insert or update any of its rows.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. STORES  (one row per jewellery shop)
-- =====================================================================
create table if not exists public.stores (
  id                          uuid primary key default gen_random_uuid(),
  store_code                  text not null unique,
  shop_name                   text not null,
  tagline                     text default '',
  proprietor_name             text default '',
  phone                       text default '',
  alternate_phone             text default '',
  email                       text default '',
  address                     text default '',
  city                        text default '',
  state                       text default '',
  pincode                     text default '',
  gst_number                  text default '',
  license_number              text default '',
  currency_symbol             text not null default '₹',

  -- lending defaults
  default_monthly_rate        numeric(6,3) not null default 2.0,
  default_grace_period_days   int not null default 7,
  default_interest_type       text not null default 'DAILY_PRO_RATA',

  -- automatic simple -> compound conversion policy (shop-wide default)
  auto_compound_enabled       boolean not null default true,
  auto_compound_after_months  int not null default 24,
  auto_compound_frequency     text not null default 'ANNUAL',

  -- numbering
  loan_prefix                 text not null default 'G-',
  receipt_prefix              text not null default 'REC-',
  customer_prefix             text not null default 'CUST-',

  terms_and_conditions        text default '',
  accent_color                text not null default 'gold',
  auto_lock_minutes           int not null default 5,

  created_by                  uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint stores_interest_type_chk check (
    default_interest_type in ('DAILY_PRO_RATA','MONTHLY_SIMPLE','MONTHLY_COMPOUND','QUARTERLY_COMPOUND','ANNUAL_COMPOUND')
  ),
  constraint stores_auto_freq_chk check (
    auto_compound_frequency in ('MONTHLY','QUARTERLY','ANNUAL')
  )
);

-- =====================================================================
-- 2. STORE MEMBERS  (who may open which shop)
-- =====================================================================
create table if not exists public.store_members (
  store_id    uuid not null references public.stores(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text default '',
  email       text default '',
  role        text not null default 'STAFF',
  status      text not null default 'ACTIVE',
  created_at  timestamptz not null default now(),
  primary key (store_id, user_id),
  constraint store_members_role_chk check (role in ('OWNER','MANAGER','STAFF')),
  constraint store_members_status_chk check (status in ('ACTIVE','SUSPENDED'))
);

create index if not exists store_members_user_idx on public.store_members(user_id);

-- =====================================================================
-- 3. CUSTOMERS
-- =====================================================================
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  customer_code       text not null,
  full_name           text not null,
  relative_name       text default '',
  relation_type       text default 'S/O',
  phone               text default '',
  alternate_phone     text default '',
  address             text default '',
  city                text default '',
  pincode             text default '',
  id_proof_type       text default 'Aadhar Card',
  id_proof_number     text default '',
  photo_url           text,
  id_proof_photo_url  text,
  notes               text default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, customer_code)
);

create index if not exists customers_store_idx on public.customers(store_id);
create index if not exists customers_name_idx  on public.customers(store_id, full_name);

-- =====================================================================
-- 4. LOANS
-- =====================================================================
create table if not exists public.loans (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores(id) on delete cascade,
  customer_id              uuid not null references public.customers(id) on delete restrict,
  loan_no                  text not null,
  loan_date                date not null,
  due_date                 date,

  principal_amount         numeric(14,2) not null default 0,   -- original disbursal only
  monthly_interest_rate    numeric(6,3) not null default 2.0,
  interest_type            text not null default 'DAILY_PRO_RATA',

  -- per-loan override of the shop-wide auto simple->compound conversion.
  -- null = follow the store setting | true = always | false = never
  auto_compound_override   boolean,

  grace_period_days        int not null default 0,
  vault_pouch_no           text default '',
  status                   text not null default 'ACTIVE',
  notes                    text default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  closed_at                timestamptz,

  unique (store_id, loan_no),
  constraint loans_interest_type_chk check (
    interest_type in ('DAILY_PRO_RATA','MONTHLY_SIMPLE','MONTHLY_COMPOUND','QUARTERLY_COMPOUND','ANNUAL_COMPOUND')
  ),
  constraint loans_status_chk check (
    status in ('ACTIVE','CLOSED','OVERDUE','AUCTIONED','NOTICE_SENT')
  ),
  constraint loans_principal_chk check (principal_amount >= 0),
  constraint loans_rate_chk check (monthly_interest_rate >= 0 and monthly_interest_rate <= 50)
);

create index if not exists loans_store_idx    on public.loans(store_id);
create index if not exists loans_customer_idx on public.loans(customer_id);
create index if not exists loans_status_idx   on public.loans(store_id, status);

-- =====================================================================
-- 5. LOAN ITEMS  (pledged ornaments)
-- =====================================================================
create table if not exists public.loan_items (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores(id) on delete cascade,
  loan_id                  uuid not null references public.loans(id) on delete cascade,
  item_name                text not null,
  metal_type               text not null default 'GOLD',
  purity                   text default '',
  quantity                 int not null default 1,
  gross_weight             numeric(10,3) not null default 0,
  net_weight               numeric(10,3) not null default 0,
  valuation_rate_per_gram  numeric(12,2) not null default 0,
  estimated_value          numeric(14,2) not null default 0,
  photos                   text[] not null default '{}',
  item_locker_location     text default '',
  item_description         text default '',
  -- set when the item arrives with a later top-up rather than the original loan
  added_with_topup_id      uuid,
  created_at               timestamptz not null default now()
);

create index if not exists loan_items_loan_idx on public.loan_items(loan_id);

-- =====================================================================
-- 6. LOAN TOP-UPS  ("customer borrowed more money on the same loan")
-- =====================================================================
create table if not exists public.loan_topups (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  loan_id          uuid not null references public.loans(id) on delete cascade,
  voucher_no       text not null,
  topup_date       date not null,
  amount           numeric(14,2) not null check (amount > 0),
  payment_mode     text not null default 'CASH',
  -- optional: re-price the loan from this date onwards
  new_monthly_rate numeric(6,3),
  notes            text default '',
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint loan_topups_mode_chk check (payment_mode in ('CASH','UPI','BANK_TRANSFER','CHEQUE'))
);

create index if not exists loan_topups_loan_idx on public.loan_topups(loan_id);

-- =====================================================================
-- 7. PAYMENTS
-- =====================================================================
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  loan_id             uuid not null references public.loans(id) on delete cascade,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  receipt_no          text not null,
  payment_date        date not null,
  total_amount        numeric(14,2) not null default 0,
  interest_paid       numeric(14,2) not null default 0,
  principal_paid      numeric(14,2) not null default 0,
  discount_waived     numeric(14,2) not null default 0,
  previous_principal  numeric(14,2) not null default 0,
  remaining_principal numeric(14,2) not null default 0,
  payment_type        text not null default 'INTEREST_ONLY',
  payment_mode        text not null default 'CASH',
  notes               text default '',
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (store_id, receipt_no),
  constraint payments_type_chk check (
    payment_type in ('INTEREST_ONLY','PRINCIPAL_ONLY','COMBINED','FULL_SETTLEMENT','WAIVER_DISCOUNT')
  ),
  constraint payments_mode_chk check (
    payment_mode in ('CASH','UPI','BANK_TRANSFER','CHEQUE')
  ),
  constraint payments_amounts_chk check (
    interest_paid >= 0 and principal_paid >= 0 and discount_waived >= 0
  )
);

create index if not exists payments_loan_idx  on public.payments(loan_id);
create index if not exists payments_store_idx on public.payments(store_id, payment_date desc);

-- Covering indexes for the remaining foreign keys. Without these, deleting a
-- store or customer forces a sequential scan of every child table.
create index if not exists loan_items_store_idx    on public.loan_items(store_id);
create index if not exists loan_topups_store_idx   on public.loan_topups(store_id);
create index if not exists loan_topups_creator_idx on public.loan_topups(created_by);
create index if not exists payments_customer_idx   on public.payments(customer_id);
create index if not exists payments_creator_idx    on public.payments(created_by);
create index if not exists stores_creator_idx      on public.stores(created_by);

-- =====================================================================
-- 8. PRIVATE HELPERS
--    These back the RLS policies. They live outside `public` so PostgREST
--    never exposes them as /rest/v1/rpc endpoints.
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id and m.user_id = auth.uid() and m.status = 'ACTIVE'
  );
$$;

create or replace function private.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id and m.user_id = auth.uid()
      and m.status = 'ACTIVE' and m.role in ('OWNER','MANAGER')
  );
$$;

-- No 0/O/1/I: those get misread when the code is written on paper.
create or replace function private.generate_store_code()
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.stores s where s.store_code = candidate);
  end loop;
  return candidate;
end $$;

revoke all on function private.is_store_member(uuid) from public, anon;
revoke all on function private.is_store_owner(uuid) from public, anon;
revoke all on function private.generate_store_code() from public, anon;
grant execute on function private.is_store_member(uuid) to authenticated;
grant execute on function private.is_store_owner(uuid) to authenticated;

-- =====================================================================
-- 9. ROW LEVEL SECURITY
-- =====================================================================
alter table public.stores        enable row level security;
alter table public.store_members enable row level security;
alter table public.customers     enable row level security;
alter table public.loans         enable row level security;
alter table public.loan_items    enable row level security;
alter table public.loan_topups   enable row level security;
alter table public.payments      enable row level security;

drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated using (private.is_store_member(id));

drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores
  for update to authenticated
  using (private.is_store_owner(id)) with check (private.is_store_owner(id));
-- inserts happen only through the create_store() RPC

-- `auth.uid()` is wrapped in a scalar sub-select so Postgres evaluates it once
-- per query instead of once per row scanned.
drop policy if exists store_members_select on public.store_members;
create policy store_members_select on public.store_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_store_member(store_id));

drop policy if exists store_members_update on public.store_members;
create policy store_members_update on public.store_members
  for update to authenticated
  using (private.is_store_owner(store_id)) with check (private.is_store_owner(store_id));

drop policy if exists store_members_delete on public.store_members;
create policy store_members_delete on public.store_members
  for delete to authenticated
  using (private.is_store_owner(store_id) and user_id <> (select auth.uid()));

-- members read/write, only OWNER/MANAGER may delete
do $$
declare t text;
begin
  foreach t in array array['customers','loans','loan_items','loan_topups','payments'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (private.is_store_member(store_id))', t, t);

    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (private.is_store_member(store_id))', t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id))', t, t);

    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (private.is_store_owner(store_id))', t, t);
  end loop;
end $$;

-- =====================================================================
-- 10. PUBLIC RPCs — the app's only non-table API surface
-- =====================================================================

-- Creates a shop and makes the caller its OWNER.
create or replace function public.create_store(
  p_shop_name       text,
  p_proprietor_name text default '',
  p_phone           text default '',
  p_city            text default ''
)
returns public.stores language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_store   public.stores;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if coalesce(trim(p_shop_name), '') = '' then
    raise exception 'Shop name is required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.stores (store_code, shop_name, proprietor_name, phone, city, email, created_by)
  values (private.generate_store_code(), trim(p_shop_name), coalesce(p_proprietor_name, ''),
          coalesce(p_phone, ''), coalesce(p_city, ''), coalesce(v_email, ''), v_user_id)
  returning * into v_store;

  insert into public.store_members (store_id, user_id, full_name, email, role, status)
  values (v_store.id, v_user_id, coalesce(p_proprietor_name, ''), coalesce(v_email, ''), 'OWNER', 'ACTIVE');

  return v_store;
end $$;

-- Joins an existing shop using its 6-character code.
create or replace function public.join_store(
  p_store_code text,
  p_full_name  text default ''
)
returns public.stores language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_store   public.stores;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_store from public.stores
  where store_code = upper(trim(p_store_code));

  if v_store.id is null then
    raise exception 'No shop found for code %', upper(trim(p_store_code))
      using errcode = 'P0002';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  insert into public.store_members (store_id, user_id, full_name, email, role, status)
  values (v_store.id, v_user_id, coalesce(p_full_name, ''), coalesce(v_email, ''), 'STAFF', 'ACTIVE')
  on conflict (store_id, user_id) do update
    set status = 'ACTIVE',
        full_name = coalesce(nullif(excluded.full_name, ''), public.store_members.full_name);

  return v_store;
end $$;

-- Sequential document numbers, minted server-side so two phones in the same
-- shop can never produce the same loan/receipt/voucher number.
create or replace function public.next_document_no(p_store_id uuid, p_kind text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_year   text := to_char(now(), 'YYYY');
  v_count  bigint;
begin
  if not private.is_store_member(p_store_id) then
    raise exception 'Not a member of this store' using errcode = '42501';
  end if;

  select case p_kind
           when 'LOAN'    then loan_prefix
           when 'RECEIPT' then receipt_prefix
           when 'TOPUP'   then 'TOP-'
           else 'DOC-'
         end
    into v_prefix
  from public.stores where id = p_store_id;

  if p_kind = 'LOAN' then
    select count(*) into v_count from public.loans
     where store_id = p_store_id and extract(year from created_at) = extract(year from now());
  elsif p_kind = 'RECEIPT' then
    select count(*) into v_count from public.payments
     where store_id = p_store_id and extract(year from created_at) = extract(year from now());
  else
    select count(*) into v_count from public.loan_topups
     where store_id = p_store_id and extract(year from created_at) = extract(year from now());
  end if;

  return v_prefix || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
end $$;

revoke all on function public.create_store(text, text, text, text) from public, anon;
revoke all on function public.join_store(text, text) from public, anon;
revoke all on function public.next_document_no(uuid, text) from public, anon;
grant execute on function public.create_store(text, text, text, text) to authenticated;
grant execute on function public.join_store(text, text) to authenticated;
grant execute on function public.next_document_no(uuid, text) to authenticated;

-- =====================================================================
-- 11. updated_at triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists stores_touch    on public.stores;
drop trigger if exists customers_touch on public.customers;
drop trigger if exists loans_touch     on public.loans;

create trigger stores_touch    before update on public.stores    for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger loans_touch     before update on public.loans     for each row execute function public.touch_updated_at();

-- =====================================================================
-- 12. STORAGE — ornament & KYC photos
--     Path layout: girvi-photos/<store_id>/<items|kyc>/<file>.jpg
--     so the policy can compare the first segment against membership.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('girvi-photos', 'girvi-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists girvi_photos_read   on storage.objects;
drop policy if exists girvi_photos_write  on storage.objects;
drop policy if exists girvi_photos_update on storage.objects;
drop policy if exists girvi_photos_delete on storage.objects;

create policy girvi_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'girvi-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_store_member(((storage.foldername(name))[1])::uuid)
  );

create policy girvi_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'girvi-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_store_member(((storage.foldername(name))[1])::uuid)
  );

create policy girvi_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'girvi-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_store_member(((storage.foldername(name))[1])::uuid)
  );

create policy girvi_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'girvi-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_store_member(((storage.foldername(name))[1])::uuid)
  );
