import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../src/db/schema'
import { applyMigrations, testD1 } from './helpers'

function d1db() {
  return testD1()
}

beforeEach(applyMigrations)

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
