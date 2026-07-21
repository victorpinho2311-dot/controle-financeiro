import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, ReceiptText, Search, SlidersHorizontal } from 'lucide-react'
import { getSupabaseClient } from '../../lib/supabase.js'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  signDisplay: 'always',
})

const currentMonth = () => new Date().toISOString().slice(0, 7)

const getMonthBounds = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const paddedMonth = String(monthNumber).padStart(2, '0')
  const lastDay = new Date(year, monthNumber, 0).getDate()

  return {
    start: `${year}-${paddedMonth}-01`,
    end: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

const formatDate = (date) => date.split('-').reverse().join('/')

export function TransactionsPage() {
  const [accounts, setAccounts] = useState([])
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [month, setMonth] = useState(currentMonth)
  const [accountId, setAccountId] = useState('')
  const [cardId, setCardId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingValues, setEditingValues] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    const loadMetadata = async () => {
      try {
        const [accountsResult, cardsResult, categoriesResult] = await Promise.all([
          getSupabaseClient().from('accounts').select('id, name').order('name'),
          getSupabaseClient().from('cards').select('id, account_id, label, last_four').order('label'),
          getSupabaseClient().from('categories').select('id, name, kind').order('kind').order('name'),
        ])

        if (accountsResult.error || cardsResult.error || categoriesResult.error) {
          throw accountsResult.error ?? cardsResult.error ?? categoriesResult.error
        }

        if (isCurrent) {
          setAccounts(accountsResult.data)
          setCards(cardsResult.data)
          setCategories(categoriesResult.data)
        }
      } catch (error) {
        if (isCurrent) {
          setMessage(error.message ?? 'Não foi possível carregar os filtros.')
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
      setMessage('')

      try {
        const { start, end } = getMonthBounds(month)
        let query = getSupabaseClient()
          .from('transactions')
          .select('id, account_id, card_id, category_id, date, amount, description, memo, raw_type')
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

        if (categoryId) {
          query = query.eq('category_id', categoryId)
        }

        const { data, error } = await query

        if (error) {
          throw error
        }

        if (isCurrent) {
          setTransactions(data)
        }
      } catch (error) {
        if (isCurrent) {
          setMessage(error.message ?? 'Não foi possível carregar os lançamentos.')
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
  }, [month, accountId, cardId, categoryId])

  const cardsForSelectedAccount = cards.filter((card) => !accountId || card.account_id === accountId)
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const cardNameById = new Map(cards.map((card) => [card.id, card.label]))
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR')
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        `${transaction.description} ${transaction.memo ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
      ),
    [transactions, normalizedSearch],
  )
  const filteredTotal = filteredTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount),
    0,
  )

  const updateTransaction = async (id, changes, successMessage) => {
    setIsSaving(true)
    setMessage('')

    try {
      const { data, error } = await getSupabaseClient()
        .from('transactions')
        .update(changes)
        .eq('id', id)
        .select('id, account_id, card_id, category_id, date, amount, description, memo, raw_type')
        .single()

      if (error) {
        throw error
      }

      setTransactions((currentTransactions) =>
        currentTransactions.map((transaction) => (transaction.id === id ? data : transaction)),
      )
      setMessage(successMessage)
      return true
    } catch (error) {
      setMessage(error.message ?? 'Não foi possível salvar a alteração.')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (transaction) => {
    setPendingDeleteId('')
    setEditingId(transaction.id)
    setEditingValues({
      date: transaction.date,
      description: transaction.description,
      amount: String(transaction.amount),
      category_id: transaction.category_id ?? '',
    })
  }

  const handleSaveEdit = async () => {
    const amount = Number(editingValues.amount)

    if (!editingValues.description.trim() || !Number.isFinite(amount)) {
      setMessage('Informe uma descrição e um valor válido.')
      return
    }

    const wasSaved = await updateTransaction(
      editingId,
      {
        date: editingValues.date,
        description: editingValues.description.trim(),
        amount,
        category_id: editingValues.category_id || null,
      },
      'Lançamento atualizado.',
    )

    if (wasSaved) {
      setEditingId('')
      setEditingValues(null)
    }
  }

  const handleDelete = async (id) => {
    setIsSaving(true)
    setMessage('')

    try {
      const { error } = await getSupabaseClient().from('transactions').delete().eq('id', id)

      if (error) {
        throw error
      }

      setTransactions((currentTransactions) => currentTransactions.filter((transaction) => transaction.id !== id))
      setPendingDeleteId('')
      setEditingId('')
      setEditingValues(null)
      setMessage('Lançamento excluído.')
    } catch (error) {
      setMessage(error.message ?? 'Não foi possível excluir o lançamento.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="app-page">
      <div className="page-container">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-eyebrow"><ReceiptText aria-hidden="true" size={14} />Histórico financeiro</p>
            <h1 className="page-title">Seus lançamentos</h1>
            <p className="page-description">Encontre, categorize e corrija cada movimentação em um só lugar.</p>
          </div>
          <div className="flex w-fit items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><CircleDollarSign aria-hidden="true" size={18} /></span>
            <div><p className="text-[10px] font-bold tracking-wider text-emerald-700 uppercase">Saldo filtrado</p><p className={`mt-0.5 text-sm font-bold ${filteredTotal < 0 ? 'text-rose-600' : 'text-emerald-800'}`}>{currencyFormatter.format(filteredTotal)}</p></div>
          </div>
        </header>

        <section className="surface-card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-700"><SlidersHorizontal aria-hidden="true" className="text-emerald-700" size={16} />Filtros de busca</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterLabel label="Mês">
            <input className="filter-input" onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
          </FilterLabel>
          <FilterLabel label="Conta">
            <select
              className="filter-input"
              onChange={(event) => {
                setAccountId(event.target.value)
                setCardId('')
              }}
              value={accountId}
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </FilterLabel>
          <FilterLabel label="Cartão">
            <select className="filter-input" disabled={cardsForSelectedAccount.length === 0} onChange={(event) => setCardId(event.target.value)} value={cardId}>
              <option value="">Todos os cartões</option>
              {cardsForSelectedAccount.map((card) => <option key={card.id} value={card.id}>{card.label} · final {card.last_four}</option>)}
            </select>
          </FilterLabel>
          <FilterLabel label="Categoria">
            <select className="filter-input" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
              <option value="">Todas as categorias</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </FilterLabel>
          <FilterLabel label="Buscar">
            <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={15} /><input className="filter-input pl-9!" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Descrição" type="search" value={searchTerm} /></div>
          </FilterLabel>
          </div>
        </section>

        {message && <p className="mt-5 rounded-xl bg-sky-50 p-4 text-sm text-sky-900">{message}</p>}

        <section className="surface-card mt-5 overflow-hidden">
          <div className="flex items-start gap-3 border-b border-[#e5ece8] p-5 sm:p-6">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText aria-hidden="true" size={18} /></span>
            <div><h2 className="section-title">Resultados</h2><p className="section-description">{filteredTransactions.length} lançamento(s) encontrado(s).</p></div>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-slate-600">Carregando lançamentos…</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">Nenhum lançamento encontrado para os filtros escolhidos.</p>
          ) : (
            <div className="max-h-[42rem] overflow-auto">
              <table className="data-table min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="sticky top-0 bg-[#f8faf9] text-[10px] tracking-[0.1em] text-slate-400 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Data</th>
                    <th className="px-5 py-3 font-semibold">Lançamento</th>
                    <th className="px-5 py-3 font-semibold">Categoria</th>
                    <th className="px-5 py-3 text-right font-semibold">Valor</th>
                    <th className="px-5 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((transaction) => (
                    <TransactionRow
                      accountName={accountNameById.get(transaction.account_id)}
                      cardName={cardNameById.get(transaction.card_id)}
                      categories={categories}
                      editingValues={editingId === transaction.id ? editingValues : null}
                      isDeleting={pendingDeleteId === transaction.id}
                      isSaving={isSaving}
                      key={transaction.id}
                      onCategoryChange={(newCategoryId) =>
                        updateTransaction(transaction.id, { category_id: newCategoryId || null }, 'Categoria atualizada.')
                      }
                      onCancelDelete={() => setPendingDeleteId('')}
                      onCancelEdit={() => {
                        setEditingId('')
                        setEditingValues(null)
                      }}
                      onChangeEdit={(field, value) => setEditingValues((current) => ({ ...current, [field]: value }))}
                      onConfirmDelete={() => handleDelete(transaction.id)}
                      onEdit={() => handleEdit(transaction)}
                      onRequestDelete={() => {
                        setEditingId('')
                        setEditingValues(null)
                        setPendingDeleteId(transaction.id)
                      }}
                      onSaveEdit={handleSaveEdit}
                      transaction={transaction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function FilterLabel({ label, children }) {
  return (
    <label>
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <span className="mt-1.5 block [&_.filter-input]:block [&_.filter-input]:w-full [&_.filter-input]:rounded-lg [&_.filter-input]:border [&_.filter-input]:border-slate-300 [&_.filter-input]:bg-white [&_.filter-input]:px-3 [&_.filter-input]:py-2 [&_.filter-input]:text-sm [&_.filter-input]:text-slate-950 [&_.filter-input]:outline-none [&_.filter-input:focus]:border-emerald-600 [&_.filter-input:focus]:ring-4 [&_.filter-input:focus]:ring-emerald-100">
        {children}
      </span>
    </label>
  )
}

function TransactionRow({
  accountName,
  cardName,
  categories,
  editingValues,
  isDeleting,
  isSaving,
  onCancelDelete,
  onCancelEdit,
  onCategoryChange,
  onChangeEdit,
  onConfirmDelete,
  onEdit,
  onRequestDelete,
  onSaveEdit,
  transaction,
}) {
  if (editingValues) {
    return (
      <tr className="bg-emerald-50/40">
        <td className="px-5 py-4"><input className="edit-input" onChange={(event) => onChangeEdit('date', event.target.value)} type="date" value={editingValues.date} /></td>
        <td className="px-5 py-4"><input className="edit-input" onChange={(event) => onChangeEdit('description', event.target.value)} value={editingValues.description} /></td>
        <td className="px-5 py-4"><CategorySelect categories={categories} onChange={(value) => onChangeEdit('category_id', value)} value={editingValues.category_id} /></td>
        <td className="px-5 py-4"><input className="edit-input w-28 text-right" onChange={(event) => onChangeEdit('amount', event.target.value)} step="0.01" type="number" value={editingValues.amount} /></td>
        <td className="whitespace-nowrap px-5 py-4 text-right">
          <button className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 disabled:text-slate-400" disabled={isSaving} onClick={onSaveEdit} type="button">Salvar</button>
          <button className="ml-3 text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={onCancelEdit} type="button">Cancelar</button>
        </td>
      </tr>
    )
  }

  if (isDeleting) {
    return (
      <tr className="bg-rose-50">
        <td className="px-5 py-4 text-sm font-medium text-rose-900" colSpan="5">
          Excluir “{transaction.description}”? Esta ação não pode ser desfeita.
          <button className="ml-4 text-sm font-bold text-rose-700 hover:text-rose-900 disabled:text-slate-400" disabled={isSaving} onClick={onConfirmDelete} type="button">Excluir</button>
          <button className="ml-3 text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={onCancelDelete} type="button">Cancelar</button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(transaction.date)}</td>
      <td className="px-5 py-4">
        <p className="font-medium text-slate-900">{transaction.description}</p>
        <p className="mt-1 text-xs text-slate-500">{cardName ?? accountName}</p>
      </td>
      <td className="min-w-48 px-5 py-4"><CategorySelect categories={categories} onChange={onCategoryChange} value={transaction.category_id ?? ''} /></td>
      <td className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${Number(transaction.amount) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{currencyFormatter.format(Number(transaction.amount))}</td>
      <td className="whitespace-nowrap px-5 py-4 text-right">
        <button className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" onClick={onEdit} type="button">Editar</button>
        <button className="ml-3 text-sm font-semibold text-rose-700 hover:text-rose-900" onClick={onRequestDelete} type="button">Excluir</button>
      </td>
    </tr>
  )
}

function CategorySelect({ categories, onChange, value }) {
  return (
    <select className="edit-input" onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Sem categoria</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select>
  )
}
