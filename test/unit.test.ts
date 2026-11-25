import { describe, expect, it } from 'vitest'
import { app } from '../src/index'

describe('GET /', () => {
  it('200 を返し、Hello! を含むHTMLを返す', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello!')
  })

  it('存在しないパスは 404 を返す', async () => {
    const res = await app.request('/not-found')
    expect(res.status).toBe(404)
  })
})
