export const DEFAULT_LIST_ID = 'default'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export type RepeatRule = {
  unit: RepeatUnit
  interval: number
  byWeekday?: number[]
}

export type Todo = {
  id: string
  userId: number
  listId: string
  title: string
  done: boolean
  createdAt: number
  dueDate: string | null
  focusDate: string | null
  repeat: RepeatRule | null
  spawnedFromId: string | null
}

// 繰り返しは後付け。旧行にフィールドが無くても
// `repeat ?? null` で読めば移行不要。

export type TodoPatch = {
  title?: string
  done?: boolean
  dueDate?: string | null
  focusDate?: string | null
  repeat?: RepeatRule | null
}

export function getJstTodayString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function formatYmd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function normalizeByWeekday(v: unknown): number[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) return undefined
  const uniq = [...new Set(v.filter((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6) as number[])]
  uniq.sort((a, b) => a - b)
  return uniq
}

export function getNextDueDate(dueDate: string, repeat: RepeatRule): string {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (repeat.unit === 'day') {
    const dt = new Date(Date.UTC(y, m - 1, d + repeat.interval))
    return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (repeat.unit === 'week') {
    const days = normalizeByWeekday(repeat.byWeekday)
    if (days && days.length > 0) {
      const base = Date.UTC(y, m - 1, d)
      const baseDay = new Date(base).getUTCDay()
      const baseSunday = base - baseDay * 86400000
      const maxOffset = repeat.interval * 7 + 7
      for (let offset = 1; offset <= maxOffset; offset++) {
        const cand = new Date(base + offset * 86400000)
        const w = cand.getUTCDay()
        if (!days.includes(w)) continue
        const candSunday = cand.getTime() - w * 86400000
        const weekDiff = Math.round((candSunday - baseSunday) / 86400000 / 7)
        if (weekDiff % repeat.interval === 0) {
          return formatYmd(cand.getUTCFullYear(), cand.getUTCMonth() + 1, cand.getUTCDate())
        }
      }
      throw new Error('no next weekday found')
    }
    const dt = new Date(Date.UTC(y, m - 1, d + repeat.interval * 7))
    return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (repeat.unit === 'month') {
    const total = m - 1 + repeat.interval
    const y2 = y + Math.floor(total / 12)
    const m2 = (total % 12) + 1
    const d2 = Math.min(d, lastDayOfMonth(y2, m2))
    return formatYmd(y2, m2, d2)
  }
  const y2 = y + repeat.interval
  const d2 = Math.min(d, lastDayOfMonth(y2, m))
  return formatYmd(y2, m, d2)
}

export type TodoStore = {
  list(userId: number): Promise<Todo[]>
  create(userId: number, title: string, dueDate?: string | null, focusDate?: string | null, repeat?: RepeatRule | null): Promise<Todo>
  update(userId: number, id: string, patch: TodoPatch): Promise<Todo | null>
  remove(userId: number, id: string): Promise<boolean>
}

export function createMemoryTodoStore(): TodoStore & { clear(): void } {
  const map = new Map<string, Todo>()
  function normalizeNullable(v: string | null | undefined): string | null {
    return v === '' || v === undefined ? null : v
  }
  function readDueDate(t: Todo): string | null {
    return normalizeNullable(t.dueDate)
  }
  function readFocusDate(t: Todo): string | null {
    return normalizeNullable((t as Todo).focusDate)
  }
  function readRepeat(t: Todo): RepeatRule | null {
    const r = (t as Todo).repeat ?? null
    if (!r) return null
    return normalizeRepeat(r)
  }
  function normalizeRepeat(r: RepeatRule | null | undefined): RepeatRule | null {
    if (!r) return null
    const days = normalizeByWeekday((r as RepeatRule).byWeekday)
    if (days === undefined) return { unit: r.unit, interval: r.interval }
    return { unit: r.unit, interval: r.interval, byWeekday: days }
  }
  function readSpawnedFromId(t: Todo): string | null {
    return (t as Todo).spawnedFromId ?? null
  }
  return {
    clear() {
      map.clear()
    },
    async list(userId) {
      return [...map.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({ ...t, dueDate: readDueDate(t as Todo), focusDate: readFocusDate(t as Todo), repeat: readRepeat(t as Todo), spawnedFromId: readSpawnedFromId(t as Todo) }))
    },
    async create(userId, title, dueDate, focusDate, repeat) {
      const now = Date.now()
      const todo: Todo = {
        id: crypto.randomUUID(),
        userId,
        listId: DEFAULT_LIST_ID,
        title: title.trim(),
        done: false,
        createdAt: now,
        dueDate: normalizeNullable(dueDate),
        focusDate: normalizeNullable(focusDate),
        repeat: normalizeRepeat(repeat ?? null),
        spawnedFromId: null,
      }
      map.set(todo.id, todo)
      return todo
    },
    async update(userId, id, patch) {
      const t = map.get(id)
      if (!t || t.userId !== userId) return null
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) : t.title
      const finalDueDate = patch.dueDate !== undefined ? normalizeNullable(patch.dueDate) : readDueDate(t as Todo)
      const finalRepeat = normalizeRepeat(patch.repeat !== undefined ? patch.repeat : readRepeat(t as Todo))
      const next = {
        ...t,
        title: title || t.title,
        done: patch.done ?? t.done,
        dueDate: finalDueDate,
        focusDate: patch.focusDate !== undefined ? normalizeNullable(patch.focusDate) : readFocusDate(t as Todo),
        repeat: finalRepeat,
      }
      map.set(id, next)
      if (!t.done && next.done && finalRepeat && finalDueDate) {
        const already = [...map.values()].some((x) => x.userId === userId && x.spawnedFromId === id)
        if (!already) {
          const created: Todo = {
            id: crypto.randomUUID(),
            userId,
            listId: next.listId,
            title: next.title,
            done: false,
            createdAt: Date.now(),
            dueDate: getNextDueDate(finalDueDate, finalRepeat),
            focusDate: null,
            repeat: finalRepeat,
            spawnedFromId: id,
          }
          map.set(created.id, created)
        }
      }
      return next
    },
    async remove(userId, id) {
      const t = map.get(id)
      if (!t || t.userId !== userId) return false
      map.delete(id)
      return true
    },
  }
}
