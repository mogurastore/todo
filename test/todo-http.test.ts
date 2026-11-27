import { describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { signSession } from '../src/auth'

const env = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  SESSION_SECRET: 'test-session-secret-0123456789',
}

async function cookieFor(userId: number, login: string) {
  const token = await signSession({ login, id: userId }, env.SESSION_SECRET)
  return `session=${token}`
}

function extractFirstToggleId(html: string): string | null {
  return /\/todos\/([^/"]+)\/toggle/.exec(html)?.[1] ?? null
}

const formHeaders = (cookie: string) => ({
  Cookie: cookie,
  'Content-Type': 'application/x-www-form-urlencoded',
})

describe('Todo HTTP seam (B表示)', () => {
  it('追加→一覧→完了→削除が回る', async () => {
    const uid = 71001 + Math.floor(Math.random() * 10000)
    const cookie = await cookieFor(uid, `u${uid}`)
    const title = `買い物 ${uid}`

    let res = await app.request('/', { headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('デフォルト')

    res = await app.request(
      '/todos',
      { method: 'POST', headers: formHeaders(cookie), body: new URLSearchParams({ title }) },
      env
    )
    expect(res.status).toBe(302)

    let html = await (await app.request('/', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain(title)
    const id = extractFirstToggleId(html)
    expect(id).toBeTruthy()

    res = await app.request(
      `/todos/${id}/toggle`,
      { method: 'POST', headers: formHeaders(cookie), body: new URLSearchParams({ done: '1' }) },
      env
    )
    expect(res.status).toBe(302)
    html = await (await app.request('/?filter=done', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain(title)

    res = await app.request(
      `/todos/${id}/delete`,
      { method: 'POST', headers: formHeaders(cookie), body: new URLSearchParams({}) },
      env
    )
    expect(res.status).toBe(302)
    html = await (await app.request('/', { headers: { Cookie: cookie } }, env)).text()
    expect(html).not.toContain(title)
  })

  it('他人には見えず、他人IDの更新も効かない', async () => {
    const a = 72001 + Math.floor(Math.random() * 10000)
    const b = 73001 + Math.floor(Math.random() * 10000)
    const cookieA = await cookieFor(a, `a${a}`)
    const cookieB = await cookieFor(b, `b${b}`)
    const title = `秘密 ${a}`

    await app.request(
      '/todos',
      { method: 'POST', headers: formHeaders(cookieA), body: new URLSearchParams({ title }) },
      env
    )
    const htmlB = await (await app.request('/', { headers: { Cookie: cookieB } }, env)).text()
    expect(htmlB).not.toContain(title)

    const htmlA = await (await app.request('/', { headers: { Cookie: cookieA } }, env)).text()
    const id = extractFirstToggleId(htmlA)
    expect(id).toBeTruthy()
    await app.request(
      `/todos/${id}/toggle`,
      { method: 'POST', headers: formHeaders(cookieB), body: new URLSearchParams({ done: '1' }) },
      env
    )
    const htmlAAfter = await (await app.request('/', { headers: { Cookie: cookieA } }, env)).text()
    expect(htmlAAfter).toContain(title)
    expect(htmlAAfter).not.toContain(`<s>${title}</s>`)
  })

  it('未ログインのPOSTは/に返す', async () => {
    const res = await app.request(
      '/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ title: 'x' }),
      },
      env
    )
    expect(res.status).toBe(302)
  })
})
