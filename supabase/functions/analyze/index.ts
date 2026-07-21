import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const paddedMonth = String(monthNumber).padStart(2, '0')

  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

const getSecretKey = () => {
  const keyMap = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (keyMap) {
    return JSON.parse(keyMap).default
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

const extractJson = (content: string) => {
  const jsonText = content.replace(/^```json\s*|\s*```$/g, '').trim()
  const parsed = JSON.parse(jsonText)

  return {
    summary: String(parsed.summary ?? ''),
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 5) : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).slice(0, 5) : [],
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts.map(String).slice(0, 5) : [],
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST para gerar uma análise.' }, 405)
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseSecretKey = getSecretKey()

    if (!supabaseUrl || !supabaseSecretKey) {
      return json({ error: 'Secrets padrão do Supabase não estão disponíveis.' }, 500)
    }

    const authorization = request.headers.get('Authorization')
    const accessToken = authorization?.replace(/^Bearer\s+/i, '')
    const supabase = createClient(supabaseUrl, supabaseSecretKey)

    if (!accessToken) {
      return json({ error: 'Faça login para gerar uma análise.' }, 401)
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
    const { data: owner } = userData.user
      ? await supabase.from('app_owner').select('user_id').eq('user_id', userData.user.id).maybeSingle()
      : { data: null }

    if (userError || !owner) {
      return json({ error: 'Este acesso não está autorizado.' }, 403)
    }

    if (!apiKey) {
      return json({ error: 'Configure o secret ANTHROPIC_API_KEY antes de gerar insights.' }, 503)
    }

    const { month, accountId, cardId } = await request.json()

    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return json({ error: 'Informe o mês no formato AAAA-MM.' }, 400)
    }

    const { start, end } = monthBounds(month)
    let transactionQuery = supabase
      .from('transactions')
      .select('date, amount, description, category_id, account_id, card_id')
      .gte('date', start)
      .lte('date', end)
      .order('amount', { ascending: true })
      .limit(500)

    if (typeof accountId === 'string' && accountId) {
      transactionQuery = transactionQuery.eq('account_id', accountId)
    }

    if (typeof cardId === 'string' && cardId) {
      transactionQuery = transactionQuery.eq('card_id', cardId)
    }

    const [{ data: transactions, error: transactionsError }, { data: categories, error: categoriesError }] =
      await Promise.all([
        transactionQuery,
        supabase.from('categories').select('id, name, kind'),
      ])

    if (transactionsError || categoriesError) {
      throw transactionsError ?? categoriesError
    }

    if (!transactions || transactions.length === 0) {
      return json({ error: 'Não há lançamentos para analisar neste período.' }, 400)
    }

    const categoryById = new Map(categories.map((category) => [category.id, category]))
    const totalsByCategory = new Map<string, number>()
    let inflows = 0
    let outflows = 0

    for (const transaction of transactions) {
      const amount = Number(transaction.amount)

      if (amount >= 0) {
        inflows += amount
        continue
      }

      outflows += Math.abs(amount)
      const category = categoryById.get(transaction.category_id)

      if (category?.kind !== 'transfer') {
        const name = category?.name ?? 'Sem categoria'
        totalsByCategory.set(name, (totalsByCategory.get(name) ?? 0) + Math.abs(amount))
      }
    }

    const categoryTotals = [...totalsByCategory.entries()]
      .sort(([, left], [, right]) => right - left)
      .slice(0, 8)
      .map(([name, amount]) => ({ name, amount }))
    const largestTransactions = [...transactions]
      .filter((transaction) => Number(transaction.amount) < 0)
      .slice(0, 8)
      .map((transaction) => ({ description: transaction.description, amount: Math.abs(Number(transaction.amount)) }))
    const period = `${month}|${accountId || 'all'}|${cardId || 'all'}`
    const prompt = {
      period: month,
      totals: { inflows, outflows, net: inflows - outflows, transactionCount: transactions.length },
      spendingByCategory: categoryTotals,
      largestExpenses: largestTransactions,
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_ANALYSIS_MODEL') ?? 'claude-sonnet-5',
        max_tokens: 900,
        system:
          'Você é um analista financeiro pessoal prudente. Use apenas os dados recebidos. Não faça promessas, não prescreva investimentos e não dê conselhos genéricos. Seja específico, curto e ancorado nos números.',
        messages: [
          {
            role: 'user',
            content: `Analise os dados financeiros abaixo. Retorne SOMENTE JSON válido com este formato: {"summary":"...","highlights":["..."],"suggestions":["..."],"alerts":["..."]}. Dê entre 2 e 5 itens por lista quando houver base nos dados. Dados: ${JSON.stringify(prompt)}`,
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const details = await anthropicResponse.text()
      console.error('Anthropic API error', anthropicResponse.status, details)
      return json({ error: 'A Anthropic não conseguiu gerar a análise agora.' }, 502)
    }

    const anthropicPayload = await anthropicResponse.json()
    const content = anthropicPayload.content?.find((item: { type: string }) => item.type === 'text')?.text

    if (!content) {
      return json({ error: 'A resposta da Anthropic não trouxe uma análise em texto.' }, 502)
    }

    const insight = extractJson(content)
    const model = anthropicPayload.model ?? Deno.env.get('ANTHROPIC_ANALYSIS_MODEL') ?? 'claude-sonnet-5'
    const { error: saveError } = await supabase.from('insights').insert({
      period,
      model,
      content_json: insight,
    })

    if (saveError) {
      throw saveError
    }

    return json({ insight, model, period })
  } catch (error) {
    console.error('Analyze function error', error)
    return json({ error: 'Não foi possível gerar a análise. Tente novamente.' }, 500)
  }
})
