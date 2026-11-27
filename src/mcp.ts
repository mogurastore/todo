import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

export type MCPUserProps = {
  login: string
  id: number
  avatar_url?: string
}

export function createMcpServer(props?: MCPUserProps) {
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
  return server
}
