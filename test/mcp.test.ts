import { describe, expect, it } from 'vitest'
import { app } from '../src/index'

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}

describe('POST /mcp ping', () => {
  it('tools/list に ping が含まれる', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"ping"')
  })

  it('tools/call ping が pong を返す', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'ping', arguments: {} },
      }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('pong')
  })
})
