-- O saldo de fechamento do OFX é a referência bancária real. O fluxo mensal de
-- lançamentos não representa, por si só, o saldo disponível da conta.
alter table public.imports
  add column if not exists closing_balance numeric(14, 2),
  add column if not exists balance_date date;

-- Preenche os extratos Bradesco já importados neste projeto.
update public.imports
set closing_balance = source.closing_balance,
    balance_date = source.balance_date
from (
  values
    ('Bradesco_21072026_174326.ofx', 20545.70::numeric, date '2026-01-30'),
    ('Bradesco_21072026_174350.ofx', 1.00::numeric, date '2026-02-27'),
    ('Bradesco_21072026_174416.ofx', 1.00::numeric, date '2026-03-30'),
    ('Bradesco_21072026_174430.ofx', 1.00::numeric, date '2026-04-30'),
    ('Bradesco_21072026_174446.ofx', 1.00::numeric, date '2026-05-29'),
    ('Bradesco_21072026_174502.ofx', 1.00::numeric, date '2026-06-29')
) as source(filename, closing_balance, balance_date)
where public.imports.filename = source.filename;
