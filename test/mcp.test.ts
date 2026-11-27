import { describe, expect, it } from 'vitest'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createMcpServer } from '../src/mcp'

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}

describe('MCPツール単体 (#27)', () => {
  it('tools/list に ping と whoami が含まれる', async () => {
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }))
    const res = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"ping"')
    expect(text).toContain('"whoami"')
  })

  it('tools/call ping が pong を返す', async () => {
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }))
    const res = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'ping', arguments: {} },
        }),
      })
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('pong')
  })

  it('tools/call whoami が利用者情報を返す', async () => {
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }))
    const res = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'whoami', arguments: {} },
        }),
      })
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('octocat')
  })
})
