-- Dados iniciais para o primeiro uso do Controle Financeiro.

insert into public.accounts (name, type, bank, currency)
select account.name, account.type, account.bank, account.currency
from (
  values
    ('Bradesco CC', 'checking', 'bradesco', 'BRL'),
    ('Bradesco Cartão', 'credit_card', 'bradesco', 'BRL')
) as account(name, type, bank, currency)
where not exists (
  select 1
  from public.accounts
  where accounts.name = account.name
    and accounts.type = account.type
    and accounts.bank = account.bank
);

insert into public.categories (name, kind, icon, color)
select category.name, category.kind, category.icon, category.color
from (
  values
    ('Alimentação', 'expense', 'utensils', '#EA580C'),
    ('Moradia', 'expense', 'house', '#7C3AED'),
    ('Transporte', 'expense', 'car', '#2563EB'),
    ('Saúde', 'expense', 'heart-pulse', '#DC2626'),
    ('Educação', 'expense', 'graduation-cap', '#0F766E'),
    ('Lazer', 'expense', 'party-popper', '#DB2777'),
    ('Assinaturas', 'expense', 'repeat-2', '#7C3AED'),
    ('Compras', 'expense', 'shopping-bag', '#D97706'),
    ('Serviços', 'expense', 'wrench', '#475569'),
    ('Taxas e tarifas', 'expense', 'receipt', '#64748B'),
    ('Outras despesas', 'expense', 'circle-ellipsis', '#64748B'),
    ('Salário', 'income', 'briefcase-business', '#16A34A'),
    ('Rendimentos', 'income', 'trending-up', '#16A34A'),
    ('Reembolsos', 'income', 'rotate-ccw', '#059669'),
    ('Outras receitas', 'income', 'circle-plus', '#16A34A'),
    ('Transferência entre contas', 'transfer', 'arrow-left-right', '#0F766E'),
    ('Pagamento de fatura', 'transfer', 'credit-card', '#0F766E')
) as category(name, kind, icon, color)
where not exists (
  select 1
  from public.categories
  where categories.name = category.name
    and categories.kind = category.kind
);
