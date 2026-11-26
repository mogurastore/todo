import { createMcpHandler } from '@modelcontextprotocol/server'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { renderer } from './renderer'
import { createMcpServer } from './mcp'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

const mcpHandler = createMcpHandler(() => createMcpServer())

app.all('/mcp', (c: Context) => {
  const parsed = c.req.raw.clone().json().catch(() => undefined)
  return parsed.then((parsedBody) => mcpHandler.fetch(c.req.raw, { parsedBody }))
})

export default app
