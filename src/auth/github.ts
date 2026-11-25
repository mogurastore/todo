export function githubAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
  scope?: string
}): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  url.searchParams.set('scope', opts.scope ?? 'read:user user:email')
  return url.toString()
}

export async function exchangeGitHubCode(
  opts: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string }> {
  const res = await fetchFn('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`github token exchange failed: ${res.status}`)
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!data.access_token) throw new Error(`github token exchange failed: ${data.error ?? 'no token'}`)
  return { accessToken: data.access_token }
}

export async function fetchGitHubUser(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ providerUserId: string }> {
  const res = await fetchFn('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`github user fetch failed: ${res.status}`)
  const data = (await res.json()) as { id: number | string }
  return { providerUserId: String(data.id) }
}
