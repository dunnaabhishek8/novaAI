import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { motion, AnimatePresence } from 'motion/react'
import { AlertCircle, Calculator, Eye, EyeOff, FileText, Globe, Loader2, Lock, Mail, TrendingUp, User } from 'lucide-react'
import { authApi, errorText } from '../api'
import { APP_NAME, googleEnabled } from '../config'
import { setUserData } from '../redux/userSlice'
import Logo from '../components/Logo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const FEATURES = [
    { icon: FileText, title: 'Chat with your PDFs', text: 'Upload a document and ask anything about it.' },
    { icon: Globe, title: 'Live web search', text: 'Fresh answers pulled from the internet.' },
    { icon: TrendingUp, title: 'Stock lookups', text: 'Quick prices and quotes on demand.' },
    { icon: Calculator, title: 'Instant calculations', text: 'Maths done right, every time.' },
]

function passwordStrength(pw) {
    if (!pw) return { score: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' }
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' }
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-lime-400' }
    return { score: 4, label: 'Strong', color: 'bg-emerald-400' }
}

function Field({ icon: Icon, right, ...props }) {
    return (
        <div className="relative">
            <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
                {...props}
                className="w-full rounded-xl bg-white/[0.04] border border-white/10 pl-10 pr-11 py-3 text-sm text-white
                    placeholder:text-zinc-500 outline-none transition focus:border-violet-400/70 focus:bg-white/[0.06]
                    focus:ring-4 focus:ring-violet-500/10"
            />
            {right}
        </div>
    )
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.9z"/>
        </svg>
    )
}

export default function AuthPage() {
    const dispatch = useDispatch()
    const [mode, setMode] = useState('login') // 'login' | 'signup'
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState('') // '' | 'email' | 'google'

    const isSignup = mode === 'signup'
    const strength = passwordStrength(password)
    const busy = Boolean(loading)

    const switchMode = (next) => {
        if (next === mode || busy) return
        setMode(next)
        setError('')
    }

    // Mirrors the server's rules so people get instant feedback (the server re-checks everything).
    const validate = () => {
        if (isSignup && name.trim().length < 2) return 'Please enter your name.'
        if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.'
        if (!password) return 'Please enter your password.'
        if (isSignup && password.length < 8) return 'Password must be at least 8 characters.'
        if (isSignup && new TextEncoder().encode(password).length > 72) return 'Password is too long (max 72 characters).'
        return ''
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (busy) return
        const problem = validate()
        if (problem) return setError(problem)

        setError('')
        setLoading('email')
        try {
            const { data } = isSignup
                ? await authApi.post('/register', { name: name.trim(), email: email.trim(), password })
                : await authApi.post('/login', { email: email.trim(), password })
            dispatch(setUserData(data)) // App.jsx redirects to /chat
        } catch (err) {
            setError(errorText(err))
            setLoading('')
        }
    }

    const handleGoogle = async () => {
        if (busy) return
        setError('')
        setLoading('google')
        try {
            const { auth, provider } = await import('../firebase')
            const { signInWithPopup } = await import('firebase/auth')
            const result = await signInWithPopup(auth, provider)
            // The server verifies this token with Firebase; it never trusts a self-declared email.
            const idToken = await result.user.getIdToken()
            const { data } = await authApi.post('/google', { idToken })
            dispatch(setUserData(data))
        } catch (err) {
            const closed = err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request'
            if (!closed) {
                setError(err?.code?.startsWith?.('auth/') ? 'Google sign-in failed. Please try again.' : errorText(err))
            }
            setLoading('')
        }
    }

    return (
        <div className="relative min-h-full overflow-hidden bg-[#07070c] text-white">
            {/* ambient background */}
            <div className="pointer-events-none absolute inset-0">
                <div className="blob-a absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-violet-600/30 blur-[120px]" />
                <div className="blob-b absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full bg-cyan-500/20 blur-[130px]" />
                <div className="bg-grid absolute inset-0" />
            </div>

            <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-2 lg:px-8">
                {/* ---------- hero ---------- */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="hidden lg:block"
                >
                    <div className="mb-10 flex items-center gap-3">
                        <Logo size={44} />
                        <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
                    </div>

                    <h1 className="text-5xl font-bold leading-[1.1] tracking-tight">
                        Ask anything.<br />
                        <span className="gradient-text">Get answers that cite your own files.</span>
                    </h1>
                    <p className="mt-5 max-w-md text-lg text-zinc-400">
                        An assistant that reads your PDFs, searches the web and does the maths, all in one conversation.
                    </p>

                    <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
                        {FEATURES.map(({ icon: Icon, title, text }, i) => (
                            <motion.div
                                key={title}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 + i * 0.08 }}
                                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur"
                            >
                                <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                                    <Icon size={18} />
                                </div>
                                <p className="text-sm font-semibold">{title}</p>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{text}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* ---------- auth card ---------- */}
                <motion.section
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="mx-auto w-full max-w-md"
                >
                    <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
                        <Logo size={40} />
                        <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
                        <h2 className="text-2xl font-semibold tracking-tight">
                            {isSignup ? 'Create your account' : 'Welcome back'}
                        </h2>
                        <p className="mt-1.5 text-sm text-zinc-400">
                            {isSignup ? 'Start chatting in under a minute.' : 'Log in to pick up where you left off.'}
                        </p>

                        {/* tabs */}
                        <div className="relative mt-6 grid grid-cols-2 rounded-xl bg-black/40 p-1" role="tablist">
                            {[['login', 'Log in'], ['signup', 'Sign up']].map(([key, label]) => (
                                <button
                                    key={key}
                                    role="tab"
                                    aria-selected={mode === key}
                                    type="button"
                                    onClick={() => switchMode(key)}
                                    className={`relative z-10 rounded-lg py-2 text-sm font-medium transition-colors
                                        ${mode === key ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                                >
                                    {mode === key && (
                                        <motion.span
                                            layoutId="auth-tab"
                                            className="absolute inset-0 -z-10 rounded-lg bg-white/10"
                                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                                        />
                                    )}
                                    {label}
                                </button>
                            ))}
                        </div>

                        {googleEnabled && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleGoogle}
                                    disabled={busy}
                                    className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm
                                        font-semibold text-zinc-900 transition hover:bg-zinc-100 active:scale-[0.99] disabled:opacity-60"
                                >
                                    {loading === 'google' ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
                                    Continue with Google
                                </button>
                                <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
                                    <span className="h-px flex-1 bg-white/10" />
                                    or use your email
                                    <span className="h-px flex-1 bg-white/10" />
                                </div>
                            </>
                        )}

                        <form onSubmit={handleSubmit} noValidate className={`space-y-3.5 ${googleEnabled ? '' : 'mt-6'}`}>
                            <AnimatePresence initial={false}>
                                {isSignup && (
                                    <motion.div
                                        key="name"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <Field
                                            icon={User}
                                            type="text"
                                            name="name"
                                            autoComplete="name"
                                            placeholder="Full name"
                                            aria-label="Full name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            maxLength={60}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <Field
                                icon={Mail}
                                type="email"
                                name="email"
                                autoComplete="email"
                                placeholder="Email address"
                                aria-label="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />

                            <Field
                                icon={Lock}
                                type={showPw ? 'text' : 'password'}
                                name="password"
                                autoComplete={isSignup ? 'new-password' : 'current-password'}
                                placeholder="Password"
                                aria-label="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                right={
                                    <button
                                        type="button"
                                        onClick={() => setShowPw((s) => !s)}
                                        aria-label={showPw ? 'Hide password' : 'Show password'}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:text-zinc-200"
                                    >
                                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                }
                            />

                            {isSignup && password && (
                                <div className="flex items-center gap-3 px-1" aria-live="polite">
                                    <div className="flex flex-1 gap-1.5">
                                        {[1, 2, 3, 4].map((n) => (
                                            <span
                                                key={n}
                                                className={`h-1.5 flex-1 rounded-full transition-colors ${n <= strength.score ? strength.color : 'bg-white/10'}`}
                                            />
                                        ))}
                                    </div>
                                    <span className="w-14 text-right text-xs text-zinc-400">{strength.label}</span>
                                </div>
                            )}

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        role="alert"
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
                                    >
                                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                        <span>{error}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                type="submit"
                                disabled={busy}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500
                                    to-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition
                                    hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                            >
                                {loading === 'email' && <Loader2 size={17} className="animate-spin" />}
                                {isSignup ? 'Create account' : 'Log in'}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-sm text-zinc-400">
                            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                            <button
                                type="button"
                                onClick={() => switchMode(isSignup ? 'login' : 'signup')}
                                className="font-medium text-violet-300 hover:text-violet-200 hover:underline"
                            >
                                {isSignup ? 'Log in' : 'Sign up'}
                            </button>
                        </p>
                    </div>
                </motion.section>
            </div>
        </div>
    )
}
