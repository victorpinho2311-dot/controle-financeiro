-- Importa um lote OFX de forma atômica e registra seu histórico.
create or replace function public.import_transactions(
  p_account_id uuid,
  p_filename text,
  p_period_start date,
  p_period_end date,
  p_transactions jsonb
)
returns table (
  import_id uuid,
  rows_imported integer,
  rows_skipped integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows_imported integer;
  v_rows_skipped integer;
  v_import_id uuid;
begin
  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'p_transactions deve ser um array JSON.';
  end if;

  if jsonb_array_length(p_transactions) = 0 then
    raise exception 'A importação precisa ter ao menos um lançamento válido.';
  end if;

  with inserted as (
    insert into public.transactions (
      account_id,
      fitid,
      date,
      amount,
      description,
      memo,
      raw_type
    )
    select
      p_account_id,
      item.fitid,
      item.date,
      item.amount,
      item.description,
      item.memo,
      item.raw_type
    from jsonb_to_recordset(p_transactions) as item(
      fitid text,
      date date,
      amount numeric(14, 2),
      description text,
      memo text,
      raw_type text
    )
    on conflict (account_id, fitid) do nothing
    returning id
  )
  select count(*)::integer into v_rows_imported from inserted;

  v_rows_skipped := jsonb_array_length(p_transactions) - v_rows_imported;

  insert into public.imports (
    account_id,
    filename,
    period_start,
    period_end,
    rows_imported,
    rows_skipped
  )
  values (
    p_account_id,
    p_filename,
    p_period_start,
    p_period_end,
    v_rows_imported,
    v_rows_skipped
  )
  returning id into v_import_id;

  return query
  select v_import_id, v_rows_imported, v_rows_skipped;
end;
$$;
