import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../src/db/schema'
import { ensureUserWithDefaultList } from '../src/db/signup'
import { handleMcpRequest } from '../src/mcp/handler'
import { applyMigrations, testD1 } from './helpers'

function d1db() {
  return testD1()
}

async function rpc(
  props: { provider: string; providerUserId: string },
  method: string,
  params: unknown = {},
) {
  const db = drizzle(d1db(), { schema })
  const res = await handleMcpRequest(db, props, { jsonrpc: '2.0', id: 1, method, params })
  return (await res.json()) as {
    result?: { content: { type: string; text: string }[]; isError?: boolean }
    error?: { code: number; message: string }
  }
}

beforeEach(applyMigrations)

describe('MCP読取り #15', () => {
  it('list_listsは自分のListだけ返す', async () => {
    const db = drizzle(d1db(), { schema })
    const me = await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'u1' })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'u2' })
    expect(me.created).toBe(true)

    const body = await rpc({ provider: 'github', providerUserId: 'u1' }, 'tools/call', {
      name: 'list_lists',
      arguments: {},
    })
    const lists = JSON.parse(body.result!.content[0].text) as { id: number }[]
    expect(lists).toHaveLength(1)

    // 他人のlist_todosは空（自分のデータのみ）
    const other = await rpc({ provider: 'github', providerUserId: 'u2' }, 'tools/call', {
      name: 'list_todos',
      arguments: {},
    })
    expect(JSON.parse(other.result!.content[0].text)).toHaveLength(0)
  })

  it('list_todosはdoneフィルタできる', async () => {
    const db = drizzle(d1db(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'u3' })
    const props = { provider: 'github', providerUserId: 'u3' }
    const lists = await rpc(props, 'tools/call', { name: 'list_lists', arguments: {} })
    const listId = (JSON.parse(lists.result!.content[0].text) as { id: number }[])[0].id
    await db.insert(schema.todos).values([
      { listId, title: 'todo1', done: 0 },
      { listId, title: 'todo2', done: 1 },
    ])

    const all = await rpc(props, 'tools/call', { name: 'list_todos', arguments: {} })
    expect((JSON.parse(all.result!.content[0].text) as unknown[])).toHaveLength(2)

    const doneOnly = await rpc(props, 'tools/call', {
      name: 'list_todos',
      arguments: { done: true },
    })
    const doneTodos = JSON.parse(doneOnly.result!.content[0].text) as { done: boolean }[]
    expect(doneTodos.length).toBeGreaterThan(0)
    expect(doneTodos.every((t) => t.done === true)).toBe(true)
  })

  it('他人のtodoは存在を隠してエラーを返す', async () => {
    const db = drizzle(d1db(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'victim' })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'attacker' })
    const victimLists = await rpc({ provider: 'github', providerUserId: 'victim' }, 'tools/call', {
      name: 'list_lists',
      arguments: {},
    })
    const listId = (JSON.parse(victimLists.result!.content[0].text) as { id: number }[])[0].id
    const [todo] = await db.insert(schema.todos).values({ listId, title: 'secret', done: 0 }).returning()

    const body = await rpc({ provider: 'github', providerUserId: 'attacker' }, 'tools/call', {
      name: 'get_todo',
      arguments: { id: todo.id },
    })
    expect(body.result?.isError).toBe(true)
  })
})
