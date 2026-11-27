import { describe, expect, it, vi, afterEach } from 'vitest'
import worker from '../src/index'

function createKV() {
  const store = new Map<string, string>()
  return {
    async get(k: string, t?: unknown) {
      const v = store.get(k) ?? null
      if (v === null) return null
      const type = typeof t === 'string' ? t : (t as { type?: string } | undefined)?.type
      if (type === 'json') {
        try { return JSON.parse(v) } catch { return v }
      }
      return v
    },
    async put(k: string, v: string) { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)) },
    async delete(k: string) { store.delete(k) },
    async list() { return { keys: [], list_complete: true, cursor: '' } },
  }
}
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

function env(extra: Record<string, string> = {}) {
  return {
    OAUTH_KV: createKV(),
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    ...extra,
  } as never
}

async function sha256url(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('OAuth認可→交換→/mcp疎通 (#26)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('authorizeからGitHub経由で認可しトークンでping/whoamiが通る', async () => {
    const e = env()
    // 1. client登録
    const reg = await worker.fetch(
      new Request('http://localhost/oauth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none' }),
      }),
      e, ctx
    )
    expect(reg.status).toBe(201)
    const { client_id } = (await reg.json()) as { client_id: string }

    // 2. authorize開始 (PKCE)
    const verifier = crypto.randomUUID() + crypto.randomUUID()
    const challenge = await sha256url(verifier)
    const authUrl =
      `http://localhost/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}` +
      `&redirect_uri=${encodeURIComponent('https://client.example/callback')}` +
      `&scope=${encodeURIComponent('mcp:read')}&state=xyz&code_challenge=${challenge}&code_challenge_method=S256` +
      `&resource=${encodeURIComponent('http://localhost/mcp')}`
    const authRes = await worker.fetch(new Request(authUrl), e, ctx)
    expect(authRes.status).toBe(200)
    const html = await authRes.text()
    const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1]
    expect(handle).toBeTruthy()
    const setCookies = authRes.headers.getSetCookie()
    expect(setCookies.length).toBeGreaterThan(0)
    const cookie = setCookies.map((s) => s.split(';')[0]).join('; ')

    // 3. consent承認 → GitHubへ302
    const approve = await worker.fetch(
      new Request('http://localhost/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ handle: handle! }),
      }),
      e, ctx
    )
    expect(approve.status).toBe(302)
    const loc = approve.headers.get('location') ?? ''
    expect(loc).toContain('https://github.com/login/oauth/authorize')
    const ghState = new URL(loc).searchParams.get('state')
    expect(ghState).toBeTruthy()
    const approveCookies = approve.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ')
    const jar = [cookie, approveCookies].filter(Boolean).join('; ')

    // 4. GitHub callbackを模倣
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url)
      if (u.includes('login/oauth/access_token')) return Response.json({ access_token: 'gho_test' })
      if (u.includes('api.github.com/user')) return Response.json({ login: 'octocat', id: 42, avatar_url: 'https://x/avatar.png' })
      throw new Error(`unexpected fetch ${u}`)
    }))
    const cb = await worker.fetch(new Request(`http://localhost/oauth/callback?code=code123&state=${ghState}`, { headers: { Cookie: jar } }), e, ctx)
    expect(cb.status).toBe(302)
    const cbLoc = new URL(cb.headers.get('location')!)
    const code = cbLoc.searchParams.get('code')!
    expect(code).toBeTruthy()

    // 5. token交換
    const tok = await worker.fetch(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code, redirect_uri: 'https://client.example/callback',
          client_id, code_verifier: verifier, resource: 'http://localhost/mcp',
        }),
      }),
      e, ctx
    )
    expect(tok.status).toBe(200)
    const { access_token } = (await tok.json()) as { access_token: string }
    expect(access_token).toBeTruthy()

    // 6. /mcp疎通 + 利用者情報
    const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${access_token}` }
    const ping = await worker.fetch(
      new Request('http://localhost/mcp', { method: 'POST', headers: mcpHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ping', arguments: {} } }) }),
      e, ctx
    )
    expect(ping.status).toBe(200)
    expect(await ping.text()).toContain('pong')

    const who = await worker.fetch(
      new Request('http://localhost/mcp', { method: 'POST', headers: mcpHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } }) }),
      e, ctx
    )
    expect(who.status).toBe(200)
    const whoText = await who.text()
    expect(whoText).toContain('octocat')
    expect(whoText).toContain('42')
  })
})
