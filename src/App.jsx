import { useState } from 'react'
import { PwaControls } from './components/PwaControls.jsx'
import { DashboardPage } from './features/dashboard/DashboardPage.jsx'
import { ImportPage } from './features/import/ImportPage.jsx'
import { InsightsPage } from './features/insights/InsightsPage.jsx'
import { TransactionsPage } from './features/transactions/TransactionsPage.jsx'

function App({ email, onSignOut }) {
  const [page, setPage] = useState('dashboard')

  return (
    <>
      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-950">Controle Financeiro</p>
            <PwaControls />
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            <NavigationButton active={page === 'dashboard'} onClick={() => setPage('dashboard')}>
              Dashboard
            </NavigationButton>
            <NavigationButton active={page === 'import'} onClick={() => setPage('import')}>
              Importar
            </NavigationButton>
            <NavigationButton active={page === 'transactions'} onClick={() => setPage('transactions')}>
              Lançamentos
            </NavigationButton>
            <NavigationButton active={page === 'insights'} onClick={() => setPage('insights')}>
              Insights
            </NavigationButton>
            <button
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
              onClick={onSignOut}
              title={email}
              type="button"
            >
              Sair
            </button>
          </div>
        </div>
      </nav>
      {page === 'dashboard' ? (
        <DashboardPage onImport={() => setPage('import')} />
      ) : page === 'transactions' ? (
        <TransactionsPage />
      ) : page === 'insights' ? (
        <InsightsPage />
      ) : (
        <ImportPage />
      )}
    </>
  )
}

function NavigationButton({ active, children, onClick }) {
  return (
    <button
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export default App
