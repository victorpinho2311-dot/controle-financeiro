-- Corrige os dois lançamentos de julho que vieram indevidamente no OFX de junho
-- do Bradesco. O arquivo declara encerramento em 30/06/2026, portanto esses
-- FITIDs deverão entrar apenas ao importar o extrato de julho.
delete from public.transactions as t
where t.date in (date '2026-07-20', date '2026-07-21')
  and t.description in (
    'Pagto Eletron Cobranca Bradesco Seg-resid/outros',
    'Pix qr Code Dinamico Des: Receita Federal 21/07'
  )
  and exists (
    select 1
    from public.imports as i
    where i.account_id = t.account_id
      and i.filename = 'Bradesco_21072026_174502.ofx'
      and i.period_start = date '2026-06-01'
      and i.period_end = date '2026-06-30'
  );

-- Pagamento da fatura apenas move o dinheiro entre a conta corrente e o cartão;
-- quando as faturas também são importadas, ele não pode contar como gasto duas vezes.
insert into public.category_rules (pattern, is_regex, category_id, priority)
select 'gasto c credito', false, category.id, 90
from public.categories as category
where category.name = 'Pagamento de fatura'
  and category.kind = 'transfer'
  and not exists (
    select 1
    from public.category_rules as rule
    where rule.pattern = 'gasto c credito'
      and rule.category_id = category.id
  );

update public.transactions as t
set category_id = category.id
from public.categories as category
where t.category_id is null
  and category.name = 'Pagamento de fatura'
  and category.kind = 'transfer'
  and t.description ilike '%gasto c credito%';
