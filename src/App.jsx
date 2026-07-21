import { useState } from 'react'
import {
  ChartNoAxesCombined,
  FileUp,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { PwaControls } from './components/PwaControls.jsx'
import { DashboardPage } from './features/dashboard/DashboardPage.jsx'
import { ImportPage } from './features/import/ImportPage.jsx'
import { InsightsPage } from './features/insights/InsightsPage.jsx'
import { TransactionsPage } from './features/transactions/TransactionsPage.jsx'

const navigation = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
  { id: 'import', label: 'Importar', icon: FileUp },
  { id: 'transactions', label: 'Lançamentos', shortLabel: 'Extrato', icon: ReceiptText },
  { id: 'insights', label: 'Insights', icon: Sparkles },
]

function App({ email, onSignOut }) {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />

        <div className="mt-10">
          <p className="sidebar-label">Visão geral</p>
          <nav aria-label="Navegação principal" className="mt-3 space-y-1.5">
            {navigation.map((item) => (
              <NavigationButton
                active={page === item.id}
                icon={item.icon}
                key={item.id}
                onClick={() => setPage(item.id)}
              >
                {item.label}
              </NavigationButton>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="mb-3 rounded-2xl border border-white/8 bg-white/5 p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-400/12 text-emerald-300">
                <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Ambiente protegido</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">Seus dados financeiros são pessoais e privados.</p>
              </div>
            </div>
          </div>
          <PwaControls variant="sidebar" />
          <button className="sidebar-user" onClick={onSignOut} title={email} type="button">
            <span className="user-avatar">{email?.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] text-slate-400">Conta pessoal</span>
              <span className="block truncate text-xs font-medium text-slate-200">{email}</span>
            </span>
            <LogOut aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand compact />
        <PwaControls />
      </header>

      <div className="app-content">
        {page === 'dashboard' ? (
          <DashboardPage onImport={() => setPage('import')} />
        ) : page === 'transactions' ? (
          <TransactionsPage />
        ) : page === 'insights' ? (
          <InsightsPage />
        ) : (
          <ImportPage />
        )}
      </div>

      <nav aria-label="Navegação principal" className="mobile-navigation">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = page === item.id

          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`mobile-nav-item ${isActive ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => setPage(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              <span>{item.shortLabel ?? item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Brand({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
      <span className={`${compact ? 'size-9 rounded-xl' : 'size-11 rounded-2xl'} brand-mark`}>
        <WalletCards aria-hidden="true" size={compact ? 20 : 23} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className={`block font-bold tracking-[-0.03em] ${compact ? 'text-[15px] text-slate-950' : 'text-base text-white'}`}>
          Meu Financeiro
        </span>
        {!compact && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium tracking-[0.14em] text-emerald-300/80 uppercase">
            <ChartNoAxesCombined aria-hidden="true" size={11} />
            Organização pessoal
          </span>
        )}
      </span>
    </div>
  )
}

function NavigationButton({ active, children, icon: Icon, onClick }) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`sidebar-nav-item ${active ? 'is-active' : ''}`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={19} strokeWidth={active ? 2.2 : 1.8} />
      <span>{children}</span>
    </button>
  )
}

export default App
