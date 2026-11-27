import { createMcpHandler } from '@modelcontextprotocol/server'
import OAuthProvider, { AuthorizationError } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { renderer } from './renderer'
import { createMcpServer } from './mcp'
import {
  buildLoginUrl,
  exchangeCodeForToken,
  extractBearerToken,
  fetchGitHubUser,
  getBearerSessionUser,
  getCookieSessionUser,
  randomState,
  SESSION_MAX_AGE,
  signSession,
  type AuthEnv,
} from './auth'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

function getOrigin(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin
}

function isSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === 'https:'
}

type Bindings = CloudflareBindings & AuthEnv & { OAUTH_KV?: KVNamespace }

export const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

app.get('/', async (c) => {
  const sessionToken = getCookie(c, 'session')
  const user = sessionToken ? await getCookieSessionUser(c as never) : null
  if (!user || !sessionToken) {
    return c.render(
      <div>
        <h1>Todo</h1>
        <a href="/auth/login">GitHubでログイン</a>
      </div>
    )
  }
  return c.render(
    <div>
      <h1>Todo</h1>
      <p>
        {user.avatar_url ? <img src={user.avatar_url} alt="" width={32} height={32} /> : null} {user.login}
      </p>
      <p>
        <a href="/auth/logout">ログアウト</a>
      </p>
      <details>
        <summary>MCP用トークン</summary>
        <code>{sessionToken}</code>
      </details>
    </div>
  )
})

app.get('/auth/login', (c) => {
  const clientId = (c.env as AuthEnv | undefined)?.GITHUB_CLIENT_ID
  if (!clientId) return c.text('GITHUB_CLIENT_ID not configured', 500)
  const redirectUri = `${getOrigin(c)}/auth/callback`
  const state = randomState()
  setCookie(c, 'oauth_state', state, { httpOnly: true, path: '/', maxAge: 600, sameSite: 'Lax', secure: isSecure(c) })
  return c.redirect(buildLoginUrl(clientId, redirectUri, state), 302)
})

app.get('/auth/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.redirect('/', 302)
})

app.get('/auth/callback', async (c) => {
  const env = (c.env ?? {}) as AuthEnv
  const clientId = env.GITHUB_CLIENT_ID
  const clientSecret = env.GITHUB_CLIENT_SECRET
  const sessionSecret = env.SESSION_SECRET
  if (!clientId || !clientSecret || !sessionSecret) return c.text('OAuth not configured', 500)
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  if (!code || !state || !storedState || state !== storedState) return c.text('invalid state', 400)
  const redirectUri = `${getOrigin(c)}/auth/callback`
  try {
    const accessToken = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const ghUser = await fetchGitHubUser(accessToken)
    const session = await signSession(
      { login: ghUser.login, id: ghUser.id, avatar_url: ghUser.avatar_url },
      sessionSecret
    )
    setCookie(c, 'session', session, {
      httpOnly: true,
      path: '/',
      maxAge: SESSION_MAX_AGE,
      sameSite: 'Lax',
      secure: isSecure(c),
    })
    deleteCookie(c, 'oauth_state', { path: '/' })
    return c.redirect('/', 302)
  } catch (e) {
    return c.text(`auth failed: ${(e as Error).message}`, 502)
  }
})

app.get('/authorize', async (c) => {
  const helpers = (c.env as unknown as { OAUTH_PROVIDER: {
    parseAuthRequest(r: Request): Promise<unknown>
    lookupClient(id: string): Promise<{ clientName?: string } | null>
    beginConsent(r: unknown): Promise<{ handle: string; headers: Headers }>
  } }).OAUTH_PROVIDER
  if (!helpers) return c.text('oauth not configured', 500)
  try {
    const req = (await helpers.parseAuthRequest(c.req.raw)) as {
      clientId: string
      scope: string[]
      redirectUri: string
    }
    const client = await helpers.lookupClient(req.clientId)
    if (!client) return c.text('unknown client', 400)
    const { handle, headers } = await helpers.beginConsent(req as never)
    const out = new Headers(headers)
    out.set('Content-Type', 'text/html; charset=utf-8')
    const html = `<!doctype html><html><body><h1>承認</h1><p>${escapeHtml(client.clientName ?? req.clientId)}</p><p>${escapeHtml(req.redirectUri)}</p><p>${escapeHtml(req.scope.join(' '))}</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}" /><button type="submit" name="approve" value="1">許可</button></form></body></html>`
    return new Response(html, { status: 200, headers: out })
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.redirectTo) return c.redirect(e.redirectTo, 302)
      return c.text(e.description, 400)
    }
    throw e
  }
})

app.post('/authorize', async (c) => {
  const env = c.env as Bindings & { OAUTH_PROVIDER: {
    approveConsent(r: Request, handle: string): Promise<{ request: unknown; headers: Headers }>
    beginUpstream(r: unknown, o?: { headers?: Headers }): Promise<{ state: string; headers: Headers }>
  } }
  const oauth = env.OAUTH_PROVIDER
  if (!oauth) return c.text('oauth not configured', 500)
  const clientId = (c.env as AuthEnv | undefined)?.GITHUB_CLIENT_ID
  if (!clientId) return c.text('GITHUB_CLIENT_ID not configured', 500)
  const form = await c.req.raw.formData()
  const handle = String(form.get('handle') ?? '')
  if (!handle) return c.text('missing handle', 400)
  try {
    const approved = await oauth.approveConsent(c.req.raw, handle)
    const { state, headers } = await oauth.beginUpstream(approved.request, { headers: approved.headers })
    const redirectUri = `${getOrigin(c)}/oauth/callback`
    const out = new Headers(headers)
    out.set('Location', buildLoginUrl(clientId, redirectUri, state))
    return new Response(null, { status: 302, headers: out })
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.redirectTo) return c.redirect(e.redirectTo, 302)
      return c.text(e.description, 400)
    }
    throw e
  }
})

app.get('/oauth/callback', async (c) => {
  const env = c.env as Bindings & { OAUTH_PROVIDER: {
    finishUpstream(r: Request): Promise<{ request: { scope: string[] }; headers: Headers }>
    completeAuthorization(o: { request: unknown; userId: string; metadata: unknown; scope: string[]; props: unknown }): Promise<{ redirectTo: string }>
  } }
  const oauth = env.OAUTH_PROVIDER
  if (!oauth) return c.text('oauth not configured', 500)
  const clientId = (c.env as AuthEnv | undefined)?.GITHUB_CLIENT_ID
  const clientSecret = (c.env as AuthEnv | undefined)?.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return c.text('OAuth not configured', 500)
  try {
    const { request: original, headers } = await oauth.finishUpstream(c.req.raw)
    const url = new URL(c.req.url)
    if (url.searchParams.get('error')) {
      const out = new Headers(headers)
      out.set('Content-Type', 'text/plain; charset=utf-8')
      return new Response(`upstream error: ${url.searchParams.get('error')}`, { status: 400, headers: out })
    }
    const code = url.searchParams.get('code')
    if (!code) return c.text('missing code', 400)
    const redirectUri = `${getOrigin(c)}/oauth/callback`
    const accessToken = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri)
    const ghUser = await fetchGitHubUser(accessToken)
    const { redirectTo } = await oauth.completeAuthorization({
      request: original,
      userId: String(ghUser.id),
      metadata: {},
      scope: original.scope,
      props: { login: ghUser.login, id: ghUser.id, avatar_url: ghUser.avatar_url },
    })
    const out = new Headers(headers)
    out.set('Location', redirectTo)
    return new Response(null, { status: 302, headers: out })
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.redirectTo) return c.redirect(e.redirectTo, 302)
      return c.text(e.description, 400)
    }
    return c.text(`auth failed: ${(e as Error).message}`, 502)
  }
})

const mcpHandler = createMcpHandler(() => createMcpServer())

app.use('/mcp', async (c, next) => {
  const token = extractBearerToken(c)
  if (!token) return next()
  const user = await getBearerSessionUser(c as never)
  if (!user) return c.text('unauthorized', 401)
  await next()
})

app.all('/mcp', (c: Context) => {
  const parsed = c.req.raw.clone().json().catch(() => undefined)
  return parsed.then((parsedBody) => mcpHandler.fetch(c.req.raw, { parsedBody }))
})

function buildOAuthProvider(request: Request) {
  const origin = new URL(request.url).origin
  const resource = `${origin}/mcp`
  const mcpApiHandler = {
    fetch: (req: Request, _env: unknown, ctx: unknown) => {
      const props = (ctx as { props?: { login: string; id: number; avatar_url?: string } })?.props
      const handler = createMcpHandler(() => createMcpServer(props as { login: string; id: number; avatar_url?: string } | undefined))
      return handler.fetch(req)
    },
  }
  return new OAuthProvider({
    apiRoute: '/mcp',
    apiHandler: mcpApiHandler as never,
    defaultHandler: app as never,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    scopesSupported: ['mcp:read', 'mcp:write', 'offline_access'],
    resourceMetadata: {
      resource,
      authorization_servers: [origin],
    },
    requiredScopes: ['mcp:read'],
  })
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return buildOAuthProvider(request).fetch(request, env as never, ctx as never)
  },
}
