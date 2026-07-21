import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FileUp,
  Landmark,
  Layers3,
  ReceiptText,
  TrendingUp,
  Wallet,
} from 'lucide-react'
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

const getPeriodOptions = (endMonth, count = 12) =>
  Array.from({ length: count }, (_, index) => {
    const [year, monthNumber] = endMonth.split('-').map(Number)
    const date = new Date(year, monthNumber - count + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }).reverse()

const bankLabel = (bank) =>
  bank ? bank.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Sem instituição'

const isTransfer = (transaction, categoriesById) =>
  categoriesById.get(transaction.category_id)?.kind === 'transfer'

export function DashboardPage({ onImport }) {
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [evolutionTransactions, setEvolutionTransactions] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [bank, setBank] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [cardId, setCardId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadMetadata = async () => {
      try {
        const [accountsResult, cardsResult, categoriesResult] = await Promise.all([
          getSupabaseClient().from('accounts').select('id, name, type, bank').order('name'),
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

        const accountIds = accounts
          .filter((account) => (!bank || account.bank === bank) && (!sourceType || account.type === sourceType))
          .map((account) => account.id)

        if (bank || sourceType) {
          query = query.in('account_id', accountIds)
        }

        if (cardId) {
          query = query.eq('card_id', cardId)
        }

        const historicalMonths = getPreviousMonths(month)
        const historicalStart = getMonthBounds(historicalMonths[0]).start
        let evolutionQuery = getSupabaseClient()
          .from('transactions')
          .select('date, amount, card_id, category_id')
          .gte('date', historicalStart)
          .lte('date', end)
          .order('date', { ascending: true })
          .limit(3000)

        if (bank || sourceType) {
          evolutionQuery = evolutionQuery.in('account_id', accountIds)
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
  }, [month, bank, sourceType, cardId, accounts])

  const banks = [...new Set(accounts.map((account) => account.bank).filter(Boolean))]
  const accountIdsForFilter = accounts
    .filter((account) => (!bank || account.bank === bank) && (!sourceType || account.type === sourceType))
    .map((account) => account.id)
  const cardsForSelectedAccount = cards.filter(
    (card) => accountIdsForFilter.includes(card.account_id),
  )
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const cardNameById = new Map(cards.map((card) => [card.id, card.label]))
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const summary = useMemo(() => {
    const inflows = transactions
      .filter((transaction) => transaction.amount > 0 && !isTransfer(transaction, categoryById))
      .reduce((total, transaction) => total + Number(transaction.amount), 0)
    const outflows = transactions
      .filter((transaction) => transaction.amount < 0 && !isTransfer(transaction, categoryById))
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)

    return { inflows, outflows, net: inflows - outflows }
  }, [transactions, categoryById])

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
      if (isTransfer(transaction, categoryById)) {
        continue
      }

      if (amount >= 0) {
        item.inflows += amount
      } else {
        item.outflows += Math.abs(amount)
      }
      item.net += amount
    }

    return months.map((period) => totals.get(period))
  }, [month, evolutionTransactions, categoryById])

  const originBreakdown = useMemo(() => {
    const accountExpenses = transactions
      .filter((transaction) => !transaction.card_id && Number(transaction.amount) < 0 && !isTransfer(transaction, categoryById))
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)
    const cardExpenses = transactions
      .filter((transaction) => transaction.card_id && Number(transaction.amount) < 0 && !isTransfer(transaction, categoryById))
      .reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)

    return [
      { label: 'Conta corrente', amount: accountExpenses, color: '#2563EB' },
      { label: 'Cartões', amount: cardExpenses, color: '#DB2777' },
    ]
  }, [transactions, categoryById])

  const largestCategoryAmount = categoryBreakdown[0]?.amount ?? 1
  const originTotal = originBreakdown.reduce((total, origin) => total + origin.amount, 0)

  return (
    <main className="app-page">
      <div className="page-container">
        <section className="relative overflow-hidden rounded-[1.7rem] bg-[#112b22] px-5 py-6 text-white shadow-[0_24px_55px_rgba(12,45,34,0.17)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">
          <div className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full border border-emerald-300/10 bg-emerald-300/5" />
          <div className="pointer-events-none absolute -right-5 -bottom-32 size-64 rounded-full border-[38px] border-white/[0.025]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.17em] text-emerald-300 uppercase">
                <TrendingUp aria-hidden="true" size={14} />
                Resumo financeiro
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-[2.45rem]">Seu mês em foco</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/65">
                Uma visão clara de tudo que entrou, saiu e merece sua atenção em {monthLabel(month)}.
              </p>
            </div>
            <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0b6549] shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-emerald-50" onClick={onImport} type="button">
              <FileUp aria-hidden="true" size={18} />
              Importar arquivo
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>

          <div className="relative mt-7 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-2 xl:grid-cols-4">
            <FilterControl icon={CalendarDays} label="Período">
              <select className="form-control border-white/10 bg-[#19362c] text-white hover:border-white/20 focus:border-emerald-300" onChange={(event) => setMonth(event.target.value)} value={month}>
                {getPeriodOptions(currentMonth()).map((period) => <option key={period} value={period}>{monthLabel(period)}</option>)}
              </select>
            </FilterControl>
            <FilterControl icon={Landmark} label="Conta">
              <select className="form-control border-white/10 bg-[#19362c] text-white hover:border-white/20 focus:border-emerald-300" onChange={(event) => { setBank(event.target.value); setCardId('') }} value={bank}>
                <option value="">Todas as contas</option>
                {banks.map((accountBank) => <option key={accountBank} value={accountBank}>{bankLabel(accountBank)}</option>)}
              </select>
            </FilterControl>
            <FilterControl icon={Layers3} label="Origem">
              <select className="form-control border-white/10 bg-[#19362c] text-white hover:border-white/20 focus:border-emerald-300" onChange={(event) => { setSourceType(event.target.value); setCardId('') }} value={sourceType}>
                <option value="">Conta corrente e cartões</option>
                <option value="checking">Conta corrente</option>
                <option value="credit_card">Cartões de crédito</option>
              </select>
            </FilterControl>
            <FilterControl icon={CreditCard} label="Cartão">
              <select className="form-control border-white/10 bg-[#19362c] text-white hover:border-white/20 focus:border-emerald-300" disabled={cardsForSelectedAccount.length === 0} onChange={(event) => setCardId(event.target.value)} value={cardId}>
                <option value="">Todos os cartões</option>
                {cardsForSelectedAccount.map((card) => <option key={card.id} value={card.id}>{card.label} · final {card.last_four}</option>)}
              </select>
            </FilterControl>
          </div>
        </section>

        {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard detail="Receitas e créditos, sem transferências" icon={ArrowDownLeft} label="Entradas" value={absoluteCurrencyFormatter.format(summary.inflows)} tone="emerald" />
          <SummaryCard detail="Despesas e compras, sem transferências" icon={ArrowUpRight} label="Saídas" value={absoluteCurrencyFormatter.format(summary.outflows)} tone="rose" />
          <SummaryCard detail="Entradas menos saídas; não é o saldo bancário" icon={Wallet} label="Fluxo do mês" value={currencyFormatter.format(summary.net)} tone={summary.net >= 0 ? 'blue' : 'amber'} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(20rem,0.58fr)]">
          <div className="surface-card p-5 sm:p-6">
            <SectionHeader description="Compare receitas, despesas e resultado ao longo do tempo." icon={TrendingUp} title="Evolução em 6 meses" />
            {evolutionTransactions.length > 0 ? <MonthlyEvolution months={monthlyEvolution} /> : <EmptyState text="A evolução aparece quando houver lançamentos em mais de um período." />}
          </div>

          <div className="surface-card p-5 sm:p-6">
            <SectionHeader description="De onde vieram suas saídas neste mês." icon={CircleDollarSign} title="Origem dos gastos" />
            {originTotal > 0 ? (
              <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row xl:flex-col 2xl:flex-row">
                <div className="relative grid size-36 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#2563EB 0 ${(originBreakdown[0].amount / originTotal) * 100}%, #DB2777 ${(originBreakdown[0].amount / originTotal) * 100}% 100%)` }}>
                  <div className="grid size-[6.7rem] place-items-center rounded-full bg-white text-center shadow-inner">
                    <span><span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">Total</span><span className="mt-1 block text-sm font-bold text-slate-900">{absoluteCurrencyFormatter.format(originTotal)}</span></span>
                  </div>
                </div>
                <div className="w-full space-y-4">
                  {originBreakdown.map((origin, index) => (
                    <div className="flex items-center gap-3" key={origin.label}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${origin.color}12`, color: origin.color }}>{index === 0 ? <Landmark size={17} /> : <CreditCard size={17} />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3"><span className="text-xs font-semibold text-slate-600">{origin.label}</span><span className="text-[11px] font-bold text-slate-400">{Math.round((origin.amount / originTotal) * 100)}%</span></div>
                        <p className="mt-0.5 text-sm font-bold text-slate-900">{absoluteCurrencyFormatter.format(origin.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyState text="A comparação aparece depois de importar movimentações de conta ou cartão." />}
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
          <div className="surface-card p-5 sm:p-6">
            <SectionHeader description="As categorias que mais pesaram no período." icon={Layers3} title="Gastos por categoria" />
            {categoryBreakdown.length > 0 ? (
              <div className="mt-6 space-y-5">
                {categoryBreakdown.slice(0, 7).map((category) => (
                  <div key={category.name}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5 font-semibold text-slate-700"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate">{category.name}</span></span>
                      <span className="whitespace-nowrap text-xs font-bold text-slate-900">{absoluteCurrencyFormatter.format(category.amount)}</span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ backgroundColor: category.color, width: `${(category.amount / largestCategoryAmount) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="As categorias aparecem aqui depois da primeira importação." />}
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-[#e5ece8] p-5 sm:p-6">
              <SectionHeader description={`${transactions.length} lançamento(s) no período selecionado.`} icon={ReceiptText} title="Movimentações recentes" />
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 sm:inline">Atualizado</span>
            </div>
            {isLoading ? <p className="p-6 text-sm text-slate-500">Carregando lançamentos…</p> : transactions.length > 0 ? (
              <div className="max-h-[34rem] overflow-auto">
                <table className="data-table min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#f8faf9] text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase">
                    <tr><th className="px-5 py-3.5">Data</th><th className="px-5 py-3.5">Lançamento</th><th className="hidden px-5 py-3.5 md:table-cell">Categoria</th><th className="px-5 py-3.5 text-right">Valor</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2ef]">
                    {transactions.map((transaction) => {
                      const category = categoryById.get(transaction.category_id)
                      return (
                        <tr key={transaction.id}>
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDate(transaction.date)}</td>
                          <td className="max-w-xs px-5 py-4"><p className="truncate font-semibold text-slate-800">{transaction.description}</p><p className="mt-1 truncate text-[11px] text-slate-400">{cardNameById.get(transaction.card_id) ?? accountNameById.get(transaction.account_id)}</p></td>
                          <td className="hidden px-5 py-4 md:table-cell"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"><span className="size-1.5 rounded-full" style={{ backgroundColor: category?.color ?? '#94A3B8' }} />{category?.name ?? 'Sem categoria'}</span></td>
                          <td className={`whitespace-nowrap px-5 py-4 text-right text-xs font-bold ${Number(transaction.amount) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currencyFormatter.format(Number(transaction.amount))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-6"><EmptyState text="Nenhum lançamento encontrado para esses filtros." /></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function FilterControl({ children, icon: Icon, label }) {
  return <label><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-emerald-100/65 uppercase"><Icon aria-hidden="true" size={12} />{label}</span>{children}</label>
}

function SectionHeader({ description, icon: Icon, title }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon aria-hidden="true" size={18} strokeWidth={1.9} /></span><div><h2 className="section-title">{title}</h2><p className="section-description">{description}</p></div></div>
}

function SummaryCard({ detail, icon: Icon, label, value, tone }) {
  const styles = {
    emerald: { icon: 'bg-emerald-50 text-emerald-700', value: 'text-emerald-700' },
    rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-600' },
    blue: { icon: 'bg-sky-50 text-sky-700', value: 'text-slate-950' },
    amber: { icon: 'bg-amber-50 text-amber-700', value: 'text-amber-700' },
  }[tone]

  return <div className="surface-card flex items-center gap-4 p-4 sm:p-5"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${styles.icon}`}><Icon aria-hidden="true" size={21} strokeWidth={1.9} /></span><div className="min-w-0"><p className="text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase">{label}</p><p className={`mt-1 truncate text-xl font-bold tracking-[-0.025em] sm:text-2xl ${styles.value}`}>{value}</p><p className="mt-0.5 text-[11px] text-slate-400">{detail}</p></div></div>
}

function EmptyState({ text }) {
  return <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-500">{text}</p>
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
