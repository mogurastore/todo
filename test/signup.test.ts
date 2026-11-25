import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import migrationSql from '../drizzle/0001_init.sql'
import * as schema from '../src/db/schema'
import { ensureUserWithDefaultList } from '../src/db/signup'

function d1db() {
  const d1 = (env as unknown as { DB: D1Database }).DB
  if (!d1) throw new Error('DB binding missing')
  return d1
}

beforeEach(async () => {
  const statements = migrationSql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const stmt of statements) {
    await d1db().prepare(stmt).run()
  }
})

describe('Signup #14', () => {
  it('初回はUser＋Identity＋Inboxが1セット作られる', async () => {
    const database = drizzle(d1db(), { schema })
    const { userId, created } = await ensureUserWithDefaultList(database, {
      provider: 'github',
      providerUserId: '1001',
    })
    expect(created).toBe(true)

    const identities = await database
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId))
    expect(identities).toHaveLength(1)

    const lists = await database
      .select()
      .from(schema.lists)
      .where(eq(schema.lists.userId, userId))
    expect(lists).toHaveLength(1)
    expect(lists[0].title).toBe('Inbox')
    expect(lists[0].isDefault).toBe(1)
  })

  it('再ログインでは重複作成されない', async () => {
    const database = drizzle(d1db(), { schema })
    const first = await ensureUserWithDefaultList(database, {
      provider: 'github',
      providerUserId: '1002',
    })
    const second = await ensureUserWithDefaultList(database, {
      provider: 'github',
      providerUserId: '1002',
    })
    expect(second.created).toBe(false)
    expect(second.userId).toBe(first.userId)

    const lists = await database
      .select()
      .from(schema.lists)
      .where(eq(schema.lists.userId, first.userId))
    expect(lists).toHaveLength(1)
  })
})
