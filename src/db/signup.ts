import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'

type Db = DrizzleD1Database<typeof schema>

export async function ensureUserWithDefaultList(
  db: Db,
  identity: { provider: string; providerUserId: string },
): Promise<{ userId: number; created: boolean }> {
  const existing = await db
    .select()
    .from(schema.identities)
    .where(
      and(
        eq(schema.identities.provider, identity.provider),
        eq(schema.identities.providerUserId, identity.providerUserId),
      ),
    )
    .limit(1)
  if (existing.length > 0) return { userId: existing[0].userId, created: false }

  const [user] = await db.insert(schema.users).values({}).returning()
  await db.insert(schema.identities).values({ userId: user.id, ...identity })

  const defaults = await db
    .select({ id: schema.lists.id })
    .from(schema.lists)
    .where(and(eq(schema.lists.userId, user.id), eq(schema.lists.isDefault, 1)))
    .limit(1)
  if (defaults.length === 0) {
    await db.insert(schema.lists).values({ userId: user.id, title: 'Inbox', isDefault: 1 })
  }
  return { userId: user.id, created: true }
}
