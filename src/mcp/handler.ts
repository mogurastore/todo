import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

type Db = DrizzleD1Database<typeof schema>

export type McpProps = { provider: string; providerUserId: string }

type TodoRow = typeof schema.todos.$inferSelect
type ListRow = typeof schema.lists.$inferSelect

function toTodo(t: TodoRow) {
  return {
    id: t.id,
    title: t.title,
    done: t.done === 1,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

function toList(l: ListRow) {
  return { id: l.id, title: l.title, isDefault: l.isDefault === 1, createdAt: l.createdAt }
}

function ok(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id, result })
}

function fail(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } })
}

function textResult(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function toolError(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const TOOL_DEFS = [
  {
    name: 'list_lists',
    description: 'List my todo lists (read-only)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_todos',
    description: 'List todos in my default list, optionally filtered by done state',
    inputSchema: {
      type: 'object',
      properties: { done: { type: 'boolean', description: 'true: completed only, false: open only' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_todo',
    description: 'Get one todo by id',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

async function resolveUserId(db: Db, props: McpProps): Promise<number | null> {
  const rows = await db
    .select({ userId: schema.identities.userId })
    .from(schema.identities)
    .where(
      and(
        eq(schema.identities.provider, props.provider),
        eq(schema.identities.providerUserId, props.providerUserId),
      ),
    )
    .limit(1)
  return rows[0]?.userId ?? null
}

async function defaultListId(db: Db, userId: number): Promise<number | null> {
  const rows = await db
    .select({ id: schema.lists.id })
    .from(schema.lists)
    .where(and(eq(schema.lists.userId, userId), eq(schema.lists.isDefault, 1)))
    .limit(1)
  return rows[0]?.id ?? null
}

export async function handleMcpRequest(db: Db, props: McpProps, body: unknown): Promise<Response> {
  const req = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
  const id = req?.id ?? null
  if (req?.jsonrpc !== '2.0' || typeof req?.method !== 'string') {
    return fail(id, -32600, 'Invalid Request')
  }

  switch (req.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'todo', version: '0.1.0' },
      })
    case 'notifications/initialized':
      return new Response(null, { status: 202 })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOL_DEFS })
    case 'tools/call':
      break
    default:
      return fail(id, -32601, 'Method not found')
  }

  const params = (req.params ?? {}) as { name?: unknown; arguments?: unknown }
  if (typeof params.name !== 'string') return fail(id, -32602, 'missing tool name')
  const args = (params.arguments ?? {}) as Record<string, unknown>

  switch (params.name) {
    case 'list_lists': {
      const userId = await resolveUserId(db, props)
      if (userId === null) return ok(id, textResult([]))
      const lists = await db
        .select()
        .from(schema.lists)
        .where(eq(schema.lists.userId, userId))
        .orderBy(schema.lists.id)
      return ok(id, textResult(lists.map(toList)))
    }
    case 'list_todos': {
      if ('done' in args && typeof args.done !== 'boolean') {
        return fail(id, -32602, 'done must be a boolean')
      }
      const userId = await resolveUserId(db, props)
      if (userId === null) return ok(id, textResult([]))
      const listId = await defaultListId(db, userId)
      if (listId === null) return ok(id, textResult([]))
      const conditions =
        typeof args.done === 'boolean'
          ? and(eq(schema.todos.listId, listId), eq(schema.todos.done, args.done ? 1 : 0))
          : eq(schema.todos.listId, listId)
      const todos = await db
        .select()
        .from(schema.todos)
        .where(conditions)
        .orderBy(schema.todos.id)
      return ok(id, textResult(todos.map(toTodo)))
    }
    case 'get_todo': {
      if (typeof args.id !== 'number') return fail(id, -32602, 'id must be a number')
      const userId = await resolveUserId(db, props)
      if (userId === null) return ok(id, toolError('Todo not found'))
      const rows = await db
        .select({ todo: schema.todos })
        .from(schema.todos)
        .innerJoin(schema.lists, eq(schema.todos.listId, schema.lists.id))
        .where(and(eq(schema.todos.id, args.id), eq(schema.lists.userId, userId)))
        .limit(1)
      if (rows.length === 0) return ok(id, toolError('Todo not found'))
      return ok(id, textResult(toTodo(rows[0].todo)))
    }
    default:
      return fail(id, -32602, `unknown tool: ${params.name}`)
  }
}
