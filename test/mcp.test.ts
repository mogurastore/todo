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

  it('tools/list に Todo操作5ツールが含まれる', async () => {
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }))
    const res = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }),
      })
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    for (const name of ['list_todos', 'create_todo', 'get_todo', 'update_todo', 'delete_todo']) {
      expect(text).toContain(`"${name}"`)
    }
  })

  async function callTool(handler: { fetch: (req: Request) => Promise<Response> }, id: number, name: string, args: unknown) {
    const res = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      })
    )
    expect(res.status).toBe(200)
    return res.text()
  }

  function parseFirstText(sse: string): string {
    const payloads = sse
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)))
    const text = payloads.map((p) => p.result?.content?.[0]?.text ?? '').join('')
    return text
  }

  function parseCreatedId(sse: string): string {
    return (JSON.parse(parseFirstText(sse) || '{}').id ?? '') as string
  }

  it('create_todo→list_todosで自分のTodoが返る', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 5, 'create_todo', { title: '牛乳を買う' })
    expect(createdText).toContain('牛乳を買う')
    const listedText = await callTool(handler, 6, 'list_todos', {})
    expect(listedText).toContain('牛乳を買う')
  })

  it('get/update/delete_todoの往復とdoneフィルタ', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 7, 'create_todo', { title: 'やること' })
    const createdId = parseCreatedId(createdText)
    expect(createdId).toBeTruthy()
    const gotText = await callTool(handler, 8, 'get_todo', { id: createdId })
    expect(gotText).toContain('やること')
    const updatedText = await callTool(handler, 9, 'update_todo', { id: createdId, done: true })
    expect(updatedText).toContain('true')
    const doneText = await callTool(handler, 10, 'list_todos', { done: true })
    expect(doneText).toContain('やること')
    const undoneText = await callTool(handler, 11, 'list_todos', { done: false })
    expect(undoneText).not.toContain('やること')
    const deletedText = await callTool(handler, 12, 'delete_todo', { id: createdId })
    expect(deletedText).toContain('deleted')
    const afterText = await callTool(handler, 13, 'get_todo', { id: createdId })
    expect(afterText).toContain('not found')
  })

  it('他人のtodoは存在を隠す', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const alice = createMcpHandler(() => createMcpServer({ login: 'alice', id: 1 }, store))
    const bob = createMcpHandler(() => createMcpServer({ login: 'bob', id: 2 }, store))
    const createdText = await callTool(alice, 14, 'create_todo', { title: 'aliceの秘密' })
    const createdId = parseCreatedId(createdText)
    const bobList = await callTool(bob, 15, 'list_todos', {})
    expect(bobList).not.toContain('aliceの秘密')
    const bobGet = await callTool(bob, 16, 'get_todo', { id: createdId })
    expect(bobGet).toContain('not found')
    const bobUpdate = await callTool(bob, 17, 'update_todo', { id: createdId, done: true })
    expect(bobUpdate).toContain('not found')
    const bobDelete = await callTool(bob, 18, 'delete_todo', { id: createdId })
    expect(bobDelete).toContain('not found')
  })
})
