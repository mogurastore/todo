import { describe, expect, it } from 'vitest'
import worker from '../src/index'

function createKV() {
  const store = new Map<string, string>()
  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list() {
      return { keys: [], list_complete: true, cursor: '' }
    },
  }
}

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

function env(extra: Record<string, string> = {}) {
  return { OAUTH_KV: createKV(), ...extra } as never
}

const mcpBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
const mcpHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }

describe('OAuth発見土台 (#25)', () => {
  it('未認可の/mcpは発見先付き401を返す', async () => {
    const res = await worker.fetch(new Request('http://localhost/mcp', { method: 'POST', headers: mcpHeaders, body: mcpBody }), env(), ctx)
    expect(res.status).toBe(401)
    const www = res.headers.get('www-authenticate') ?? ''
    expect(www).toContain('resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"')
    expect(www).toContain('scope="mcp:read"')
  })

  it('protected-resourceメタデータが取得できる', async () => {
    const res = await worker.fetch(new Request('http://localhost/.well-known/oauth-protected-resource/mcp'), env(), ctx)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { resource: string; authorization_servers: string[] }
    expect(json.resource).toContain('/mcp')
    expect(json.authorization_servers.length).toBeGreaterThan(0)
  })

  it('authorization-serverメタデータが取得できる', async () => {
    const res = await worker.fetch(new Request('http://localhost/.well-known/oauth-authorization-server'), env(), ctx)
    expect(res.status).toBe(200)
  })

  it('既存の / と /auth/login は従来通り動く', async () => {
    const top = await worker.fetch(new Request('http://localhost/'), env(), ctx)
    expect(top.status).toBe(200)
    expect(await top.text()).toContain('/auth/login')
    const login = await worker.fetch(
      new Request('http://localhost/auth/login'),
      env({ GITHUB_CLIENT_ID: 'test-client-id' }),
      ctx
    )
    expect(login.status).toBe(302)
    expect(login.headers.get('location') ?? '').toContain('https://github.com/login/oauth/authorize')
  })
})
