-- Controle Financeiro — Fase 1
-- Modelo de dados da seção 4 da arquitetura.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('checking', 'credit_card', 'investment')),
  bank text not null,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories (id) on delete set null,
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  icon text not null,
  color text not null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  fitid text not null,
  date date not null,
  amount numeric(14, 2) not null,
  description text not null,
  memo text,
  raw_type text not null,
  category_id uuid references public.categories (id) on delete set null,
  subcategory text,
  notes text,
  created_at timestamptz not null default now(),
  constraint transactions_account_id_fitid_key unique (account_id, fitid)
);

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  is_regex boolean not null default false,
  category_id uuid not null references public.categories (id) on delete restrict,
  priority integer not null default 0
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete restrict,
  filename text not null,
  period_start date not null,
  period_end date not null,
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  created_at timestamptz not null default now(),
  constraint imports_valid_period check (period_end >= period_start)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  generated_at timestamptz not null default now(),
  model text not null,
  content_json jsonb not null
);

-- Índices para os filtros e agregações do dashboard, importações e cache de insights.
create index transactions_date_idx on public.transactions (date desc);
create index transactions_account_date_idx on public.transactions (account_id, date desc);
create index transactions_category_date_idx on public.transactions (category_id, date desc)
  where category_id is not null;
create index category_rules_priority_idx on public.category_rules (priority desc);
create index imports_account_created_at_idx on public.imports (account_id, created_at desc);
create index insights_period_generated_at_idx on public.insights (period, generated_at desc);
