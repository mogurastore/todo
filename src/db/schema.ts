import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`),
}

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ...timestamps,
})

export const identities = sqliteTable(
  'identities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.provider, t.providerUserId)],
)

export const lists = sqliteTable('lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull().default('Inbox'),
  isDefault: integer('is_default').notNull().default(0),
  ...timestamps,
})

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listId: integer('list_id')
    .notNull()
    .references(() => lists.id),
  title: text('title').notNull(),
  done: integer('done').notNull().default(0),
  ...timestamps,
})
