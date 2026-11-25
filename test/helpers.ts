import { env } from 'cloudflare:test'
import migrationSql from '../drizzle/0001_init.sql'

export function testD1() {
  const d1 = (env as unknown as { DB: D1Database }).DB
  if (!d1) throw new Error('DB binding missing')
  return d1
}

export async function applyMigrations(): Promise<void> {
  const d1 = testD1()
  const statements = migrationSql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const stmt of statements) {
    await d1.prepare(stmt).run()
  }
}
