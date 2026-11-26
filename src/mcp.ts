import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

export function createMcpServer() {
  const server = new McpServer({ name: 'todo', version: '0.1.0' })
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
  return server
}
