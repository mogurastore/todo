import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('Worker 統合テスト', () => {
  it('GET / が 200 と Hello! を返す', async () => {
    const res = await exports.default.fetch('http://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello!')
  })

  it('未認証の /mcp は 401 を返す', async () => {
    const res = await exports.default.fetch('http://example.com/mcp')
    expect(res.status).toBe(401)
  })

  it('OAuth discovery metadataを返す', async () => {
    const res = await exports.default.fetch(
      'http://example.com/.well-known/oauth-authorization-server',
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      authorization_endpoint: string
      token_endpoint: string
      registration_endpoint?: string
    }
    expect(body.authorization_endpoint).toContain('/authorize')
    expect(body.token_endpoint).toContain('/token')
  })
})
