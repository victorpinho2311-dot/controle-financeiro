import { useEffect, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, FileUp, LockKeyhole, UploadCloud } from 'lucide-react'
import { parseBradescoCreditCardCsvFile } from '../../lib/card-csv.js'
import { suggestCategoryId } from '../../lib/categorization.js'
import { parseOfxFile } from '../../lib/ofx.js'
import { getSupabaseClient } from '../../lib/supabase.js'
import { analyzeTransactions, getTransactionsForPreviewMode } from '../../lib/transaction-analysis.js'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  signDisplay: 'always',
})

const absoluteCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const accountTypeLabel = {
  checking: 'Conta corrente',
  credit_card: 'Cartão de crédito',
}

const formatDate = (date) => date.split('-').reverse().join('/')

const previewModes = {
  account: 'Movimentações da conta',
  investments: 'Investimentos',
  all: 'Todos os lançamentos',
}

const transactionTypeLabel = {
  CARD_PURCHASE: 'Compra',
  CARD_CREDIT: 'Estorno/crédito',
  DEBIT: 'Saída da conta',
  CREDIT: 'Entrada da conta',
}

const defaultCardLabel = (lastFour, role) =>
  `${role === 'additional' ? 'Adicional' : 'Titular'} · final ${lastFour}`

const cardRoleLabel = {
  primary: 'Titular',
  additional: 'Adicional',
}

export function ImportPage() {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryRules, setCategoryRules] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
  const [accountsError, setAccountsError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [parsedOfx, setParsedOfx] = useState(null)
  const [parseError, setParseError] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [previewMode, setPreviewMode] = useState('account')
  const [searchTerm, setSearchTerm] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [cardLabels, setCardLabels] = useState({})
  const [cardFilter, setCardFilter] = useState('all')
  const [categoryOverrides, setCategoryOverrides] = useState({})
  const [ruleFeedback, setRuleFeedback] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadAccounts = async () => {
      try {
        const [accountsResult, categoriesResult, rulesResult] = await Promise.all([
          getSupabaseClient()
            .from('accounts')
            .select('id, name, type, bank')
            .in('type', ['checking', 'credit_card'])
            .order('name'),
          getSupabaseClient().from('categories').select('id, name, kind').order('kind').order('name'),
          getSupabaseClient()
            .from('category_rules')
            .select('id, pattern, is_regex, category_id, priority')
            .order('priority', { ascending: false }),
        ])

        if (accountsResult.error || categoriesResult.error || rulesResult.error) {
          throw accountsResult.error ?? categoriesResult.error ?? rulesResult.error
        }

        if (!isCurrent) {
          return
        }

        setAccounts(accountsResult.data)
        setCategories(categoriesResult.data)
        setCategoryRules(rulesResult.data)
        setSelectedAccountId(accountsResult.data[0]?.id ?? '')
      } catch (error) {
        if (isCurrent) {
          setAccountsError(error.message ?? 'Não foi possível carregar as contas.')
        }
      } finally {
        if (isCurrent) {
          setIsLoadingAccounts(false)
        }
      }
    }

    loadAccounts()

    return () => {
      isCurrent = false
    }
  }, [])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setSelectedFileName(file.name)
    setParsedOfx(null)
    setParseError('')
    setImportError('')
    setImportResult(null)
    setPreviewMode('account')
    setSearchTerm('')
    setCardLabels({})
    setCardFilter('all')
    setCategoryOverrides({})
    setRuleFeedback('')
    setIsParsing(true)

    try {
      if (!selectedAccount) {
        throw new Error('Escolha uma conta antes de selecionar o arquivo.')
      }

      const parser =
        selectedAccount.type === 'credit_card' ? parseBradescoCreditCardCsvFile : parseOfxFile

      const parsedFile = await parser(file)

      if (selectedAccount.type === 'credit_card' && parsedFile.cards?.length > 0) {
        const labelsFromFile = Object.fromEntries(
          parsedFile.cards.map((card) => [card.lastFour, defaultCardLabel(card.lastFour, card.role)]),
        )
        const { data: storedCards } = await getSupabaseClient()
          .from('cards')
          .select('last_four, label')
          .eq('account_id', selectedAccountId)
        const storedLabels = Object.fromEntries(
          (storedCards ?? []).map((card) => [card.last_four, card.label]),
        )

        setCardLabels({ ...labelsFromFile, ...storedLabels })
      }

      setParsedOfx(parsedFile)
    } catch (error) {
      setParseError(error.message ?? 'Não foi possível ler este arquivo OFX.')
    } finally {
      setIsParsing(false)
    }
  }

  const handleImport = async () => {
    if (!selectedAccountId || !analysis || analysis.importable.length === 0) {
      return
    }

    const transactionDates = analysis.importable.map((transaction) => transaction.date).sort()
    const { periodStart, periodEnd } = parsedOfx

    setIsImporting(true)
    setImportError('')

    try {
      const supabase = getSupabaseClient()
      const cardIdsByLastFour = new Map()

      if (isCreditCard && parsedOfx.cards?.length > 0) {
        const cardsForImport = parsedOfx.cards.map((card) => ({
          account_id: selectedAccountId,
          last_four: card.lastFour,
          label:
            cardLabels[card.lastFour]?.trim() || defaultCardLabel(card.lastFour, card.role),
          holder_name: card.holderName,
        }))
        const { data: savedCards, error: cardsError } = await supabase
          .from('cards')
          .upsert(cardsForImport, { onConflict: 'account_id,last_four' })
          .select('id, last_four')

        if (cardsError) {
          throw cardsError
        }

        for (const card of savedCards ?? []) {
          cardIdsByLastFour.set(card.last_four, card.id)
        }
      }

      const transactions = analysis.importable.map(
        ({ fitid, date, amount, description, memo, rawType, cardLastFour }) => {
          const cardId = cardLastFour ? cardIdsByLastFour.get(cardLastFour) : null

          if (isCreditCard && !cardId) {
            throw new Error(`Não foi possível vincular o cartão final ${cardLastFour}.`)
          }

          return {
            fitid,
            date,
            amount,
            description,
            memo,
            raw_type: rawType,
            card_id: cardId,
            category_id: categoryIdFor({ fitid, description, memo }) || null,
          }
        },
      )
      const { data, error } = await supabase.rpc('import_transactions', {
        p_account_id: selectedAccountId,
        p_filename: selectedFileName,
        p_period_start: periodStart ?? transactionDates[0],
        p_period_end: periodEnd ?? transactionDates.at(-1),
        p_transactions: transactions,
      })

      if (error) {
        throw error
      }

      const importId = data?.[0]?.import_id
      if (importId && parsedOfx.ledgerBalance != null && parsedOfx.ledgerBalanceDate) {
        const { error: balanceError } = await supabase
          .from('imports')
          .update({
            closing_balance: parsedOfx.ledgerBalance,
            balance_date: parsedOfx.ledgerBalanceDate,
          })
          .eq('id', importId)

        if (balanceError) {
          throw balanceError
        }
      }

      setImportResult(data?.[0] ?? null)
    } catch (error) {
      setImportError(error.message ?? 'Não foi possível salvar esta importação.')
    } finally {
      setIsImporting(false)
    }
  }

  const handleRememberCategory = async (transaction) => {
    const categoryId = categoryIdFor(transaction)

    if (!categoryId) {
      setRuleFeedback('Escolha uma categoria antes de memorizar uma regra.')
      return
    }

    const pattern = transaction.description.trim()
    setRuleFeedback('Salvando regra…')

    try {
      const supabase = getSupabaseClient()
      const { error: deleteError } = await supabase
        .from('category_rules')
        .delete()
        .eq('pattern', pattern)
        .eq('priority', 100)

      if (deleteError) {
        throw deleteError
      }

      const rule = {
        pattern,
        is_regex: false,
        category_id: categoryId,
        priority: 100,
      }
      const { data, error } = await supabase.from('category_rules').insert(rule).select().single()

      if (error) {
        throw error
      }

      setCategoryRules((currentRules) => [
        data,
        ...currentRules.filter((currentRule) => !(currentRule.pattern === pattern && currentRule.priority === 100)),
      ])
      setRuleFeedback(`Regra memorizada para “${pattern}”.`)
    } catch (error) {
      setRuleFeedback(error.message ?? 'Não foi possível salvar esta regra.')
    }
  }

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  const accountsByBank = accounts.reduce((groups, account) => {
    const bank = account.bank || 'Outras contas'
    groups.set(bank, [...(groups.get(bank) ?? []), account])
    return groups
  }, new Map())
  const isCreditCard = selectedAccount?.type === 'credit_card'
  const fileTypeLabel = isCreditCard ? 'CSV da fatura' : 'Arquivo OFX'
  const fileAccept = isCreditCard
    ? '.csv,text/csv,text/plain'
    : '.ofx,.qfx,application/x-ofx,text/ofx,text/plain'
  const analysis = parsedOfx
    ? analyzeTransactions(parsedOfx.transactions, {
        periodStart: parsedOfx.periodStart,
        periodEnd: parsedOfx.periodEnd,
      })
    : null
  const transactionsForMode = analysis ? getTransactionsForPreviewMode(analysis, previewMode) : []
  const previewModeLabels = isCreditCard
    ? { ...previewModes, account: 'Lançamentos da fatura' }
    : previewModes
  const availablePreviewModes = isCreditCard ? ['account', 'all'] : Object.keys(previewModes)
  const categoryIdFor = (transaction) =>
    categoryOverrides[transaction.fitid] ?? suggestCategoryId(transaction, categoryRules)
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]))
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR')
  const displayedTransactions = transactionsForMode.filter(
    (transaction) =>
      (cardFilter === 'all' || transaction.cardLastFour === cardFilter) &&
      `${transaction.description} ${transaction.memo ?? ''} ${transaction.rawType}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedSearch),
  )
  const installmentCount = analysis?.importable.filter(
    (transaction) => transaction.installmentTotal,
  ).length ?? 0
  const invoiceTotal = parsedOfx?.invoice?.reportedTotal ?? Math.abs(analysis?.summary.net ?? 0)

  return (
    <main className="app-page">
      <div className="page-container">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-eyebrow"><FileUp aria-hidden="true" size={14} />Central de importação</p>
            <h1 className="page-title">Importar {isCreditCard ? 'fatura CSV' : 'extrato OFX'}</h1>
            <p className="page-description">Confira os lançamentos, cartões e categorias com segurança antes de salvar.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800"><LockKeyhole aria-hidden="true" size={14} />Processamento privado</span>
        </header>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet aria-hidden="true" size={19} /></span>
            <div><h2 className="section-title">Selecione a origem</h2><p className="section-description">Escolha a conta correta e envie o arquivo exportado pelo banco.</p></div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Conta e origem de importação</span>
              <select
                className="form-control mt-2"
                disabled={isLoadingAccounts || Boolean(accountsError) || accounts.length === 0}
                onChange={(event) => {
                  setSelectedAccountId(event.target.value)
                  setSelectedFileName('')
                  setParsedOfx(null)
                  setParseError('')
                  setImportError('')
                  setImportResult(null)
                  setPreviewMode('account')
                  setSearchTerm('')
                  setCardLabels({})
                  setCardFilter('all')
                  setCategoryOverrides({})
                  setRuleFeedback('')
                  setFileInputKey((currentKey) => currentKey + 1)
                }}
                value={selectedAccountId}
              >
                {isLoadingAccounts && <option>Carregando contas…</option>}
                {!isLoadingAccounts && accounts.length === 0 && <option>Nenhuma conta encontrada</option>}
                {[...accountsByBank.entries()].map(([bank, bankAccounts]) => (
                  <optgroup key={bank} label={bank.toLocaleUpperCase('pt-BR')}>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {accountTypeLabel[account.type] ?? account.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {accountsError && <p className="mt-2 text-sm text-rose-700">{accountsError}</p>}
            </label>

            <div>
              <span className="text-sm font-semibold text-slate-800">{fileTypeLabel}</span>
              <label className="group mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/45 px-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
                <span className="mb-2 grid size-10 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm transition group-hover:-translate-y-0.5"><UploadCloud aria-hidden="true" size={20} /></span>
                <span className="text-sm font-semibold text-slate-800">
                  {selectedFileName || `Escolher ${fileTypeLabel.toLowerCase()}`}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  {isCreditCard ? 'Fatura Bradesco em CSV · máximo de 5 MB' : 'Extrato Bradesco em OFX · máximo de 5 MB'}
                </span>
                <input
                  accept={fileAccept}
                  className="sr-only"
                  key={fileInputKey}
                  onChange={handleFileChange}
                  type="file"
                />
              </label>
            </div>
          </div>

          {isParsing && <p className="mt-5 text-sm text-slate-600">Lendo e normalizando o extrato…</p>}
          {parseError && <p className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{parseError}</p>}
        </section>

        {parsedOfx && analysis && (
          <section className="surface-card mt-5 overflow-hidden">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    Análise completa {isCreditCard ? 'da fatura' : 'do extrato'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {analysis.all.length} lançamento(s) dentro do período do arquivo
                    {parsedOfx.periodStart && parsedOfx.periodEnd
                      ? ` · ${formatDate(parsedOfx.periodStart)} a ${formatDate(parsedOfx.periodEnd)}`
                      : ''}
                  </p>
                  {isCreditCard && parsedOfx.invoice?.status && (
                    <span
                      className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        parsedOfx.invoice.status === 'ABERTA'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Fatura {parsedOfx.invoice.status.toLocaleLowerCase('pt-BR')}
                    </span>
                  )}
                </div>
                {selectedAccount && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                      {selectedAccount.name}
                    </span>
                    <button
                      className="primary-button"
                      disabled={isImporting || analysis.importable.length === 0 || Boolean(importResult)}
                      onClick={handleImport}
                      type="button"
                    >
                      {isImporting
                        ? 'Importando…'
                        : <><CheckCircle2 aria-hidden="true" size={16} />Confirmar {analysis.importable.length} lançamento(s)</>}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label={isCreditCard ? 'Estornos/créditos' : 'Entradas da conta'}
                  value={absoluteCurrencyFormatter.format(analysis.summary.inflows)}
                />
                <SummaryCard
                  label={isCreditCard ? 'Compras' : 'Saídas da conta'}
                  value={absoluteCurrencyFormatter.format(analysis.summary.outflows)}
                />
                <SummaryCard
                  label={isCreditCard ? 'Total da fatura' : 'Resultado do período'}
                  value={
                    isCreditCard
                      ? absoluteCurrencyFormatter.format(invoiceTotal)
                      : currencyFormatter.format(analysis.summary.net)
                  }
                />
                <SummaryCard
                  label={isCreditCard ? 'Compras parceladas' : 'PIX identificados'}
                  value={String(isCreditCard ? installmentCount : analysis.summary.pixCount)}
                />
              </div>

              {isCreditCard && parsedOfx.invoice && (
                <p
                  className={`mt-4 rounded-lg p-3 text-sm ${
                    parsedOfx.invoice.reconciled
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'bg-rose-50 text-rose-800'
                  }`}
                >
                  {parsedOfx.invoice.reconciled
                    ? 'Conferência concluída: compras menos estornos corresponde ao total informado pelo banco.'
                    : 'Atenção: a soma dos lançamentos não corresponde ao total informado pelo banco. Revise o arquivo antes de importar.'}
                </p>
              )}

              {isCreditCard && parsedOfx.cards?.length > 0 && (
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Cartões identificados na fatura</p>
                  <p className="mt-1 text-sm text-slate-600">
                    O primeiro bloco do arquivo é tratado como titular e os demais como adicionais. Você pode corrigir os nomes antes de importar.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {parsedOfx.cards.map((card) => (
                      <label className="rounded-lg border border-slate-200 bg-white p-3" key={card.lastFour}>
                        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          {cardRoleLabel[card.role] ?? 'Cartão'} · final {card.lastFour} ·{' '}
                          {card.transactionCount} lançamento(s)
                        </span>
                        <input
                          className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                          onChange={(event) =>
                            setCardLabels((currentLabels) => ({
                              ...currentLabels,
                              [card.lastFour]: event.target.value,
                            }))
                          }
                          value={
                            cardLabels[card.lastFour] ?? defaultCardLabel(card.lastFour, card.role)
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {!isCreditCard && (
                <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  {analysis.investments.length} movimentação(ões) de investimento estão visíveis na aba
                  “Investimentos”, mas ficarão fora desta importação da Fase 1.
                </p>
              )}

              {parsedOfx.warnings.length > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  {parsedOfx.warnings.length} lançamento(s) não puderam ser lidos e não aparecerão na
                  importação.
                </p>
              )}

              {analysis.outsidePeriod.length > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  {analysis.outsidePeriod.length} lançamento(s) com data fora do período declarado pelo
                  banco foram ignorados nesta importação. Eles não afetam os totais deste mês.
                </p>
              )}

              {ruleFeedback && <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{ruleFeedback}</p>}
              {importError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{importError}</p>}
              {importResult && (
                <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  Importação concluída: {importResult.rows_imported} lançamento(s) novo(s) e{' '}
                  {importResult.rows_skipped} duplicado(s) ignorado(s).
                  {!isCreditCard && ' Investimentos não foram enviados ao banco.'}
                </p>
              )}
            </div>

            <div className="border-b border-slate-200 px-5 pt-4 sm:px-6">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de lançamento">
                {availablePreviewModes.map((mode) => {
                  const count = getTransactionsForPreviewMode(analysis, mode).length
                  const isSelected = previewMode === mode

                  return (
                    <button
                      aria-selected={isSelected}
                      className={`rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                      key={mode}
                      onClick={() => setPreviewMode(mode)}
                      role="tab"
                      type="button"
                    >
                      {previewModeLabels[mode]} ({count})
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:px-6">
              <p className="text-sm text-slate-600">
                {displayedTransactions.length} lançamento(s) exibido(s) em “{previewModeLabels[previewMode]}”.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                {isCreditCard && parsedOfx.cards?.length > 1 && (
                  <label className="w-full sm:max-w-xs">
                    <span className="sr-only">Filtrar por cartão</span>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      onChange={(event) => setCardFilter(event.target.value)}
                      value={cardFilter}
                    >
                      <option value="all">Todos os cartões</option>
                      {parsedOfx.cards.map((card) => (
                        <option key={card.lastFour} value={card.lastFour}>
                          {cardLabels[card.lastFour] ?? defaultCardLabel(card.lastFour, card.role)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="w-full sm:max-w-xs">
                  <span className="sr-only">Buscar lançamento</span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por descrição"
                    type="search"
                    value={searchTerm}
                  />
                </label>
              </div>
            </div>

            {displayedTransactions.length > 0 ? (
              <div className="max-h-[38rem] overflow-auto">
                <table className="data-table min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="sticky top-0 bg-[#f8faf9] text-[10px] tracking-[0.1em] text-slate-400 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Data</th>
                      {isCreditCard && <th className="px-5 py-3 font-semibold">Cartão</th>}
                      <th className="px-5 py-3 font-semibold">Descrição</th>
                      <th className="px-5 py-3 font-semibold">Tipo</th>
                      <th className="px-5 py-3 font-semibold">Categoria</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedTransactions.map((transaction) => (
                      <tr key={transaction.fitid}>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatDate(transaction.date)}
                        </td>
                        {isCreditCard && (
                          <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                            {transaction.cardLastFour
                              ? cardLabels[transaction.cardLastFour] ?? defaultCardLabel(transaction.cardLastFour)
                              : 'Não identificado'}
                          </td>
                        )}
                        <td className="max-w-sm px-5 py-4 font-medium text-slate-900">
                          {transaction.description}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {transaction.installmentTotal
                            ? `Compra parcelada · ${transaction.installmentCurrent} de ${transaction.installmentTotal}`
                            : transactionTypeLabel[transaction.rawType] ?? transaction.rawType}
                        </td>
                        <td className="min-w-52 px-5 py-3">
                          {transaction.isInvestment ? (
                            <span className="text-sm text-slate-500">Fora da Fase 1</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <select
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                                onChange={(event) =>
                                  setCategoryOverrides((currentOverrides) => ({
                                    ...currentOverrides,
                                    [transaction.fitid]: event.target.value,
                                  }))
                                }
                                value={categoryIdFor(transaction) ?? ''}
                              >
                                <option value="">Sem categoria</option>
                                {categories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name} · {category.kind === 'income' ? 'receita' : category.kind === 'transfer' ? 'transferência' : 'despesa'}
                                  </option>
                                ))}
                              </select>
                              {categoryIdFor(transaction) && (
                                <button
                                  className="w-fit text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                                  onClick={() => handleRememberCategory(transaction)}
                                  type="button"
                                >
                                  Memorizar “{categoryNameById.get(categoryIdFor(transaction))}”
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              transaction.isInvestment
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {transaction.isInvestment ? 'Fora da Fase 1' : 'Será importado'}
                          </span>
                        </td>
                        <td
                          className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${
                            transaction.amount < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {currencyFormatter.format(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-sm text-slate-600">Nenhum lançamento corresponde à sua busca.</p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  )
}
