-- Protege todos os dados financeiros e permite que apenas o primeiro usuário
-- autenticado se torne proprietário do aplicativo.
create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.app_owner enable row level security;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_owner
    where singleton = true
      and user_id = auth.uid()
  );
$$;

create or replace function public.claim_app_owner()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('controle-financeiro-app-owner'));

  insert into public.app_owner (singleton, user_id)
  values (true, v_user_id)
  on conflict (singleton) do nothing;

  return exists (
    select 1
    from public.app_owner
    where singleton = true
      and user_id = v_user_id
  );
end;
$$;

revoke all on table public.app_owner from anon, authenticated;
revoke all on function public.is_app_owner() from public, anon;
revoke all on function public.claim_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;
grant execute on function public.claim_app_owner() to authenticated;

alter table public.accounts enable row level security;
alter table public.cards enable row level security;
alter table public.categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.imports enable row level security;
alter table public.insights enable row level security;

create policy accounts_owner_only on public.accounts
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy cards_owner_only on public.cards
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy categories_owner_only on public.categories
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy category_rules_owner_only on public.category_rules
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy transactions_owner_only on public.transactions
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy imports_owner_only on public.imports
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());
create policy insights_owner_only on public.insights
  for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());

revoke all on table public.accounts, public.cards, public.categories, public.category_rules,
  public.transactions, public.imports, public.insights from anon;
grant select, insert, update, delete on table public.accounts, public.cards, public.categories,
  public.category_rules, public.transactions, public.imports, public.insights to authenticated;

revoke execute on function public.import_transactions(uuid, text, date, date, jsonb) from anon;
grant execute on function public.import_transactions(uuid, text, date, date, jsonb) to authenticated;
