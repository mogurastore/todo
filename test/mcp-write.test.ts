import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../src/db/schema'
import { ensureUserWithDefaultList } from '../src/db/signup'
import { handleMcpRequest } from '../src/mcp/handler'
import { applyMigrations, testD1 } from './helpers'

type RpcOk = {
  result?: { content: { type: string; text: string }[]; isError?: boolean }
  error?: { code: number; message: string }
}

async function call(
  props: { provider: string; providerUserId: string },
  name: string,
  args: unknown,
): Promise<RpcOk> {
  const db = drizzle(testD1(), { schema })
  const res = await handleMcpRequest(db, props, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  })
  return (await res.json()) as RpcOk
}

function text<T>(body: RpcOk): T {
  if (body.error) throw new Error(`rpc error: ${body.error.message}`)
  if (body.result?.isError) throw new Error(`tool error: ${body.result.content[0].text}`)
  return JSON.parse(body.result!.content[0].text) as T
}

beforeEach(applyMigrations)

describe('MCP書込み #16', () => {
  it('create_todoでInboxに作られる', async () => {
    const db = drizzle(testD1(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'w1' })
    const props = { provider: 'github', providerUserId: 'w1' }

    const created = text<{ id: number; title: string; done: boolean }>(
      await call(props, 'create_todo', { title: 'buy milk' }),
    )
    expect(created.title).toBe('buy milk')
    expect(created.done).toBe(false)

    const listed = text<{ id: number }[]>(await call(props, 'list_todos', {}))
    expect(listed.map((t) => t.id)).toContain(created.id)
  })

  it('update_todoでtitleとdoneを更新できる', async () => {
    const db = drizzle(testD1(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'w2' })
    const props = { provider: 'github', providerUserId: 'w2' }
    const created = text<{ id: number }>(await call(props, 'create_todo', { title: 'old' }))

    const updated = text<{ id: number; title: string; done: boolean }>(
      await call(props, 'update_todo', { id: created.id, title: 'new', done: true }),
    )
    expect(updated.title).toBe('new')
    expect(updated.done).toBe(true)
  })

  it('delete_todoで消える', async () => {
    const db = drizzle(testD1(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'w3' })
    const props = { provider: 'github', providerUserId: 'w3' }
    const created = text<{ id: number }>(await call(props, 'create_todo', { title: 'bye' }))

    const deleted = text<{ deleted: boolean; id: number }>(
      await call(props, 'delete_todo', { id: created.id }),
    )
    expect(deleted).toEqual({ deleted: true, id: created.id })

    const again = await call(props, 'get_todo', { id: created.id })
    expect(again.result?.isError).toBe(true)
  })

  it('他人のtodoへの更新・削除は存在を隠す', async () => {
    const db = drizzle(testD1(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'owner' })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'intruder' })
    const owner = { provider: 'github', providerUserId: 'owner' }
    const intruder = { provider: 'github', providerUserId: 'intruder' }
    const created = text<{ id: number }>(await call(owner, 'create_todo', { title: 'mine' }))

    const upd = await call(intruder, 'update_todo', { id: created.id, title: 'hijack' })
    expect(upd.result?.isError).toBe(true)
    const del = await call(intruder, 'delete_todo', { id: created.id })
    expect(del.result?.isError).toBe(true)

    // 本人のものは無事
    const mine = text<{ title: string }>(await call(owner, 'get_todo', { id: created.id }))
    expect(mine.title).toBe('mine')
  })
})
