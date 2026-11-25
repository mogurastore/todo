import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { exchangeGitHubCode, fetchGitHubUser, githubAuthorizeUrl } from './auth/github'
import * as schema from './db/schema'
import { ensureUserWithDefaultList } from './db/signup'
import { handleMcpRequest, type McpProps } from './mcp/handler'
import { renderer } from './renderer'

type AppEnv = {
  DB: D1Database
  OAUTH_KV: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<never>
    lookupClient(clientId: string): Promise<null | { name?: string }>
    // biome-ignore lint/suspicious/noExplicitAny: provider-injected helpers
    [key: string]: any
  }
}

export const app = new Hono<{ Bindings: AppEnv }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

app.get('/authorize', async (c) => {
  const oauth = c.env.OAUTH_PROVIDER as never as {
    parseAuthRequest(request: Request): Promise<{ clientId: string }>
    lookupClient(clientId: string): Promise<{ name?: string } | null>
    beginConsent(request: unknown): Promise<{ handle: string; headers: Headers }>
  }
  const request = await oauth.parseAuthRequest(c.req.raw)
  const client = await oauth.lookupClient(request.clientId)
  const consent = await oauth.beginConsent(request)
  const name = (client?.name ?? request.clientId).replace(/</g, '&lt;')
  return new Response(
    `<html><body><h1>Authorize ${name}?</h1>` +
      `<form method="post"><input type="hidden" name="handle" value="${consent.handle}"/>` +
      `<button type="submit">Allow</button></form></body></html>`,
    { headers: { ...Object.fromEntries(consent.headers), 'content-type': 'text/html' } },
  )
})

app.post('/authorize', async (c) => {
  const oauth = c.env.OAUTH_PROVIDER as never as {
    approveConsent(request: Request, handle: string): Promise<{ request: unknown; headers: Headers }>
    beginUpstream(request: unknown, opts: { data: unknown; headers: Headers }): Promise<{
      state: string
      headers: Headers
    }>
  }
  const form = await c.req.formData()
  const approved = await oauth.approveConsent(c.req.raw, String(form.get('handle')))
  const { state, headers } = await oauth.beginUpstream(approved.request, {
    data: {},
    headers: approved.headers,
  })
  const redirectUri = new URL('/callback', c.req.url).toString()
  headers.set(
    'Location',
    githubAuthorizeUrl({
      clientId: c.env.GITHUB_CLIENT_ID,
      redirectUri,
      state,
      scope: 'read:user',
    }),
  )
  return new Response(null, { status: 302, headers })
})

app.get('/callback', async (c) => {
  const oauth = c.env.OAUTH_PROVIDER as never as {
    finishUpstream<T>(request: Request): Promise<{ request: unknown; data: T; headers: Headers }>
    completeAuthorization(opts: {
      request: unknown
      userId: string
      scope: string[]
      props: unknown
    }): Promise<{ redirectTo: string }>
  }
  const url = new URL(c.req.url)
  if (url.searchParams.get('error')) {
    return c.text(`github auth failed: ${url.searchParams.get('error')}`, 400)
  }
  const { request: original, headers } = await oauth.finishUpstream<unknown>(c.req.raw)
  const code = url.searchParams.get('code')
  if (!code) return c.text('missing code', 400)
  const redirectUri = new URL('/callback', c.req.url).toString()
  const { accessToken } = await exchangeGitHubCode({
    code,
    clientId: c.env.GITHUB_CLIENT_ID,
    clientSecret: c.env.GITHUB_CLIENT_SECRET,
    redirectUri,
  })
  const { providerUserId } = await fetchGitHubUser(accessToken)
  const database = drizzle(c.env.DB, { schema })
  await ensureUserWithDefaultList(database, { provider: 'github', providerUserId })
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: `github:${providerUserId}`,
    scope: [],
    props: { provider: 'github', providerUserId },
  })
  headers.set('Location', redirectTo)
  return new Response(null, { status: 302, headers })
})

export const mcpApiHandler = {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    if (request.method !== 'POST') {
      return Response.json(
        { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'POST only' } },
        { status: 405 },
      )
    }
    const props = (ctx as unknown as { props?: McpProps }).props
    if (!props) return new Response('unauthorized', { status: 401 })
    const db = drizzle(env.DB, { schema })
    return handleMcpRequest(db, props, await request.json())
  },
}

export default new OAuthProvider<AppEnv>({
  apiRoute: '/mcp',
  apiHandler: mcpApiHandler as never,
  defaultHandler: app as never,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: ['mcp:read', 'mcp:write', 'offline_access'],
  // TODO: 本番デプロイ時のドメインに合わせる（wrangler dev/多数環境では要見直し）
  resourceMetadata: {
    resource: 'https://todo.mogurastore.workers.dev/mcp',
    authorization_servers: ['https://todo.mogurastore.workers.dev'],
  },
})
