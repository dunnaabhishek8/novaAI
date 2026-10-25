import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import '@testing-library/jest-dom/vitest'
import userReducer, { setUserData } from '../redux/userSlice'

Element.prototype.scrollIntoView = () => {}
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const h = vi.hoisted(() => ({ db: { threads: [], calls: [] } }))
const { db } = h

vi.mock('../config', () => ({ APP_NAME: 'Nova AI', serverUrl: 'http://x', googleEnabled: false }))
vi.mock('../api', () => ({
  errorText: (e) => e?.response?.data?.message || 'Something went wrong. Please try again.',
  authApi: { get: vi.fn(async () => ({ data: {} })) },
  chatApi: {
    get: vi.fn(async (url) => {
      db.calls.push(['GET', url])
      if (url === '/threads') return { data: db.threads.map((t) => ({ ...t, messages: undefined })) }
      const t = db.threads.find((t) => url.endsWith(t._id))
      if (!t) throw { response: { status: 404, data: { message: 'nf' } } }
      return { data: t }
    }),
    post: vi.fn(async (url, body) => {
      db.calls.push(['POST', url])
      if (url === '/threads') {
        const t = { _id: 'T' + (db.threads.length + 1), title: 'New chat', messages: [], lastMessageAt: new Date().toISOString() }
        db.threads.unshift(t); return { data: t }
      }
      if (url.endsWith('/messages')) {
        await delay(db.slowMs || 50) // slow LLM: a wrongly-fired thread GET would land first and wipe the optimistic bubble
        if (body.message === 'fail') throw { response: { data: { message: 'The assistant is temporarily unavailable.' } } }
        const t = db.threads.find((t) => url.includes(t._id))
        t.title = body.message
        t.messages.push({ role: 'user', content: body.message }, { role: 'ai', content: 'Reply to **' + body.message + '**' })
        return { data: { answer: 'Reply to **' + body.message + '**', title: body.message } }
      }
    }),
    delete: vi.fn(),
  },
}))

import Chat from './Chat'
const ui = (path) => {
  const store = configureStore({ reducer: { user: userReducer } })
  store.dispatch(setUserData({ _id: 'u1', name: 'Abhishek Dunna', email: 'a@x.com' }))
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path='/chat' element={<Chat />} /><Route path='/chat/:threadId' element={<Chat />} /></Routes>
      </MemoryRouter>
    </Provider>)
  return userEvent.setup()
}

afterEach(cleanup)
beforeEach(() => { db.threads = []; db.calls = []; db.slowMs = 0 })

describe('Chat page', () => {
  it('greets the user by first name', async () => {
    ui('/chat')
    expect(await screen.findByText(/Hi Abhishek,/)).toBeInTheDocument()
  })

  it('first message in a blank chat: bubble survives thread creation, reply renders as markdown, thread grouped under Today', async () => {
    const u = ui('/chat')
    await u.type(screen.getByLabelText('Message'), 'hello there{Enter}')
    expect(screen.getByText('hello there', { selector: 'div' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('hello there', { selector: 'strong' })).toBeInTheDocument())
    expect(screen.getAllByText('hello there').length).toBeGreaterThanOrEqual(2) // bubble + sidebar title
    expect(screen.getByText('Today')).toBeInTheDocument()
    // the freshly created thread must NOT be re-fetched (that would wipe optimistic state)
    expect(db.calls.filter(([m, p]) => m === 'GET' && p.startsWith('/threads/'))).toHaveLength(0)
  })

  it('suggestion card sends its prompt', async () => {
    const u = ui('/chat')
    await u.click(await screen.findByRole('button', { name: /Check a stock/ }))
    await waitFor(() => expect(screen.getByText(/current price of AAPL/, { selector: 'strong' })).toBeInTheDocument())
  })

  it('failed send rolls back the bubble, restores the text and shows the error', async () => {
    const u = ui('/chat')
    await u.type(screen.getByLabelText('Message'), 'fail{Enter}')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/))
    expect(screen.getByLabelText('Message')).toHaveValue('fail')
    expect(screen.queryByLabelText('Assistant is typing')).not.toBeInTheDocument()
  })

  it('opening an existing thread loads history and the attached document', async () => {
    db.threads = [{ _id: 'T1', title: 'old', lastMessageAt: new Date().toISOString(), messages: [{ role: 'user', content: 'q1' }, { role: 'ai', content: 'a1' }], document: { filename: 'cv.pdf', pages: 2, chunks: 2 } }]
    ui('/chat/T1')
    await waitFor(() => expect(screen.getByText('a1')).toBeInTheDocument())
    expect(screen.getByText('q1')).toBeInTheDocument()
    expect(screen.getByText('cv.pdf', { selector: 'span' })).toBeInTheDocument()
  })

  it('unknown thread id bounces back to the blank chat', async () => {
    ui('/chat/NOPE')
    await waitFor(() => expect(screen.getByText('how can I help?')).toBeInTheDocument())
  })

  it('explains a slow reply (free-tier cold start) after 8s, and clears the notice when it arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      db.slowMs = 9000
      const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      ui('/chat')
      await u.type(screen.getByLabelText('Message'), 'slow one{Enter}')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(8100)
      expect(await screen.findByRole('status')).toHaveTextContent(/Waking up the server/)
      await vi.advanceTimersByTimeAsync(1500)
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
      expect(screen.getByText('slow one', { selector: 'strong' })).toBeInTheDocument()
    } finally { db.slowMs = 0; vi.useRealTimers() }
  })

  it('rejects non-PDF files client-side', async () => {
    ui('/chat')
    // fireEvent bypasses the picker's accept="pdf" filter, like drag-and-drop or "All files" would
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF files are supported.')
  })
})
