import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase.js'

const currentMonth = () => new Date().toISOString().slice(0, 7)

const monthLabel = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  )
}

export function InsightsPage() {
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [accountId, setAccountId] = useState('')
  const [cardId, setCardId] = useState('')
  const [insight, setInsight] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [message, setMessage] = useState('')

  const period = `${month}|${accountId || 'all'}|${cardId || 'all'}`
  const cardsForSelectedAccount = cards.filter((card) => !accountId || card.account_id === accountId)

  useEffect(() => {
    let isCurrent = true

    const loadFilters = async () => {
      try {
        const [accountsResult, cardsResult] = await Promise.all([
          getSupabaseClient().from('accounts').select('id, name').order('name'),
          getSupabaseClient().from('cards').select('id, account_id, label, last_four').order('label'),
        ])

        if (accountsResult.error || cardsResult.error) {
          throw accountsResult.error ?? cardsResult.error
        }

        if (isCurrent) {
          setAccounts(accountsResult.data)
          setCards(cardsResult.data)
        }
      } catch (error) {
        if (isCurrent) {
          setMessage(error.message ?? 'Não foi possível carregar os filtros.')
        }
      }
    }

    loadFilters()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    const loadLatestInsight = async () => {
      setIsLoading(true)
      setMessage('')

      try {
        const { data, error } = await getSupabaseClient()
          .from('insights')
          .select('content_json, generated_at, model')
          .eq('period', period)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) {
          throw error
        }

        if (isCurrent) {
          setInsight(data)
        }
      } catch (error) {
        if (isCurrent) {
          setMessage(error.message ?? 'Não foi possível carregar a análise anterior.')
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    loadLatestInsight()

    return () => {
      isCurrent = false
    }
  }, [period])

  const generateInsight = async () => {
    setIsGenerating(true)
    setMessage('')

    try {
      const { data, error } = await getSupabaseClient().functions.invoke('analyze', {
        body: { month, accountId, cardId },
      })

      if (error) {
        const details = error.context instanceof Response ? await error.context.json().catch(() => null) : null
        throw new Error(details?.error ?? error.message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      if (!data?.insight) {
        throw new Error('A análise não retornou um resultado válido.')
      }

      setInsight({ content_json: data.insight, generated_at: new Date().toISOString(), model: data.model })
    } catch (error) {
      setMessage(error.message ?? 'Não foi possível gerar insights agora.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-emerald-700 uppercase">Controle financeiro</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Insights do período</h1>
            <p className="mt-2 max-w-2xl text-slate-600">Uma leitura objetiva dos números importados, com sugestões ancoradas na sua movimentação.</p>
          </div>
          <button className="w-fit rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={isGenerating} onClick={generateInsight} type="button">
            {isGenerating ? 'Gerando análise…' : 'Analisar com IA'}
          </button>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <Filter label="Mês"><input className="insight-input" onChange={(event) => setMonth(event.target.value)} type="month" value={month} /></Filter>
          <Filter label="Conta">
            <select className="insight-input" onChange={(event) => { setAccountId(event.target.value); setCardId('') }} value={accountId}>
              <option value="">Todas as contas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </Filter>
          <Filter label="Cartão">
            <select className="insight-input" disabled={cardsForSelectedAccount.length === 0} onChange={(event) => setCardId(event.target.value)} value={cardId}>
              <option value="">Todos os cartões</option>
              {cardsForSelectedAccount.map((card) => <option key={card.id} value={card.id}>{card.label} · final {card.last_four}</option>)}
            </select>
          </Filter>
        </section>

        {message && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}

        {isLoading ? (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Carregando análise anterior…</p>
        ) : insight ? (
          <InsightContent insight={insight} />
        ) : (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Nenhuma análise salva para {monthLabel(month)}</h2>
            <p className="mt-2 text-sm text-slate-600">Depois de importar lançamentos, clique em “Analisar com IA” para gerar o primeiro resumo.</p>
          </section>
        )}
      </div>
    </main>
  )
}

function Filter({ label, children }) {
  return (
    <label>
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <span className="mt-1.5 block [&_.insight-input]:block [&_.insight-input]:w-full [&_.insight-input]:rounded-lg [&_.insight-input]:border [&_.insight-input]:border-slate-300 [&_.insight-input]:bg-white [&_.insight-input]:px-3 [&_.insight-input]:py-2 [&_.insight-input]:text-sm [&_.insight-input]:text-slate-950 [&_.insight-input]:outline-none [&_.insight-input:focus]:border-emerald-600 [&_.insight-input:focus]:ring-4 [&_.insight-input:focus]:ring-emerald-100">
        {children}
      </span>
    </label>
  )
}

function InsightContent({ insight }) {
  const content = insight.content_json
  const generatedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(insight.generated_at))

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">Resumo</p>
        <p className="mt-2 text-lg leading-7 text-emerald-950">{content.summary}</p>
        <p className="mt-4 text-xs text-emerald-800">Gerado em {generatedAt} · {insight.model}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <InsightList title="Destaques" items={content.highlights} tone="slate" />
        <InsightList title="Sugestões" items={content.suggestions} tone="emerald" />
        <InsightList title="Alertas" items={content.alerts} tone="amber" />
      </div>
    </section>
  )
}

function InsightList({ items = [], title, tone }) {
  const color = {
    slate: 'border-slate-200 bg-white',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
  }[tone]

  return (
    <article className={`rounded-2xl border p-5 ${color}`}>
      <h2 className="font-bold text-slate-950">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-700">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Sem apontamentos para este período.</p>
      )}
    </article>
  )
}
