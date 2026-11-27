import { sign, verify } from 'hono/jwt'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

export type AuthEnv = {
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  SESSION_SECRET?: string
}

export type SessionPayload = {
  login: string
  id: number
  avatar_url?: string
  exp?: number
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  return sign({ ...payload, exp }, secret, 'HS256')
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const decoded = (await verify(token, secret, 'HS256')) as SessionPayload
    if (!decoded.login || typeof decoded.id !== 'number') return null
    return decoded
  } catch {
    return null
  }
}

export async function getCookieSessionUser(c: Context<{ Bindings: AuthEnv }>): Promise<SessionPayload | null> {
  const secret = (c.env as AuthEnv | undefined)?.SESSION_SECRET
  if (!secret) return null
  const token = getCookie(c, 'session')
  if (!token) return null
  return verifySession(token, secret)
}

export function buildLoginUrl(clientId: string, redirectUri: string, state: string, scope = 'read:user'): string {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope, state })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

export function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!data.access_token) throw new Error(`token exchange failed: ${data.error ?? 'no token'}`)
  return data.access_token
}

export async function fetchGitHubUser(accessToken: string): Promise<{ login: string; id: number; avatar_url: string }> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'todo-app' },
  })
  if (!res.ok) throw new Error(`github user fetch failed: ${res.status}`)
  return (await res.json()) as { login: string; id: number; avatar_url: string }
}
