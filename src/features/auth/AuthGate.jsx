import { useEffect, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase.js'

export function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [isChecking, setIsChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [accessError, setAccessError] = useState('')

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
      }

      setIsChecking(false)
    }

    supabase.auth.getSession().then(({ data }) => verifySession(data.session))
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
    return <LoginPage initialError={accessError} />
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

function LoginPage({ initialError }) {
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
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-[0.18em] text-emerald-700 uppercase">
          Acesso pessoal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Controle Financeiro</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Entre com seu acesso. Na primeira vez, use “Criar primeiro acesso”; esse usuário se torna o único proprietário dos dados.
        </p>

        <label className="mt-6 block">
          <span className="text-sm font-semibold text-slate-800">E-mail</span>
          <input
            autoComplete="email"
            className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-800">Senha</span>
          <input
            autoComplete="current-password"
            className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-950 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {feedback && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{feedback}</p>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-slate-400"
            disabled={isSubmitting}
            onClick={() => submit('signin')}
            type="button"
          >
            {isSubmitting ? 'Validando…' : 'Entrar'}
          </button>
          <button
            className="rounded-xl border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:border-slate-300 disabled:text-slate-400"
            disabled={isSubmitting}
            onClick={() => submit('signup')}
            type="button"
          >
            Criar primeiro acesso
          </button>
        </div>
      </section>
    </main>
  )
}

function AuthStatus({ actionLabel, onAction, text }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
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
