import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, ChartNoAxesCombined, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase.js'

export function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [isChecking, setIsChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [ownerExists, setOwnerExists] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAccessError('O Supabase ainda não está configurado neste ambiente.')
      setIsChecking(false)
      return undefined
    }

    const supabase = getSupabaseClient()
    let isCurrent = true

    const verifySession = async (nextSession) => {
      if (!isCurrent) return

      setSession(nextSession)
      setHasAccess(false)
      setAccessError('')

      if (!nextSession) {
        setIsChecking(false)
        return
      }

      setIsChecking(true)
      const { data, error } = await supabase.rpc('claim_app_owner')

      if (!isCurrent) return

      if (error) {
        setAccessError(error.message ?? 'Não foi possível validar o proprietário do aplicativo.')
      } else if (!data) {
        setAccessError('Este acesso não é o proprietário autorizado deste aplicativo.')
      } else {
        setHasAccess(true)
        setOwnerExists(true)
      }

      setIsChecking(false)
    }

    Promise.all([supabase.auth.getSession(), supabase.rpc('app_owner_exists')]).then(
      ([{ data: sessionData }, ownerResult]) => {
        if (isCurrent) {
          setOwnerExists(Boolean(ownerResult.data))
        }
        verifySession(sessionData.session)
      },
    )
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => verifySession(nextSession), 0)
    })

    return () => {
      isCurrent = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (isChecking) {
    return <AuthStatus text="Protegendo seus dados…" />
  }

  if (!session) {
    return <LoginPage canCreateOwner={ownerExists === false} initialError={accessError} />
  }

  if (!hasAccess) {
    return (
      <AuthStatus
        actionLabel="Sair deste acesso"
        onAction={() => getSupabaseClient().auth.signOut()}
        text={accessError || 'Este usuário não tem acesso ao Controle Financeiro.'}
      />
    )
  }

  return children({
    email: session.user.email,
    signOut: () => getSupabaseClient().auth.signOut(),
  })
}

function LoginPage({ canCreateOwner, initialError }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState(initialError)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (mode) => {
    setFeedback('')

    if (!email.trim() || password.length < 6) {
      setFeedback('Informe seu e-mail e uma senha com pelo menos 6 caracteres.')
      return
    }

    setIsSubmitting(true)
    const supabase = getSupabaseClient()
    const credentials = { email: email.trim(), password }
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword(credentials)

    if (result.error) {
      setFeedback(result.error.message)
    } else if (mode === 'signup' && !result.data.session) {
      setFeedback('Conta criada. Abra o e-mail de confirmação e depois volte para entrar.')
    }

    setIsSubmitting(false)
  }

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#eef4f0] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute -top-52 -right-52 size-[34rem] rounded-full border-[80px] border-emerald-800/[0.025]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.8rem] border border-white/60 bg-white shadow-[0_35px_90px_rgba(16,53,40,0.14)] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden min-h-[39rem] overflow-hidden bg-[#10271f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full border-[42px] border-emerald-300/[0.055]" />
          <div className="pointer-events-none absolute -bottom-28 -left-28 size-80 rounded-full bg-emerald-400/[0.055] blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="brand-mark grid size-11 place-items-center rounded-2xl"><WalletCards aria-hidden="true" size={23} /></span>
            <div><p className="font-bold tracking-[-0.025em]">Meu Financeiro</p><p className="mt-0.5 text-[10px] font-semibold tracking-[0.15em] text-emerald-300/75 uppercase">Organização pessoal</p></div>
          </div>
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1.5 text-[11px] font-semibold text-emerald-200"><ChartNoAxesCombined aria-hidden="true" size={14} />Sua vida financeira, mais clara</span>
            <h2 className="mt-5 max-w-sm text-[2.55rem] font-bold leading-[1.08] tracking-[-0.05em]">Decisões melhores começam com uma visão simples.</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-emerald-50/55">Centralize extratos, faturas e categorias em um espaço seguro feito para você.</p>
          </div>
          <div className="relative flex items-center gap-3 border-t border-white/10 pt-6 text-xs text-emerald-50/60"><ShieldCheck aria-hidden="true" className="text-emerald-300" size={19} /><span>Ambiente privado com acesso exclusivo do proprietário.</span></div>
        </section>

        <section className="p-6 sm:p-10 lg:flex lg:flex-col lg:justify-center lg:px-14">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="brand-mark grid size-10 place-items-center rounded-xl"><WalletCards aria-hidden="true" size={21} /></span>
            <div><p className="font-bold tracking-tight text-slate-950">Meu Financeiro</p><p className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">Acesso protegido</p></div>
          </div>
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><LockKeyhole aria-hidden="true" size={21} /></span>
          <p className="mt-5 text-[11px] font-bold tracking-[0.16em] text-emerald-700 uppercase">Bem-vindo de volta</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-slate-950">Acesse sua conta</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
          {canCreateOwner
            ? 'Na primeira vez, use “Criar primeiro acesso”; esse usuário se torna o único proprietário dos dados.'
            : 'Entre com o acesso pessoal já confirmado para consultar seus dados.'}
          </p>

          <label className="mt-7 block">
          <span className="text-xs font-bold text-slate-700">E-mail</span>
          <input
            autoComplete="email"
            className="form-control mt-2 min-h-12!"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            type="email"
            value={email}
          />
          </label>
          <label className="mt-4 block">
          <span className="text-xs font-bold text-slate-700">Senha</span>
          <input
            autoComplete="current-password"
            className="form-control mt-2 min-h-12!"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            type="password"
            value={password}
          />
          </label>

          {feedback && <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>}

          <div className={`mt-6 grid gap-3 ${canCreateOwner ? 'sm:grid-cols-2' : ''}`}>
          <button
            className="primary-button min-h-12 w-full"
            disabled={isSubmitting}
            onClick={() => submit('signin')}
            type="button"
          >
            {isSubmitting ? 'Validando…' : <>Entrar com segurança <ArrowRight aria-hidden="true" size={17} /></>}
          </button>
          {canCreateOwner && (
            <button
              className="min-h-12 rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:border-slate-300 disabled:text-slate-400"
              disabled={isSubmitting}
              onClick={() => submit('signup')}
              type="button"
            >
              Criar primeiro acesso
            </button>
          )}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[11px] leading-5 text-slate-400"><BadgeCheck aria-hidden="true" className="shrink-0 text-emerald-600" size={16} />Seus dados são protegidos e acessíveis somente por você.</p>
        </section>
      </div>
    </main>
  )
}

function AuthStatus({ actionLabel, onAction, text }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#eef4f0] px-4">
      <section className="surface-card max-w-md p-7 text-center">
        <span className="mx-auto mb-4 grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck aria-hidden="true" size={22} /></span>
        <p className="text-sm font-semibold text-slate-800">{text}</p>
        {onAction && (
          <button
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  )
}
