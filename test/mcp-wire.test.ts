import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import { mcpApiHandler } from '../src/index'
import { ensureUserWithDefaultList } from '../src/db/signup'
import * as schema from '../src/db/schema'
import { applyMigrations, testD1 } from './helpers'

beforeEach(applyMigrations)

function post(body: unknown, props?: unknown) {
  return mcpApiHandler.fetch(
    new Request('http://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env as never,
    { props } as ExecutionContext,
  )
}

describe('MCP配線 #15', () => {
  it('認証済みのtools/listは6ツールを返す', async () => {
    const db = drizzle(testD1(), { schema })
    await ensureUserWithDefaultList(db, { provider: 'github', providerUserId: 'wire1' })
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { provider: 'github', providerUserId: 'wire1' },
    )
    const body = (await res.json()) as { result: { tools: { name: string }[] } }
    expect(body.result.tools.map((t) => t.name).sort()).toEqual([
      'create_todo',
      'delete_todo',
      'get_todo',
      'list_lists',
      'list_todos',
      'update_todo',
    ])
  })

  it('propsなしは401', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    expect(res.status).toBe(401)
  })

  it('GETは405', async () => {
    const res = await mcpApiHandler.fetch(
      new Request('http://example.com/mcp'),
      env as never,
      { props: { provider: 'github', providerUserId: 'wire1' } } as ExecutionContext,
    )
    expect(res.status).toBe(405)
  })
})
