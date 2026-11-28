import { describe, expect, it, vi, afterEach } from 'vitest'
import worker, { app } from '../src/index'
import { signSession, verifySession } from '../src/auth'
import { createKV } from './helpers/mock-kv'
const workerCtx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

const env = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: 'test-session-secret-0123456789',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /', () => {
  it('未ログインではGitHubログインボタンを含む', async () => {
    const res = await app.request('/', {}, env)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('/auth/login')
  })
})

describe('GET /auth/login', () => {
  it('GitHub認可画面にリダイレクトする', async () => {
    const res = await app.request('/auth/login', {}, env)
    expect(res.status).toBe(302)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('https://github.com/login/oauth/authorize')
    expect(loc).toContain('client_id=test-client-id')
  })
})

describe('JWT seam', () => {
  it('署名したセッションを検証できる', async () => {
    const token = await signSession({ login: 'octocat', id: 1, avatar_url: 'https://x/y.png' }, env.SESSION_SECRET)
    const payload = await verifySession(token, env.SESSION_SECRET)
    expect(payload?.login).toBe('octocat')
  })

  it('改ざんされたトークンは無効', async () => {
    const payload = await verifySession('invalid.token.here', env.SESSION_SECRET)
    expect(payload).toBeNull()
  })
})

describe('GET / session表示', () => {
  it('有効なCookieでは利用者名を表示する', async () => {
    const token = await signSession({ login: 'octocat', id: 1 }, env.SESSION_SECRET)
    const res = await app.request('/', { headers: { Cookie: `session=${token}` } }, env)
    const text = await res.text()
    expect(text).toContain('octocat')
    expect(text).not.toContain('/auth/login')
  })
})

describe('GET /auth/logout', () => {
  it('sessionを削除して/に返す', async () => {
    const res = await app.request('/auth/logout', {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(res.headers.get('set-cookie') ?? '').toContain('session=')
  })
})

describe('GET /auth/callback', () => {
  it('state不一致は400', async () => {
    const res = await app.request('/auth/callback?code=x&state=y', { headers: { Cookie: 'oauth_state=z' } }, env)
    expect(res.status).toBe(400)
  })

  it('正常系はCookieを発行して/に返す', async () => {
    const loginRes = await app.request('/auth/login', {}, env)
    const state = new URL(loginRes.headers.get('location') ?? '').searchParams.get('state') ?? ''
    expect(state).not.toBe('')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url)
        if (u.includes('login/oauth/access_token')) {
          return Response.json({ access_token: 'gho_test' })
        }
        if (u.includes('api.github.com/user')) {
          return Response.json({ login: 'octocat', id: 42, avatar_url: 'https://x/avatar.png' })
        }
        throw new Error(`unexpected fetch ${u}`)
      })
    )

    const res = await app.request(`/auth/callback?code=code123&state=${state}`, { headers: { Cookie: `oauth_state=${state}` } }, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(res.headers.get('set-cookie') ?? '').toContain('session=')
  })
})

describe('MCP旧Bearer撤去 (#27)', () => {
  const mcpBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
  const wenv = { OAUTH_KV: createKV() } as never

  it('旧手貼りBearerでは/mcpが通らない', async () => {
    const token = await signSession({ login: 'octocat', id: 42 }, env.SESSION_SECRET)
    const res = await worker.fetch(
      new Request('http://localhost/mcp', { method: 'POST', headers: { ...mcpHeaders, Authorization: `Bearer ${token}` }, body: mcpBody }),
      wenv, workerCtx
    )
    expect(res.status).toBe(401)
  })

  it('無認可の直叩きも401', async () => {
    const res = await worker.fetch(new Request('http://localhost/mcp', { method: 'POST', headers: mcpHeaders, body: mcpBody }), wenv, workerCtx)
    expect(res.status).toBe(401)
  })
})
