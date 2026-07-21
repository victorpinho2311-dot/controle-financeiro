-- Categorias adicionais e regras iniciais para descrições recorrentes do Bradesco.
insert into public.categories (name, kind, icon, color)
select category.name, category.kind, category.icon, category.color
from (
  values ('Pets', 'expense', 'paw-print', '#A16207')
) as category(name, kind, icon, color)
where not exists (
  select 1
  from public.categories
  where categories.name = category.name
    and categories.kind = category.kind
);

insert into public.category_rules (pattern, is_regex, category_id, priority)
select rule.pattern, rule.is_regex, category.id, rule.priority
from (
  values
    ('supermercado', false, 'Alimentação', 20),
    ('tauste', false, 'Alimentação', 20),
    ('padaria', false, 'Alimentação', 20),
    ('restaurante', false, 'Alimentação', 20),
    ('sushi', false, 'Alimentação', 20),
    ('ifd', false, 'Alimentação', 20),
    ('acaiteria', false, 'Alimentação', 20),
    ('havanna', false, 'Alimentação', 20),
    ('veloe', false, 'Transporte', 20),
    ('gascem', false, 'Transporte', 20),
    ('uber', false, 'Transporte', 20),
    ('99', false, 'Transporte', 20),
    ('posto', false, 'Transporte', 20),
    ('pet shop', false, 'Pets', 20),
    ('mercadolivre', false, 'Compras', 20),
    ('havan', false, 'Compras', 20),
    ('sympla', false, 'Lazer', 20),
    ('wpclube', false, 'Assinaturas', 20)
) as rule(pattern, is_regex, category_name, priority)
join public.categories as category
  on category.name = rule.category_name
  and category.kind = 'expense'
where not exists (
  select 1
  from public.category_rules as existing
  where existing.pattern = rule.pattern
    and existing.category_id = category.id
);

-- Persiste a categoria escolhida ou sugerida junto com cada transação importada.
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
      card_id,
      fitid,
      date,
      amount,
      description,
      memo,
      raw_type,
      category_id
    )
    select
      p_account_id,
      item.card_id,
      item.fitid,
      item.date,
      item.amount,
      item.description,
      item.memo,
      item.raw_type,
      item.category_id
    from jsonb_to_recordset(p_transactions) as item(
      card_id uuid,
      fitid text,
      date date,
      amount numeric(14, 2),
      description text,
      memo text,
      raw_type text,
      category_id uuid
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
