import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  signDisplay: 'always',
})

const absoluteCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const formatDate = (date) => date.split('-').reverse().join('/')

const currentMonth = () => new Date().toISOString().slice(0, 7)

const getMonthBounds = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  const paddedMonth = String(monthNumber).padStart(2, '0')

  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

const monthLabel = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

const getPreviousMonths = (endMonth, count = 6) => {
  const [year, monthNumber] = endMonth.split('-').map(Number)

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthNumber - count + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

export function DashboardPage({ onImport }) {
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [evolutionTransactions, setEvolutionTransactions] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [accountId, setAccountId] = useState('')
  const [cardId, setCardId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadMetadata = async () => {
      try {
        const [accountsResult, cardsResult, categoriesResult] = await Promise.all([
          getSupabaseClient().from('accounts').select('id, name, type').order('name'),
          getSupabaseClient().from('cards').select('id, account_id, label, last_four').order('label'),
          getSupabaseClient().from('categories').select('id, name, kind, color').order('name'),
        ])

        if (accountsResult.error || cardsResult.error || categoriesResult.error) {
          throw accountsResult.error ?? cardsResult.error ?? categoriesResult.error
        }

        if (!isCurrent) {
          return
        }

        setAccounts(accountsResult.data)
        setCards(cardsResult.data)
        setCategories(categoriesResult.data)
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError.message ?? 'Não foi possível carregar os filtros do dashboard.')
        }
      }
    }

    loadMetadata()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    const loadTransactions = async () => {
      setIsLoading(true)
      setError('')

      try {
        const { start, end } = getMonthBounds(month)
        let query = getSupabaseClient()
          .from('transactions')
          .select('id, account_id, card_id, category_id, date, amount, description, raw_type')
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: false })
          .limit(500)

        if (accountId) {
          query = query.eq('account_id', accountId)
        }

        if (cardId) {
          query = query.eq('card_id', cardId)
        }

        const historicalMonths = getPreviousMonths(month)
        const historicalStart = getMonthBounds(historicalMonths[0]).start
        let evolutionQuery = getSupabaseClient()
          .from('transactions')
          .select('date, amount, card_id')
          .gte('date', historicalStart)
          .lte('date', end)
          .order('date', { ascending: true })
          .limit(3000)

        if (accountId) {
          evolutionQuery = evolutionQuery.eq('account_id', accountId)
        }

        if (cardId) {
          evolutionQuery = evolutionQuery.eq('card_id', cardId)
        }

        const [transactionsResult, evolutionResult] = await Promise.all([query, evolutionQuery])
        const { data, error: transactionsError } = transactionsResult

        if (transactionsError || evolutionResult.error) {
          throw transactionsError ?? evolutionResult.error
        }

        if (isCurrent) {
          setTransactions(data)
          setEvolutionTransactions(evolutionResult.data)
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError.message ?? 'Não foi possível carregar os lançamentos.')
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    loadTransactions()

    return () => {
      isCurrent = false
    }
  }, [month, accountId, cardId])

  const cardsForSelectedAccount = cards.filter((card) => !accountId || card.account_id === accountId)
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const cardNameById = new Map(cards.map((card) => [card.id, card.label]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  const summary = useMemo(() => {
    const inflows = transactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + Number(transaction.amount), 0)
    const outflows = transactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)

    return { inflows, outflows, net: inflows - outflows }
  }, [transactions])

  const categoryBreakdown = useMemo(() => {
    const totals = new Map()
    const categoriesById = new Map(categories.map((category) => [category.id, category]))

    for (const transaction of transactions) {
      const category = categoriesById.get(transaction.category_id)

      if (transaction.amount >= 0 || category?.kind === 'transfer') {
        continue
      }

      const key = transaction.category_id ?? 'uncategorized'
      const item = totals.get(key) ?? {
        name: category?.name ?? 'Sem categoria',
        color: category?.color ?? '#94A3B8',
        amount: 0,
      }
      item.amount += Math.abs(Number(transaction.amount))
      totals.set(key, item)
    }

    return [...totals.values()].sort((left, right) => right.amount - left.amount)
  }, [transactions, categories])

  const monthlyEvolution = useMemo(() => {
    const months = getPreviousMonths(month)
    const totals = new Map(
      months.map((period) => [period, { period, inflows: 0, outflows: 0, net: 0 }]),
    )

    for (const transaction of evolutionTransactions) {
      const period = transaction.date.slice(0, 7)
      const item = totals.get(period)

      if (!item) {
        continue
      }

      const amount = Number(transaction.amount)
      if (amount >= 0) {
        item.inflows += amount
      } else {
        item.outflows += Math.abs(amount)
      }
      item.net += amount
    }

    return months.map((period) => totals.get(period))
  }, [month, evolutionTransactions])

  const originBreakdown = useMemo(() => {
    const accountExpenses = transactions
      .filter((transaction) => !transaction.card_id && Number(transaction.amount) < 0)
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)
    const cardExpenses = transactions
      .filter((transaction) => transaction.card_id && Number(transaction.amount) < 0)
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)

    return [
      { label: 'Conta corrente', amount: accountExpenses, color: '#2563EB' },
      { label: 'Cartões', amount: cardExpenses, color: '#DB2777' },
    ]
  }, [transactions])

  const largestCategoryAmount = categoryBreakdown[0]?.amount ?? 1
  const largestOriginAmount = Math.max(...originBreakdown.map((origin) => origin.amount), 1)

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-emerald-700 uppercase">Controle financeiro</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Visão mensal</h1>
            <p className="mt-2 text-slate-600">Acompanhe o que entrou, saiu e onde você gastou em {monthLabel(month)}.</p>
          </div>
          <button
            className="w-fit rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200"
            onClick={onImport}
            type="button"
          >
            Importar extrato
          </button>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <label>
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Mês</span>
            <input
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => setMonth(event.target.value)}
              type="month"
              value={month}
            />
          </label>
          <label>
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Conta</span>
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => {
                setAccountId(event.target.value)
                setCardId('')
              }}
              value={accountId}
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cartão</span>
            <select
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              disabled={cardsForSelectedAccount.length === 0}
              onChange={(event) => setCardId(event.target.value)}
              value={cardId}
            >
              <option value="">Todos os cartões</option>
              {cardsForSelectedAccount.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.label} · final {card.last_four}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && <p className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Entradas e estornos" value={absoluteCurrencyFormatter.format(summary.inflows)} tone="emerald" />
          <SummaryCard label="Saídas e compras" value={absoluteCurrencyFormatter.format(summary.outflows)} tone="rose" />
          <SummaryCard label="Resultado do período" value={currencyFormatter.format(summary.net)} tone="slate" />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-lg font-bold text-slate-950">Evolução dos últimos 6 meses</h2>
              <p className="text-sm text-slate-600">Entradas, saídas e resultado</p>
            </div>
            {evolutionTransactions.length > 0 ? (
              <MonthlyEvolution months={monthlyEvolution} />
            ) : (
              <EmptyState text="A evolução aparece quando houver lançamentos em mais de um período." />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-slate-950">Conta x cartão</h2>
            <p className="mt-1 text-sm text-slate-600">Compras e saídas no mês selecionado.</p>
            {originBreakdown.some((origin) => origin.amount > 0) ? (
              <div className="mt-5 space-y-5">
                {originBreakdown.map((origin) => (
                  <div key={origin.label}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{origin.label}</span>
                      <span className="font-semibold text-slate-950">{absoluteCurrencyFormatter.format(origin.amount)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ backgroundColor: origin.color, width: `${(origin.amount / largestOriginAmount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="A comparação aparece depois de importar movimentações de conta ou cartão." />
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-slate-950">Gastos por categoria</h2>
            {categoryBreakdown.length > 0 ? (
              <div className="mt-5 space-y-4">
                {categoryBreakdown.map((category) => (
                  <div key={category.name}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-slate-800">{category.name}</span>
                      <span className="whitespace-nowrap font-semibold text-slate-950">
                        {absoluteCurrencyFormatter.format(category.amount)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ backgroundColor: category.color, width: `${(category.amount / largestCategoryAmount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="As categorias aparecem aqui depois da primeira importação." />
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-slate-950">Lançamentos recentes</h2>
              <p className="mt-1 text-sm text-slate-600">{transactions.length} lançamento(s) no período selecionado.</p>
            </div>
            {isLoading ? (
              <p className="p-6 text-sm text-slate-600">Carregando lançamentos…</p>
            ) : transactions.length > 0 ? (
              <div className="max-h-[33rem] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Data</th>
                      <th className="px-5 py-3 font-semibold">Lançamento</th>
                      <th className="px-5 py-3 font-semibold">Categoria</th>
                      <th className="px-5 py-3 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(transaction.date)}</td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{transaction.description}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {cardNameById.get(transaction.card_id) ?? accountNameById.get(transaction.account_id)}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {categoryById.get(transaction.category_id)?.name ?? 'Sem categoria'}
                        </td>
                        <td
                          className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${
                            Number(transaction.amount) < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {currencyFormatter.format(Number(transaction.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <EmptyState text="Nenhum lançamento encontrado para esses filtros." />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function SummaryCard({ label, value, tone }) {
  const color = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    slate: 'text-slate-950',
  }[tone]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function EmptyState({ text }) {
  return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{text}</p>
}

function MonthlyEvolution({ months }) {
  const largestAmount = Math.max(
    ...months.flatMap((month) => [month.inflows, month.outflows, Math.abs(month.net)]),
    1,
  )

  return (
    <div className="mt-6 overflow-x-auto">
      <div className="flex min-w-[34rem] items-end gap-4 px-2 pb-2">
        {months.map((month) => {
          const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
            .format(new Date(`${month.period}-02T12:00:00`))
            .replace('.', '')

          return (
            <div className="flex min-w-0 flex-1 flex-col" key={month.period}>
              <div className="flex h-40 items-end justify-center gap-1.5 rounded-xl bg-slate-50 px-2 pt-3">
                <Bar color="bg-emerald-500" height={(month.inflows / largestAmount) * 100} label="Entradas" />
                <Bar color="bg-rose-500" height={(month.outflows / largestAmount) * 100} label="Saídas" />
                <Bar color={month.net >= 0 ? 'bg-sky-500' : 'bg-amber-500'} height={(Math.abs(month.net) / largestAmount) * 100} label="Resultado" />
              </div>
              <p className="mt-2 text-center text-xs font-semibold text-slate-600">{label}</p>
              <p className={`mt-1 text-center text-xs font-semibold ${month.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {currencyFormatter.format(month.net)}
              </p>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        <Legend color="bg-emerald-500" label="Entradas" />
        <Legend color="bg-rose-500" label="Saídas" />
        <Legend color="bg-sky-500" label="Resultado positivo" />
        <Legend color="bg-amber-500" label="Resultado negativo" />
      </div>
    </div>
  )
}

function Bar({ color, height, label }) {
  return <span aria-label={label} className={`w-3 rounded-t ${color}`} style={{ height: `${Math.max(height, 2)}%` }} />
}

function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>
}
