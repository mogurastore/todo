import { createMcpHandler } from '@modelcontextprotocol/server'
import OAuthProvider, { AuthorizationError } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { renderer } from './renderer'
import { createMcpServer } from './mcp'
import { createMemoryTodoStore, type Todo } from './todo'
import {
  buildLoginUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
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

const memoryTodos = createMemoryTodoStore()

function getTodoStore() {
  return memoryTodos
}

async function requireUser(c: { req: { header(n: string): string | undefined } }): Promise<{ login: string; id: number; avatar_url?: string } | null> {
  const sessionToken = getCookie(c as never, 'session')
  if (!sessionToken) return null
  return getCookieSessionUser(c as never)
}

function TodoB({ todos }: { todos: Todo[] }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <nav style={{ minWidth: 140, borderRight: '1px solid #ccc', paddingRight: 8 }}>
          <h3>リスト</h3>
          <ul>
            <li>デフォルト</li>
          </ul>
        </nav>
        <div style={{ flex: 1 }}>
          <h2>デフォルト</h2>
          <form method="post" action="/todos">
            <input type="text" name="title" placeholder="新しいTodo" maxlength={200} style={{ width: '60%' }} />
            <button type="submit">追加</button>
          </form>
          {todos.length === 0 ? (
            <p>Todoはありません</p>
          ) : (
            <ul>
              {todos.map((t) => (
                <li key={t.id}>
                  <form method="post" action={`/todos/${t.id}/toggle`} style={{ display: 'inline' }}>
                    <input type="hidden" name="done" value={t.done ? '0' : '1'} />
                    <button type="submit">{t.done ? '戻す' : '完了'}</button>
                  </form>{' '}
                  {t.done ? <s>{t.title}</s> : t.title}{' '}
                  <form method="post" action={`/todos/${t.id}/delete`} style={{ display: 'inline' }}>
                    <button type="submit">削除</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

app.get('/', async (c) => {
  const user = await requireUser(c)
  if (!user) {
    return c.render(
      <div>
        <h1>Todo</h1>
        <a href="/auth/login">GitHubでログイン</a>
      </div>
    )
  }
  const todos = await getTodoStore().list(user.id)
  return c.render(
    <div>
      <h1>Todo</h1>
      <p>
        {user.avatar_url ? <img src={user.avatar_url} alt="" width={32} height={32} /> : null} {user.login}
      </p>
      <p>
        <a href="/auth/logout">ログアウト</a>
      </p>
      <TodoB todos={todos} />
    </div>
  )
})

app.post('/todos', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.redirect('/', 302)
  const form = await c.req.raw.formData()
  const title = String(form.get('title') ?? '').trim().slice(0, 200)
  if (title) await getTodoStore().create(user.id, title)
  return c.redirect('/', 302)
})

app.post('/todos/:id/toggle', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.redirect('/', 302)
  const form = await c.req.raw.formData()
  const done = String(form.get('done') ?? '1') === '1'
  await getTodoStore().update(user.id, c.req.param('id'), { done })
  return c.redirect(c.req.header('referer') ?? '/', 302)
})

app.post('/todos/:id/delete', async (c) => {
  const user = await requireUser(c)
  if (!user) return c.redirect('/', 302)
  await getTodoStore().remove(user.id, c.req.param('id'))
  return c.redirect(c.req.header('referer') ?? '/', 302)
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
  if (!clientId || !clientSecret) return c.text('OAuth not configured', 500)
  const oauth = (c.env as unknown as { OAUTH_PROVIDER?: {
    finishUpstream(r: Request): Promise<{ request: { scope: string[] }; headers: Headers }>
    completeAuthorization(o: { request: unknown; userId: string; metadata: unknown; scope: string[]; props: unknown }): Promise<{ redirectTo: string }>
  } }).OAUTH_PROVIDER
  if (oauth) {
    try {
      const { request: original, headers } = await oauth.finishUpstream(c.req.raw)
      const url = new URL(c.req.url)
      if (url.searchParams.get('error')) {
        const out = new Headers(headers)
        out.set('Content-Type', 'text/plain; charset=utf-8')
        return new Response(`upstream error: ${url.searchParams.get('error')}`, { status: 400, headers: out })
      }
      const code = url.searchParams.get('code')
      if (code) {
        const redirectUri = `${getOrigin(c)}/auth/callback`
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
      }
    } catch (e) {
      if (e instanceof AuthorizationError) {
        if (e.redirectTo) return c.redirect(e.redirectTo, 302)
      }
    }
  }
  if (!sessionSecret) return c.text('OAuth not configured', 500)
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
    const redirectUri = `${getOrigin(c)}/auth/callback`
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

function buildOAuthProvider(request: Request) {
  const origin = new URL(request.url).origin
  const resource = `${origin}/mcp`
  const mcpApiHandler = {
    fetch: (req: Request, _env: unknown, ctx: unknown) => {
      const props = (ctx as { props?: { login: string; id: number; avatar_url?: string } })?.props
      const handler = createMcpHandler(() =>
        createMcpServer(props as { login: string; id: number; avatar_url?: string } | undefined, getTodoStore())
      )
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
