import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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
    const apiKey = Deno.env.get('GEMINI_API_KEY')
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
      return json({ error: 'Configure o secret GEMINI_API_KEY antes de gerar insights.' }, 503)
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

    const model = Deno.env.get('GEMINI_ANALYSIS_MODEL') ?? 'gemini-3.5-flash'
    const fallbackModel = 'gemini-3.1-flash-lite'
    const generateWithGemini = (modelName: string) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'Você é um analista financeiro pessoal prudente. Use apenas os dados recebidos. Não faça promessas, não prescreva investimentos e não dê conselhos genéricos. Seja específico, curto e ancorado nos números.',
                },
              ],
            },
            generationConfig: {
              maxOutputTokens: 900,
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Analise os dados financeiros abaixo. Retorne um JSON válido com este formato: {"summary":"...","highlights":["..."],"suggestions":["..."],"alerts":["..."]}. Dê entre 2 e 5 itens por lista quando houver base nos dados. Dados: ${JSON.stringify(prompt)}`,
                  },
                ],
              },
            ],
          }),
        },
      )

    let geminiResponse: Response | null = null
    let selectedModel = model

    for (const modelName of [...new Set([model, fallbackModel])]) {
      selectedModel = modelName

      for (let attempt = 0; attempt < 3; attempt += 1) {
        geminiResponse = await generateWithGemini(modelName)

        if (geminiResponse.ok || ![408, 429, 500, 502, 503, 504].includes(geminiResponse.status)) {
          break
        }

        if (attempt < 2) {
          await pause(750 * 2 ** attempt + Math.round(Math.random() * 250))
        }
      }

      if (geminiResponse.ok || ![429, 500, 502, 503, 504].includes(geminiResponse.status)) {
        break
      }
    }

    if (!geminiResponse?.ok) {
      const details = await geminiResponse.text()
      console.error('Gemini API error', geminiResponse.status, details)
      return json({ error: 'O Gemini não conseguiu gerar a análise agora.' }, 502)
    }

    const geminiPayload = await geminiResponse.json()
    const content = geminiPayload.candidates?.[0]?.content?.parts?.find((item: { text?: string }) => item.text)?.text

    if (!content) {
      return json({ error: 'A resposta do Gemini não trouxe uma análise em texto.' }, 502)
    }

    const insight = extractJson(content)
    const { error: saveError } = await supabase.from('insights').insert({
      period,
      model: geminiPayload.model ?? selectedModel,
      content_json: insight,
    })

    if (saveError) {
      throw saveError
    }

    return json({ insight, model: geminiPayload.model ?? selectedModel, period })
  } catch (error) {
    console.error('Analyze function error', error)
    return json({ error: 'Não foi possível gerar a análise. Tente novamente.' }, 500)
  }
})
