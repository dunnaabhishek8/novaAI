import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import '@testing-library/jest-dom/vitest'
import userReducer from '../redux/userSlice'

const mocks = vi.hoisted(() => ({ post: vi.fn(), cfg: { googleEnabled: true } }))

vi.mock('../api', () => ({
  authApi: { post: mocks.post },
  errorText: (e) => e?.response?.data?.message || 'Something went wrong. Please try again.',
}))
vi.mock('../config', () => ({
  APP_NAME: 'Nova AI',
  get googleEnabled() { return mocks.cfg.googleEnabled },
}))
vi.mock('../firebase', () => ({ auth: {}, provider: {} }))
vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(async () => ({ user: { getIdToken: async () => 'firebase-id-token' } })),
}))

import AuthPage from './AuthPage'
const setup = () => {
  const store = configureStore({ reducer: { user: userReducer } })
  render(<Provider store={store}><AuthPage /></Provider>)
  return { store, u: userEvent.setup() }
}
const email = () => screen.getByLabelText('Email address')
const pw = () => screen.getByLabelText('Password')

beforeEach(() => { mocks.post.mockReset(); mocks.cfg.googleEnabled = true })
afterEach(cleanup)

describe('AuthPage', () => {
  it('logs in with email + password and stores the user', async () => {
    mocks.post.mockResolvedValue({ data: { _id: '1', name: 'Alice', email: 'alice@x.com' } })
    const { store, u } = setup()
    await u.type(email(), ' alice@x.com ')
    await u.type(pw(), 'correct-horse-1')
    await u.click(screen.getByRole('button', { name: 'Log in', exact: true }).closest('form').querySelector('button[type=submit]'))
    await waitFor(() => expect(store.getState().user.userData?.name).toBe('Alice'))
    expect(mocks.post).toHaveBeenCalledWith('/login', { email: 'alice@x.com', password: 'correct-horse-1' }) // trimmed
  })

  it('shows the server error and does not log in on a wrong password', async () => {
    mocks.post.mockRejectedValue({ response: { data: { message: 'Invalid email or password.' } } })
    const { store, u } = setup()
    await u.type(email(), 'alice@x.com')
    await u.type(pw(), 'nope-nope-nope')
    await u.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(store.getState().user.userData).toBeNull()
  })

  it('validates before calling the server', async () => {
    const { u } = setup()
    await u.type(email(), 'not-an-email')
    await u.type(pw(), 'whatever123')
    await u.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('sign-up tab: asks for a name, enforces 8 chars, shows strength, posts to /register', async () => {
    mocks.post.mockResolvedValue({ data: { _id: '2', name: 'Bob', email: 'bob@x.com' } })
    const { store, u } = setup()
    await u.click(screen.getByRole('tab', { name: 'Sign up' }))
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()

    await u.type(screen.getByLabelText('Full name'), 'Bob')
    await u.type(email(), 'bob@x.com')
    await u.type(pw(), 'short')
    expect(screen.getByText('Weak')).toBeInTheDocument()
    await u.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i)
    expect(mocks.post).not.toHaveBeenCalled()

    await u.clear(pw()); await u.type(pw(), 'Str0ng!passw0rd')
    expect(screen.getByText('Strong')).toBeInTheDocument()
    await u.keyboard('{Enter}')
    await waitFor(() => expect(store.getState().user.userData?.email).toBe('bob@x.com'))
    expect(mocks.post).toHaveBeenCalledWith('/register', { name: 'Bob', email: 'bob@x.com', password: 'Str0ng!passw0rd' })
  })

  it('password visibility toggle works', async () => {
    const { u } = setup()
    expect(pw()).toHaveAttribute('type', 'password')
    await u.click(screen.getByLabelText('Show password'))
    expect(pw()).toHaveAttribute('type', 'text')
  })

  it('Google: sends the Firebase ID token (never a self-declared email)', async () => {
    mocks.post.mockResolvedValue({ data: { _id: '3', name: 'Gina', email: 'g@x.com' } })
    const { store, u } = setup()
    await u.click(screen.getByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(store.getState().user.userData?.name).toBe('Gina'))
    expect(mocks.post).toHaveBeenCalledWith('/google', { idToken: 'firebase-id-token' })
  })

  it('hides the Google button when Firebase is not configured', () => {
    mocks.cfg.googleEnabled = false
    setup()
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument()
    expect(email()).toBeInTheDocument() // email login still available
  })
})
