import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('Worker 統合テスト', () => {
  it('GET / が 200 と Hello! を返す', async () => {
    const res = await exports.default.fetch('http://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello!')
  })
})
