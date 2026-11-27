import { createMcpHandler } from '@modelcontextprotocol/server'
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

function getOrigin(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin
}

function isSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === 'https:'
}

type Bindings = CloudflareBindings & AuthEnv

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

app.get('/', async (c) => {
  const sessionToken = getCookie(c, 'session')
  const user = sessionToken ? await getCookieSessionUser(c) : null
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

const mcpHandler = createMcpHandler(() => createMcpServer())

app.use('/mcp', async (c, next) => {
  const token = extractBearerToken(c)
  if (!token) return next()
  const user = await getBearerSessionUser(c)
  if (!user) return c.text('unauthorized', 401)
  await next()
})

app.all('/mcp', (c: Context) => {
  const parsed = c.req.raw.clone().json().catch(() => undefined)
  return parsed.then((parsedBody) => mcpHandler.fetch(c.req.raw, { parsedBody }))
})

export default app
