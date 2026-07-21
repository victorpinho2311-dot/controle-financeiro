import { useEffect, useState } from 'react'
import { BrainCircuit, CalendarDays, Lightbulb, Sparkles, WandSparkles } from 'lucide-react'
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
    <main className="app-page">
      <div className="page-container max-w-5xl!">
        <header className="relative mb-5 overflow-hidden rounded-[1.7rem] bg-[#112b22] px-5 py-7 text-white shadow-[0_24px_55px_rgba(12,45,34,0.16)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -top-28 -right-16 size-64 rounded-full border-[32px] border-emerald-300/5" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.17em] text-emerald-300 uppercase"><Sparkles aria-hidden="true" size={14} />Inteligência financeira</p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-[2.35rem]">Insights do período</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/65">Uma leitura objetiva dos seus números, com pontos de atenção e oportunidades.</p>
          </div>
          <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-800 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isGenerating} onClick={generateInsight} type="button">
            <WandSparkles aria-hidden="true" size={17} />{isGenerating ? 'Gerando análise…' : 'Analisar com IA'}
          </button>
          </div>
        </header>

        <section className="surface-card grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
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
          <p className="surface-card mt-5 p-6 text-sm text-slate-600">Carregando análise anterior…</p>
        ) : insight ? (
          <InsightContent insight={insight} />
        ) : (
          <section className="surface-card mt-5 p-6 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><BrainCircuit aria-hidden="true" size={23} /></span>
            <h2 className="mt-4 text-lg font-bold tracking-tight text-slate-950">Nenhuma análise salva para {monthLabel(month)}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Quando a integração de IA estiver configurada, use “Analisar com IA” para transformar suas movimentações em um resumo claro.</p>
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
      <span className="mt-1.5 block">
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
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <Lightbulb aria-hidden="true" className="absolute top-4 right-4 text-emerald-200" size={42} />
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
    <article className={`rounded-2xl border p-5 shadow-[0_8px_24px_rgba(17,45,35,0.035)] ${color}`}>
      <h2 className="flex items-center gap-2 font-bold text-slate-950"><CalendarDays aria-hidden="true" className="text-emerald-700" size={16} />{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-700">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Sem apontamentos para este período.</p>
      )}
    </article>
  )
}
