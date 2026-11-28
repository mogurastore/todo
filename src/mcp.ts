import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { createMemoryTodoStore, type TodoStore } from './todo'

export type MCPUserProps = {
  login: string
  id: number
  avatar_url?: string
}

export function createMcpServer(props?: MCPUserProps, store?: TodoStore) {
  const server = new McpServer({ name: 'todo', version: '0.1.0' })
  const todoStore = store ?? createMemoryTodoStore()
  const userId = props?.id
  const unauthorized = () => ({ content: [{ type: 'text' as const, text: 'unauthorized' }], isError: true as const })
  const notFound = () => ({ content: [{ type: 'text' as const, text: 'not found' }], isError: true as const })
  const titleSchema = z
    .string()
    .min(1)
    .max(200)
    .refine((s) => s.trim().length > 0, { message: 'title must not be blank' })
  const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  function isRealDueDate(s: string): boolean {
    if (!DUE_DATE_RE.test(s)) return false
    const [y, m, d] = s.split('-').map(Number)
    if (m < 1 || m > 12 || d < 1 || d > 31) return false
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }
  const dueDateSchema = z
    .string()
    .regex(DUE_DATE_RE, { message: 'dueDate must be YYYY-MM-DD' })
    .refine(isRealDueDate, { message: 'dueDate must be a real date' })
  const dueDateInput = z.preprocess((v) => (v === '' ? null : v), dueDateSchema.nullish())
  server.registerTool(
    'ping',
    {
      description: '接続確認用の最小ツール',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: 'text' as const, text: 'pong' }],
    })
  )
  server.registerTool(
    'whoami',
    {
      description: 'MCP利用者の利用者情報を返す',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(props ?? {}) }],
    })
  )
  server.registerTool(
    'list_todos',
    {
      description: '自分のTodo一覧を返す',
      inputSchema: z.object({ done: z.boolean().optional() }),
    },
    async ({ done }: { done?: boolean }) => {
      if (userId === undefined) return unauthorized()
      const all = await todoStore.list(userId)
      const filtered = done === undefined ? all : all.filter((t) => t.done === done)
      return { content: [{ type: 'text' as const, text: JSON.stringify(filtered) }] }
    }
  )
  server.registerTool(
    'create_todo',
    {
      description: 'Todoを作成する',
      inputSchema: z.object({ title: titleSchema, dueDate: dueDateInput }),
    },
    async ({ title, dueDate }: { title: string; dueDate?: string | null }) => {
      if (userId === undefined) return unauthorized()
      const created = await todoStore.create(userId, title, dueDate ?? null)
      return { content: [{ type: 'text' as const, text: JSON.stringify(created) }] }
    }
  )
  server.registerTool(
    'get_todo',
    {
      description: 'Todoを1件取得する。他人のものは存在を隠すためnot foundにする',
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }: { id: string }) => {
      if (userId === undefined) return unauthorized()
      const all = await todoStore.list(userId)
      const found = all.find((t) => t.id === id)
      if (!found) return notFound()
      return { content: [{ type: 'text' as const, text: JSON.stringify(found) }] }
    }
  )
  server.registerTool(
    'update_todo',
    {
      description: 'Todoのtitle/done/dueDateを更新する。dueDateはnullで解除',
      inputSchema: z.object({
        id: z.string(),
        title: titleSchema.optional(),
        done: z.boolean().optional(),
        dueDate: dueDateInput,
      }),
    },
    async ({ id, title, done, dueDate }: { id: string; title?: string; done?: boolean; dueDate?: string | null }) => {
      if (userId === undefined) return unauthorized()
      const next = await todoStore.update(userId, id, { title, done, dueDate })
      if (!next) return notFound()
      return { content: [{ type: 'text' as const, text: JSON.stringify(next) }] }
    }
  )
  server.registerTool(
    'delete_todo',
    {
      description: 'Todoを削除する',
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }: { id: string }) => {
      if (userId === undefined) return unauthorized()
      const ok = await todoStore.remove(userId, id)
      if (!ok) return notFound()
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id }) }] }
    }
  )
  return server
}
