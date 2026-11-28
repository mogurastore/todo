export const DEFAULT_LIST_ID = 'default'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export type RepeatRule = {
  unit: RepeatUnit
  interval: number
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

export function getNextDueDate(dueDate: string, repeat: RepeatRule): string {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (repeat.unit === 'day') {
    const dt = new Date(Date.UTC(y, m - 1, d + repeat.interval))
    return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (repeat.unit === 'week') {
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
    return (t as Todo).repeat ?? null
  }
  return {
    clear() {
      map.clear()
    },
    async list(userId) {
      return [...map.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({ ...t, dueDate: readDueDate(t as Todo), focusDate: readFocusDate(t as Todo), repeat: readRepeat(t as Todo) }))
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
        repeat: repeat ?? null,
      }
      map.set(todo.id, todo)
      return todo
    },
    async update(userId, id, patch) {
      const t = map.get(id)
      if (!t || t.userId !== userId) return null
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) : t.title
      const finalDueDate = patch.dueDate !== undefined ? normalizeNullable(patch.dueDate) : readDueDate(t as Todo)
      const finalRepeat = patch.repeat !== undefined ? patch.repeat : readRepeat(t as Todo)
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
        }
        map.set(created.id, created)
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
