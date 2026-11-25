import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import migrationSql from '../drizzle/0001_init.sql'
import * as schema from '../src/db/schema'

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

describe('DB基盤 #13', () => {
  it('User→List→Todoを作成・参照できる', async () => {
    const database = drizzle(d1db(), { schema })
    const [user] = await database.insert(schema.users).values({}).returning()
    const [list] = await database
      .insert(schema.lists)
      .values({ userId: user.id, title: 'Inbox', isDefault: 1 })
      .returning()
    const [todo] = await database
      .insert(schema.todos)
      .values({ listId: list.id, title: 'milk', done: 0 })
      .returning()

    const rows = await database
      .select({ todoId: schema.todos.id, title: schema.todos.title })
      .from(schema.todos)
      .innerJoin(schema.lists, eq(schema.todos.listId, schema.lists.id))
      .where(eq(schema.lists.userId, user.id))

    expect(rows).toHaveLength(1)
    expect(rows[0].todoId).toBe(todo.id)
  })

  it('(provider, provider_user_id)の一意制約が効く', async () => {
    const database = drizzle(d1db(), { schema })
    const [user] = await database.insert(schema.users).values({}).returning()
    await database
      .insert(schema.identities)
      .values({ userId: user.id, provider: 'github', providerUserId: 'dup-1' })
    await expect(
      database
        .insert(schema.identities)
        .values({ userId: user.id, provider: 'github', providerUserId: 'dup-1' }),
    ).rejects.toThrow()
  })
})
