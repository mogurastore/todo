// OAUTH_KVに注入するKVNamespaceのインメモリstub。
// `get(key, { type: 'json' })` はJSONとして解釈する（本物のKVと同等）。
export function createKV() {
  const store = new Map<string, string>()
  return {
    async get(k: string, t?: unknown) {
      const v = store.get(k) ?? null
      if (v === null) return null
      const type = typeof t === 'string' ? t : (t as { type?: string } | undefined)?.type
      if (type === 'json') {
        try { return JSON.parse(v) } catch { return v }
      }
      return v
    },
    async put(k: string, v: string) { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)) },
    async delete(k: string) { store.delete(k) },
    async list() { return { keys: [], list_complete: true, cursor: '' } },
  }
}
