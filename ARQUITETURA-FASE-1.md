# Controle Financeiro Pessoal — Arquitetura Fase 1

Documento de referência para construção no Claude Code. Uso pessoal, single-user (Victor/Pinho). Banco alvo: Bradesco.

---

## 1. Escopo da Fase 1

O objetivo é fechar o loop inteiro com o menor número de partes móveis: importar OFX do Bradesco (conta corrente e cartão), normalizar, categorizar, visualizar e receber análise por IA.

Dentro da Fase 1:
- Import manual de OFX (conta corrente + fatura de cartão, mesmo parser).
- Deduplicação por FITID (resolve o problema da janela de 60 dias e reimportações sobrepostas).
- Categorização híbrida: regras fixas primeiro, IA para o que sobrar.
- Dashboard: saldo, gastos por categoria, evolução mensal, conta vs cartão.
- Botão "Analisar com IA" que gera insights e sugestões sobre o período.
- PWA instalável no iPhone e no Mac (Safari).

Fora da Fase 1 (ver seção 9): investimentos, automação via Open Finance/Pluggy, multiusuário.

---

## 2. Decisões de stack

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Vite + React + Tailwind, como PWA | Dashboard com filtros, categorias e gráficos tem estado demais para vanilla se manter limpo. É um passo acima do seu padrão vanilla, mas se paga na manutenção. |
| Backend/DB | Supabase (Postgres + Auth) | Aguenta volume de transação de vários meses, coisa que o Sheets começa a arrastar. Free tier serve de sobra para uso pessoal. |
| Parsing OFX | Client-side, no navegador | O arquivo nunca sai da sua máquina; só as linhas normalizadas vão pro seu Supabase. Sem servidor intermediário. |
| Camada de IA | Supabase Edge Function chamando a Anthropic API | A chave da API fica no servidor, nunca no frontend do PWA. |
| Hospedagem | GitHub Pages ou Vercel | Vercel lida melhor com build do Vite; Pages também serve se preferir manter seu padrão. |

Observação sobre a chave da Anthropic: este app roda fora do claude.ai, então não existe "Claude dentro do Claude" aqui. Você usa sua própria API key da Anthropic, guardada como secret na Edge Function do Supabase.

Sugestão de modelo por tarefa, pensando em custo:
- Categorização de lançamentos desconhecidos (alto volume): Claude Haiku.
- Análise mensal e sugestões (baixo volume, qualidade importa): Claude Sonnet.

---

## 3. Dados do Bradesco (o que já sabemos)

Conta corrente:
- Caminho: Internet Banking (desktop) → Saldos e Extratos → Extrato Mensal / Por Período → escolher período e conta → Buscar → Salvar como arquivo → OFX (Money 2000 em diante).
- Só disponível no Internet Banking no computador, não no app.
- Banco só entrega os últimos 60 dias. Exportar com frequência.

Cartão de crédito:
- Caminho: Internet Banking (desktop) → seção de Faturas → selecionar fatura → exportar em OFX ou TXT.
- Se o OFX do cartão vier inconsistente, cair para TXT ou PDF como fallback.

Formato:
- OFX Money 100/102 (OFX 1.0.x, SGML, não é XML limpo).
- Máximo 5MB por arquivo.
- Exportar com datas em ordem crescente.

Implicações no desenho:
- FITID é a chave de deduplicação. Constraint única em (account_id, fitid).
- O import tem que ser idempotente: reimportar um período sobreposto não pode duplicar nada.
- O parser precisa tratar SGML do OFX 1.x (tags sem fechamento), não assumir XML.

---

## 4. Modelo de dados (Supabase / Postgres)

```
accounts
  id            uuid pk
  name          text          -- "Bradesco CC", "Bradesco Cartão"
  type          text          -- 'checking' | 'credit_card' | 'investment'
  bank          text          -- 'bradesco'
  currency      text default 'BRL'
  created_at    timestamptz

transactions
  id            uuid pk
  account_id    uuid fk -> accounts
  fitid         text          -- ID único do OFX; base da deduplicação
  date          date
  amount        numeric(14,2) -- negativo = saída, positivo = entrada
  description   text
  memo          text
  raw_type      text          -- DEBIT, CREDIT, etc. do OFX
  category_id   uuid fk -> categories null
  subcategory   text null
  notes         text null
  created_at    timestamptz
  UNIQUE (account_id, fitid)  -- garante idempotência do import

categories
  id            uuid pk
  name          text
  parent_id     uuid fk -> categories null
  kind          text          -- 'expense' | 'income' | 'transfer'
  icon          text
  color         text

category_rules
  id            uuid pk
  pattern       text          -- substring ou regex sobre description/memo
  is_regex      boolean default false
  category_id   uuid fk -> categories
  priority      int default 0 -- maior aplica primeiro

imports
  id            uuid pk
  account_id    uuid fk -> accounts
  filename      text
  period_start  date
  period_end    date
  rows_imported int
  rows_skipped  int           -- duplicados ignorados
  created_at    timestamptz

insights
  id            uuid pk
  period        text          -- '2026-07' ou range
  generated_at  timestamptz
  model         text
  content_json  jsonb         -- resumo, sugestões, alertas estruturados
```

---

## 5. Fluxo do pipeline

1. Você exporta o OFX no Internet Banking do Bradesco (conta e/ou cartão) no Mac.
2. No PWA: "Importar OFX" → seletor de arquivo → parsing client-side → linhas normalizadas.
3. Upsert em `transactions` com `ON CONFLICT (account_id, fitid) DO NOTHING`. O que já existe é contado como skipped. Registra um `imports`.
4. Auto-categorização: aplica `category_rules` por prioridade. O que não casar fica com category_id nulo ("a classificar").
5. Opcional: os "a classificar" vão em lote para a Edge Function → Claude Haiku sugere categoria → você confirma na tela. Ao confirmar, dá para salvar uma nova regra automaticamente.
6. Dashboard lê as views agregadas e mostra saldo, gasto por categoria, evolução mensal, conta vs cartão.
7. "Analisar com IA": a Edge Function agrega o período, monta o prompt, chama Claude Sonnet, salva em `insights` (cache) e devolve para a tela.

---

## 6. Estrutura de pastas

```
controle-financeiro/
  README.md
  ARQUITETURA-FASE-1.md        <- este arquivo
  .env.example                 <- URLs e anon key do Supabase (sem segredos reais)
  index.html
  vite.config.js
  package.json
  public/
    manifest.webmanifest       <- PWA (ícones, nome, display standalone)
    sw.js                      <- service worker (network-first para dados)
  src/
    main.jsx
    App.jsx
    lib/
      supabase.js              <- client
      ofx.js                   <- parser OFX 1.x (SGML) -> linhas normalizadas
      categorize.js            <- aplica regras locais
    features/
      import/                  <- tela de importação + preview + dedup feedback
      dashboard/               <- cards, gráficos, filtros
      transactions/            <- lista, edição de categoria, criar regra
      insights/                <- análise IA
    components/                <- UI compartilhada
  supabase/
    migrations/                <- SQL das tabelas da seção 4
    functions/
      analyze/                 <- Edge Function: agrega período + chama Claude
      categorize/              <- Edge Function: sugestão de categoria em lote
```

---

## 7. Camada de IA (Edge Functions)

`analyze`:
- Entrada: período (ex. mês corrente) e filtros.
- Passo 1: query agregada no Postgres (total por categoria, evolução vs meses anteriores, maiores lançamentos, gasto no cartão vs conta).
- Passo 2: monta prompt com esses números já agregados (não manda transação crua a torto e a direito, economiza token e melhora a resposta).
- Passo 3: chama Claude Sonnet pedindo saída em JSON estruturado (resumo, 3 a 5 sugestões acionáveis, alertas de gasto fora do padrão).
- Passo 4: salva em `insights` e retorna.

Cuidado de prompt: exigir sugestões específicas e ancoradas nos números do período, proibir conselho genérico tipo "gaste menos". A qualidade da análise vive ou morre aqui.

`categorize`:
- Entrada: lote de descrições sem categoria.
- Saída: JSON mapeando descrição → categoria sugerida, para você confirmar na tela.
- Usa Claude Haiku por ser volume e tarefa simples.

---

## 8. Gotchas conhecidos

- OFX do Bradesco é SGML (OFX 1.0.x), não XML. O parser tem que tolerar tags sem fechamento. Não usar um parser XML estrito direto.
- Janela de 60 dias: sem a dedup por FITID, reimportar gera duplicata. A constraint única é obrigatória, não opcional.
- Encoding: OFX brasileiro costuma vir em Latin-1 (ISO-8859-1). Detectar e converter para UTF-8 na leitura, senão acento quebra.
- Sinal do valor: conferir se o Bradesco usa TRNAMT negativo para saída. Normalizar para a convenção "negativo = saída" na importação.
- Fatura de cartão: o valor dos lançamentos é gasto, mas o pagamento da fatura aparece na conta corrente. Cuidado para não contar o gasto duas vezes ao somar conta + cartão. Tratar pagamento de fatura como categoria 'transfer', não 'expense'.

---

## 9. Fora de escopo (Fase 2 em diante)

- Investimentos: Bradesco não tem export limpo para pessoa física. Adiado.
- Automação via Open Finance (Pluggy caminho "Meu Pluggy" para conectar suas próprias contas). Só depois do loop manual estar sólido.
- Multiusuário e compartilhamento. Não é necessário, é só seu.
