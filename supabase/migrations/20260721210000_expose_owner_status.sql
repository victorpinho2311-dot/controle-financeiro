-- Expõe apenas se o proprietário já foi definido, sem revelar usuário ou e-mail.
create or replace function public.app_owner_exists()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.app_owner where singleton = true);
$$;

revoke all on function public.app_owner_exists() from public;
grant execute on function public.app_owner_exists() to anon, authenticated;
