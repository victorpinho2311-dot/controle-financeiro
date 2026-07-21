import { useEffect, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'

const isRunningStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export function PwaControls({ variant = 'default' }) {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [isStandalone, setIsStandalone] = useState(isRunningStandalone)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
      setShowHelp(false)
    }
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowHelp(true)
      return
    }

    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <>
      {!isStandalone && (
        <button
          className={variant === 'sidebar'
            ? 'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-emerald-200'
            : 'inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100'}
          onClick={handleInstall}
          type="button"
        >
          <Download aria-hidden="true" size={15} />Instalar app
        </button>
      )}

      {!isOnline && (
        <div className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-xl lg:bottom-5" role="status">
          <WifiOff aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" size={18} />Você está offline. As telas e os dados já consultados continuam disponíveis; importações e alterações exigem conexão.
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center" role="presentation">
          <section aria-labelledby="install-title" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Aplicativo instalável</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950" id="install-title">Instalar Controle Financeiro</h2>
              </div>
              <button aria-label="Fechar instruções" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setShowHelp(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-700">
              <p><strong className="text-slate-950">iPhone ou iPad:</strong> abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.</p>
              <p><strong className="text-slate-950">Mac com Safari:</strong> abra o menu Arquivo e escolha “Adicionar ao Dock”.</p>
              <p><strong className="text-slate-950">Chrome no computador:</strong> use o ícone de instalação na barra de endereço ou o menu do navegador.</p>
            </div>
            <button className="primary-button mt-6 w-full" onClick={() => setShowHelp(false)} type="button">Entendi</button>
          </section>
        </div>
      )}
    </>
  )
}
