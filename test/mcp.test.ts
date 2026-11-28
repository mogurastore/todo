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

  it('空白のみのtitleではTodoが作られない', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const bad = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'create_todo', arguments: { title: '   ' } } }),
      })
    )
    const badText = await bad.text()
    expect(badText).toContain('must not be blank')
    const listedText = await callTool(handler, 21, 'list_todos', {})
    expect(JSON.parse(parseFirstText(listedText))).toEqual([])
  })

  it('create/updateでdueDateが回り、nullで解除できる', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 30, 'create_todo', { title: '期限あり', dueDate: '2026-12-31' })
    const createdId = parseCreatedId(createdText)
    expect(JSON.parse(parseFirstText(createdText)).dueDate).toBe('2026-12-31')
    const gotText = await callTool(handler, 31, 'get_todo', { id: createdId })
    expect(JSON.parse(parseFirstText(gotText)).dueDate).toBe('2026-12-31')
    const clearedText = await callTool(handler, 32, 'update_todo', { id: createdId, dueDate: null })
    expect(JSON.parse(parseFirstText(clearedText)).dueDate).toBeNull()
  })

  it('実在しない日付は弾き、過去日は通す', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const bad = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 33, method: 'tools/call', params: { name: 'create_todo', arguments: { title: 'x', dueDate: '2026-02-30' } } }),
      })
    )
    expect((await bad.text()).toLowerCase()).toContain('duedate')
    const pastText = await callTool(handler, 34, 'create_todo', { title: 'old', dueDate: '2000-01-01' })
    expect(JSON.parse(parseFirstText(pastText)).dueDate).toBe('2000-01-01')
    const emptyText = await callTool(handler, 35, 'create_todo', { title: 'empty', dueDate: '' })
    expect(JSON.parse(parseFirstText(emptyText)).dueDate).toBeNull()
  })

  function jstTodayViaUtc(): string {
    // srcのIntl実装とは独立した算出で期待値を求める (JSTはDSTなしUTC+9)
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  it('focusToday=trueでJST今日が刻まれ、todayOnlyで絞れる', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const jstToday = jstTodayViaUtc()
    const focusedText = await callTool(handler, 40, 'create_todo', { title: '集中する', focusToday: true })
    expect(JSON.parse(parseFirstText(focusedText)).focusDate).toBe(jstToday)
    const plainText = await callTool(handler, 41, 'create_todo', { title: 'ふつう' })
    expect(JSON.parse(parseFirstText(plainText)).focusDate).toBeNull()
    const todayText = await callTool(handler, 42, 'list_todos', { todayOnly: true })
    const todayTitles = (JSON.parse(parseFirstText(todayText)) as { title: string }[]).map((t) => t.title)
    expect(todayTitles).toContain('集中する')
    expect(todayTitles).not.toContain('ふつう')
  })

  it('updateのfocusTodayで付け替え・解除できる', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const jstToday = jstTodayViaUtc()
    const createdId = parseCreatedId(await callTool(handler, 43, 'create_todo', { title: 'あとで集中' }))
    const focusedText = await callTool(handler, 44, 'update_todo', { id: createdId, focusToday: true })
    expect(JSON.parse(parseFirstText(focusedText)).focusDate).toBe(jstToday)
    const todayText = await callTool(handler, 45, 'list_todos', { todayOnly: true })
    expect(todayText).toContain('あとで集中')
    const clearedText = await callTool(handler, 46, 'update_todo', { id: createdId, focusToday: false })
    expect(JSON.parse(parseFirstText(clearedText)).focusDate).toBeNull()
    const afterText = await callTool(handler, 47, 'list_todos', { todayOnly: true })
    expect(afterText).not.toContain('あとで集中')
  })

  it('過去のフォーカス日は今日に出ず、完了済みは今日に出る', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const pastId = parseCreatedId(await callTool(handler, 48, 'create_todo', { title: '昨日の集中' }))
    await store.update(42, pastId, { focusDate: '2000-01-01' })
    const doneId = parseCreatedId(await callTool(handler, 49, 'create_todo', { title: '今日やり切った', focusToday: true }))
    await callTool(handler, 50, 'update_todo', { id: doneId, done: true })
    const todayText = await callTool(handler, 51, 'list_todos', { todayOnly: true })
    expect(todayText).not.toContain('昨日の集中')
    expect(todayText).toContain('今日やり切った')
  })

  it('createで繰り返しが回り、期限なしには付けられない', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 60, 'create_todo', {
      title: 'ごみ出し',
      dueDate: '2026-11-01',
      repeat: { unit: 'week', interval: 1 },
    })
    expect(JSON.parse(parseFirstText(createdText)).repeat).toEqual({ unit: 'week', interval: 1 })
    const badText = await callTool(handler, 61, 'create_todo', {
      title: '期限なし繰り返し',
      repeat: { unit: 'day', interval: 1 },
    })
    expect(badText.toLowerCase()).toContain('repeat')
  })

  it('完了で次回分が作られ、update応答にrepeatが含まれる', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdId = parseCreatedId(
      await callTool(handler, 62, 'create_todo', {
        title: 'ごみ出し',
        dueDate: '2026-11-01',
        repeat: { unit: 'week', interval: 1 },
      })
    )
    const updatedText = await callTool(handler, 63, 'update_todo', { id: createdId, done: true })
    expect(JSON.parse(parseFirstText(updatedText)).repeat).toEqual({ unit: 'week', interval: 1 })
    const listed = JSON.parse(parseFirstText(await callTool(handler, 64, 'list_todos', {}))) as {
      id: string
      title: string
      dueDate: string | null
    }[]
    expect(listed.length).toBe(2)
    const next = listed.find((t) => t.id !== createdId)!
    expect(next.dueDate).toBe('2026-11-08')
  })

  it('spawnedFromIdは応答に含まれ、解除→再チェックで重複しない', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 65, 'create_todo', {
      title: 'ごみ出し',
      dueDate: '2026-11-01',
      repeat: { unit: 'week', interval: 1 },
    })
    const createdId = parseCreatedId(createdText)
    expect(JSON.parse(parseFirstText(createdText)).spawnedFromId).toBeNull()
    await callTool(handler, 66, 'update_todo', { id: createdId, done: true })
    await callTool(handler, 67, 'update_todo', { id: createdId, done: false })
    await callTool(handler, 68, 'update_todo', { id: createdId, done: true })
    const listed = JSON.parse(parseFirstText(await callTool(handler, 69, 'list_todos', {}))) as {
      id: string
      spawnedFromId: string | null
    }[]
    expect(listed.length).toBe(2)
    expect(listed.find((t) => t.id !== createdId)!.spawnedFromId).toBe(createdId)
  })

  it('曜日指定の繰り返しは正規化され、次回は該当曜日に作られる', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const createdText = await callTool(handler, 70, 'create_todo', {
      title: 'ごみ出し',
      dueDate: '2026-11-02',
      repeat: { unit: 'week', interval: 1, byWeekday: [3, 1, 1] },
    })
    const created = JSON.parse(parseFirstText(createdText))
    expect(created.repeat).toEqual({ unit: 'week', interval: 1, byWeekday: [1, 3] })
    const createdId = created.id as string
    await callTool(handler, 71, 'update_todo', { id: createdId, done: true })
    const listed = JSON.parse(parseFirstText(await callTool(handler, 72, 'list_todos', {}))) as {
      id: string
      dueDate: string | null
      repeat: unknown
    }[]
    expect(listed.length).toBe(2)
    const next = listed.find((t) => t.id !== createdId)!
    expect(next.dueDate).toBe('2026-11-04')
    expect(next.repeat).toEqual({ unit: 'week', interval: 1, byWeekday: [1, 3] })
  })

  it('曜日指定はweek以外・空・範囲外を弾く', async () => {
    const { createMemoryTodoStore } = await import('../src/todo')
    const store = createMemoryTodoStore()
    const handler = createMcpHandler(() => createMcpServer({ login: 'octocat', id: 42 }, store))
    const badUnit = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 73,
          method: 'tools/call',
          params: { name: 'create_todo', arguments: { title: 'x', dueDate: '2026-11-02', repeat: { unit: 'day', interval: 1, byWeekday: [1] } } },
        }),
      })
    )
    expect((await badUnit.text()).toLowerCase()).toContain('byweekday')
    const badEmpty = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 74,
          method: 'tools/call',
          params: { name: 'create_todo', arguments: { title: 'x', dueDate: '2026-11-02', repeat: { unit: 'week', interval: 1, byWeekday: [] } } },
        }),
      })
    )
    expect((await badEmpty.text()).toLowerCase()).toContain('byweekday')
    const badRange = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 75,
          method: 'tools/call',
          params: { name: 'create_todo', arguments: { title: 'x', dueDate: '2026-11-02', repeat: { unit: 'week', interval: 1, byWeekday: [7] } } },
        }),
      })
    )
    expect((await badRange.text()).toLowerCase()).toContain('byweekday')
  })
})
