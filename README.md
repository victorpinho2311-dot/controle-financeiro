# Controle Financeiro

PWA pessoal para importar extratos OFX da conta corrente e faturas CSV do cartão Bradesco, categorizar transações e visualizar a vida financeira.

## Formatos aceitos

- Conta corrente: OFX (Money 2000 em diante), com movimentações e PIX.
- Cartão de crédito: CSV da fatura, com separação entre titular e adicionais, compras, estornos e parcelas.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e preencha a URL e a chave publicável do projeto Supabase.
2. Instale as dependências com `npm install`.
3. Inicie o ambiente local com `npm run dev`.

## Primeiro acesso

1. Abra o aplicativo e escolha **Criar primeiro acesso**.
2. Confirme o e-mail, caso o Supabase solicite, e entre com a senha escolhida.
3. O primeiro usuário autenticado se torna o proprietário único; todos os demais acessos ficam bloqueados pelas políticas do banco.

## Estrutura

- `src/lib`: integrações e regras reutilizáveis.
- `src/features`: fluxos de importação, dashboard, transações e insights.
- `src/components`: componentes compartilhados.
- `supabase/migrations`: schema versionado do banco.
- `supabase/functions`: Edge Functions de IA.

As instruções de aplicação e verificação das migrations estão em [`supabase/README.md`](supabase/README.md).
