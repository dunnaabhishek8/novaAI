import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'motion/react'
import {
    AlertCircle, Calculator, Check, Copy, FileText, Globe, LogOut, Menu,
    Paperclip, Plus, Send, Sparkles, Trash2, TrendingUp, UploadCloud, X,
} from 'lucide-react'
import { authApi, chatApi, errorText } from '../api'
import { APP_NAME } from '../config'
import { setUserData } from '../redux/userSlice'
import Logo from '../components/Logo'

const DAY = 24 * 60 * 60 * 1000
// Free hosting sleeps when idle; after this long we tell the user why the reply is slow.
const SLOW_AFTER_MS = 8000

const SUGGESTIONS = [
    { icon: FileText, title: 'Chat with a PDF', text: 'Upload a document, then ask about it', action: 'upload' },
    { icon: Globe, title: 'Search the web', text: 'What are the latest developments in AI?', prompt: 'What are the latest developments in AI?' },
    { icon: TrendingUp, title: 'Check a stock', text: "What's the current price of AAPL?", prompt: "What's the current price of AAPL?" },
    { icon: Calculator, title: 'Do some maths', text: 'What is 18% of 2,450?', prompt: 'What is 18% of 2,450?' },
]

function groupThreads(threads, now) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const t0 = start.getTime()
    const groups = [['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Older', []]]
    for (const t of threads) {
        const ts = new Date(t.lastMessageAt || t.updatedAt || t.createdAt).getTime()
        const i = ts >= t0 ? 0 : ts >= t0 - DAY ? 1 : ts >= t0 - 7 * DAY ? 2 : 3
        groups[i][1].push(t)
    }
    return groups.filter(([, list]) => list.length)
}

const mdComponents = {
    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200" />,
    p: (props) => <p {...props} className="mb-3 last:mb-0" />,
    ul: (props) => <ul {...props} className="mb-3 list-disc space-y-1 pl-5 marker:text-violet-400" />,
    ol: (props) => <ol {...props} className="mb-3 list-decimal space-y-1 pl-5 marker:text-violet-400" />,
    h1: (props) => <h3 {...props} className="mb-2 mt-4 text-lg font-semibold first:mt-0" />,
    h2: (props) => <h3 {...props} className="mb-2 mt-4 text-base font-semibold first:mt-0" />,
    h3: (props) => <h4 {...props} className="mb-2 mt-3 font-semibold first:mt-0" />,
    blockquote: (props) => <blockquote {...props} className="mb-3 border-l-2 border-violet-400/60 pl-4 text-zinc-300" />,
    hr: () => <hr className="my-4 border-white/10" />,
    code: (props) => <code {...props} className="break-words rounded-md bg-white/10 px-1.5 py-0.5 text-[0.85em] text-violet-200" />,
    pre: (props) => (
        <pre {...props} className="mb-3 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-zinc-200" />
    ),
    table: (props) => (
        <div className="mb-3 overflow-x-auto rounded-xl border border-white/10">
            <table {...props} className="w-full text-left text-sm" />
        </div>
    ),
    th: (props) => <th {...props} className="border-b border-white/10 bg-white/5 px-3 py-2 font-semibold" />,
    td: (props) => <td {...props} className="border-b border-white/5 px-3 py-2 last:border-b-0" />,
}

function UserAvatar({ user, size = 32 }) {
    const initial = (user?.name || user?.email || '?').trim()[0]?.toUpperCase()
    return user?.avatar ? (
        <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
        <div className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-semibold" style={{ width: size, height: size }}>
            {initial}
        </div>
    )
}

function AiAvatar() {
    return (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 shadow-md shadow-violet-500/20">
            <Sparkles size={15} className="text-white" />
        </div>
    )
}

function Message({ role, content, user }) {
    const [copied, setCopied] = useState(false)
    const mine = role === 'user'

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            /* clipboard unavailable (insecure context): ignore */
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`group flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}
        >
            {mine ? <UserAvatar user={user} /> : <AiAvatar />}
            <div className={`min-w-0 max-w-[85%] ${mine ? '' : 'flex-1'}`}>
                {mine ? (
                    <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-2.5 text-sm leading-relaxed shadow-lg shadow-violet-900/20">
                        {content}
                    </div>
                ) : (
                    <>
                        <div className="break-words text-sm leading-relaxed text-zinc-200">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
                        </div>
                        <button
                            onClick={copy}
                            aria-label="Copy answer"
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-500 opacity-0 transition hover:bg-white/5 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
                        >
                            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </>
                )}
            </div>
        </motion.div>
    )
}

export default function Chat() {
    const { threadId } = useParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const user = useSelector((s) => s.user.userData)

    const [threads, setThreads] = useState([])
    const [messages, setMessages] = useState([])
    const [document, setDocument] = useState(null)
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [slow, setSlow] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [loadingThread, setLoadingThread] = useState(false)
    const [error, setError] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [now] = useState(() => Date.now())

    const fileRef = useRef(null)
    const inputRef = useRef(null)
    const bottomRef = useRef(null)
    // Lets async replies check they still belong to the chat on screen.
    const activeRef = useRef(threadId)
    // A thread created by ensureThread() is empty on the server; don't let the
    // load effect overwrite the optimistic messages already on screen.
    const skipLoadRef = useRef(null)

    useEffect(() => { activeRef.current = threadId }, [threadId])

    useEffect(() => {
        let cancelled = false
        chatApi.get('/threads')
            .then(({ data }) => { if (!cancelled) setThreads(data) })
            .catch((e) => { if (!cancelled) setError(errorText(e)) })
        return () => { cancelled = true }
    }, [])

    // Load the selected conversation (its history lives in MongoDB).
    useEffect(() => {
        if (skipLoadRef.current && skipLoadRef.current === threadId) {
            skipLoadRef.current = null
            return
        }
        let cancelled = false
        const load = async () => {
            setError('')
            if (!threadId) {
                setMessages([])
                setDocument(null)
                return
            }
            setLoadingThread(true)
            try {
                const { data } = await chatApi.get(`/threads/${threadId}`)
                if (cancelled) return
                setMessages(data.messages || [])
                setDocument(data.document?.filename ? data.document : null)
            } catch (e) {
                if (cancelled) return
                if (e?.response?.status === 404) navigate('/chat', { replace: true })
                else setError(errorText(e))
            } finally {
                if (!cancelled) setLoadingThread(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [threadId, navigate])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, sending])

    // First message / first upload in a blank chat creates the thread lazily.
    const ensureThread = async () => {
        if (threadId) return threadId
        const { data } = await chatApi.post('/threads')
        setThreads((prev) => [data, ...prev])
        skipLoadRef.current = data._id
        activeRef.current = data._id
        navigate(`/chat/${data._id}`, { replace: true })
        return data._id
    }

    const resizeInput = (el) => {
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }

    const sendText = async (raw) => {
        const text = raw.trim()
        if (!text || sending || uploading) return
        setError('')
        setSending(true)
        setInput('')
        if (inputRef.current) inputRef.current.style.height = 'auto'
        setMessages((m) => [...m, { role: 'user', content: text }])
        const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
        let id
        try {
            id = await ensureThread()
            const { data } = await chatApi.post(`/threads/${id}/messages`, { message: text })
            if (activeRef.current === id) {
                setMessages((m) => [...m, { role: 'ai', content: data.answer }])
            }
            setThreads((prev) => prev.map((t) => (t._id === id ? { ...t, title: data.title, lastMessageAt: new Date().toISOString() } : t)))
        } catch (e) {
            // Roll back the optimistic message and give the text back to the user.
            if (!id || activeRef.current === id) {
                setMessages((m) => m.slice(0, -1))
                setInput(text)
                setError(errorText(e))
            }
        } finally {
            clearTimeout(slowTimer)
            setSlow(false)
            setSending(false)
        }
    }

    const uploadFile = async (file) => {
        if (!file || sending || uploading) return
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setError('Only PDF files are supported.')
            return
        }
        setError('')
        setUploading(true)
        try {
            const id = await ensureThread()
            const form = new FormData()
            form.append('file', file)
            const { data } = await chatApi.post(`/threads/${id}/documents`, form)
            if (activeRef.current === id) setDocument(data.document)
        } catch (err) {
            setError(errorText(err))
        } finally {
            setUploading(false)
        }
    }

    const handleFileInput = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        uploadFile(file)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragging(false)
        uploadFile(e.dataTransfer.files?.[0])
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this chat?')) return
        try {
            await chatApi.delete(`/threads/${id}`)
            setThreads((prev) => prev.filter((t) => t._id !== id))
            if (id === threadId) navigate('/chat')
        } catch (e) {
            setError(errorText(e))
        }
    }

    const handleLogout = async () => {
        try {
            await authApi.get('/logout')
        } finally {
            dispatch(setUserData(null))
        }
    }

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendText(input)
        }
    }

    const onSuggestion = (s) => {
        if (s.action === 'upload') fileRef.current?.click()
        else sendText(s.prompt)
    }

    const grouped = useMemo(() => groupThreads(threads, now), [threads, now])
    const activeTitle = threads.find((t) => t._id === threadId)?.title
    const busy = sending || uploading
    const firstName = (user?.name || '').split(' ')[0]

    return (
        <div className="relative flex h-full bg-[#07070c] text-white">
            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* ============ Sidebar ============ */}
            <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-[#0b0b12] transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center gap-3 px-4 pt-5 pb-4">
                    <Logo size={34} />
                    <span className="flex-1 text-lg font-semibold tracking-tight">{APP_NAME}</span>
                    <button className="rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                        <X size={16} />
                    </button>
                </div>

                <div className="px-3 pb-3">
                    <button
                        onClick={() => { navigate('/chat'); setSidebarOpen(false) }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-violet-600/20 transition hover:brightness-110 active:scale-[0.99]"
                    >
                        <Plus size={16} /> New chat
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
                    {threads.length === 0 && <p className="px-3 py-4 text-xs text-zinc-500">Your conversations will show up here.</p>}
                    {grouped.map(([label, list]) => (
                        <div key={label} className="mb-3">
                            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
                            {list.map((t) => (
                                <div
                                    key={t._id}
                                    onClick={() => { navigate(`/chat/${t._id}`); setSidebarOpen(false) }}
                                    className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${t._id === threadId ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}
                                >
                                    <span className="flex-1 truncate">{t.title}</span>
                                    {t.document?.filename && <FileText size={13} className="shrink-0 text-zinc-500" />}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(t._id) }}
                                        className="text-zinc-500 transition hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                                        aria-label={`Delete chat ${t.title}`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="flex items-center gap-3 border-t border-white/10 p-3">
                    <UserAvatar user={user} size={36} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{user?.name}</p>
                        <p className="truncate text-xs text-zinc-500">{user?.email}</p>
                    </div>
                    <button onClick={handleLogout} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            {/* ============ Main ============ */}
            <main
                className="relative flex min-w-0 flex-1 flex-col"
                onDragEnter={(e) => { if (e.dataTransfer?.types?.includes('Files')) setDragging(true) }}
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-violet-600/10 to-transparent" />

                <header className="relative z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-[#07070c]/70 px-4 backdrop-blur-xl">
                    <button className="rounded-lg p-2 hover:bg-white/10 md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                        <Menu size={18} />
                    </button>
                    <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{activeTitle || 'New chat'}</h1>
                    {document && (
                        <div className="inline-flex max-w-[50%] items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                            <FileText size={13} className="shrink-0" />
                            <span className="truncate">{document.filename}</span>
                            {document.pages ? <span className="shrink-0 text-emerald-300/60">· {document.pages}p</span> : null}
                        </div>
                    )}
                </header>

                <div className="relative flex-1 overflow-y-auto px-4 py-6">
                    <div className="mx-auto max-w-3xl space-y-6">
                        {loadingThread && <p className="pt-10 text-center text-sm text-zinc-500">Loading conversation…</p>}

                        {!loadingThread && messages.length === 0 && (
                            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="pt-10 text-center md:pt-16">
                                <div className="mx-auto mb-6 w-fit"><Logo size={64} /></div>
                                <h2 className="text-3xl font-bold tracking-tight">
                                    {firstName ? <>Hi {firstName}, </> : null}
                                    <span className="gradient-text">how can I help?</span>
                                </h2>
                                <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
                                    Ask me anything, or attach a PDF and I'll answer questions from it.
                                </p>
                                <div className="mx-auto mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
                                    {SUGGESTIONS.map((s) => (
                                        <button
                                            key={s.title}
                                            onClick={() => onSuggestion(s)}
                                            disabled={busy}
                                            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-violet-400/40 hover:bg-white/[0.06] disabled:opacity-50"
                                        >
                                            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-300 transition group-hover:bg-violet-500/25">
                                                <s.icon size={18} />
                                            </div>
                                            <p className="text-sm font-semibold">{s.title}</p>
                                            <p className="mt-1 text-xs text-zinc-400">{s.text}</p>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} user={user} />)}

                        {sending && (
                            <div className="flex gap-3" aria-label="Assistant is typing">
                                <AiAvatar />
                                <div className="pt-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                                    </div>
                                    {slow && (
                                        <p className="mt-2 text-xs text-zinc-500" role="status">
                                            Waking up the server. Free hosting sleeps when idle, so the first reply can take up to a minute.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                </div>

                {/* ---------- composer ---------- */}
                <div className="relative z-10 px-4 pb-4 pt-2">
                    <div className="mx-auto max-w-3xl">
                        {error && (
                            <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <span className="flex-1">{error}</span>
                                <button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button>
                            </div>
                        )}
                        {uploading && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-zinc-300">
                                <UploadCloud size={16} className="animate-pulse text-violet-300" />
                                Reading your PDF… this can take a minute for large files.
                            </div>
                        )}

                        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-xl shadow-black/30 backdrop-blur-xl transition focus-within:border-violet-400/50 focus-within:ring-4 focus-within:ring-violet-500/10">
                            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileInput} data-testid="file-input" />
                            <button
                                onClick={() => fileRef.current?.click()}
                                disabled={busy}
                                className="rounded-xl p-2.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                                aria-label="Attach a PDF"
                                title="Attach a PDF"
                            >
                                <Paperclip size={18} />
                            </button>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => { setInput(e.target.value); resizeInput(e.target) }}
                                onKeyDown={onKeyDown}
                                rows={1}
                                maxLength={10000}
                                placeholder="Message the assistant…"
                                aria-label="Message"
                                className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-500"
                            />
                            <button
                                onClick={() => sendText(input)}
                                disabled={busy || !input.trim()}
                                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 p-2.5 shadow-lg shadow-violet-600/30 transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
                                aria-label="Send"
                                title="Send"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <p className="mt-2 text-center text-[11px] text-zinc-600">
                            Enter to send · Shift+Enter for a new line · Drop a PDF anywhere to attach it
                        </p>
                    </div>
                </div>

                {/* ---------- drag & drop overlay ---------- */}
                {dragging && (
                    <div
                        className="absolute inset-0 z-50 grid place-items-center border-2 border-dashed border-violet-400/60 bg-[#07070c]/85 backdrop-blur-sm"
                        onDragOver={(e) => e.preventDefault()}
                        onDragLeave={() => setDragging(false)}
                        onDrop={handleDrop}
                    >
                        <div className="text-center">
                            <UploadCloud size={44} className="mx-auto mb-3 text-violet-300" />
                            <p className="text-lg font-semibold">Drop your PDF to attach it</p>
                            <p className="mt-1 text-sm text-zinc-400">Then ask questions about it</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
