export const DEFAULT_LIST_ID = 'default'

export type Todo = {
  id: string
  userId: number
  listId: string
  title: string
  done: boolean
  createdAt: number
  dueDate: string | null
  focusDate: string | null
}

// 繰り返しは後付けにする。旧行にフィールドが無くても
// `repeat ?? null` で読めば移行不要のため、今は型にも持たない。

export type TodoPatch = {
  title?: string
  done?: boolean
  dueDate?: string | null
  focusDate?: string | null
}

export function getJstTodayString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type TodoStore = {
  list(userId: number): Promise<Todo[]>
  create(userId: number, title: string, dueDate?: string | null, focusDate?: string | null): Promise<Todo>
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
  return {
    clear() {
      map.clear()
    },
    async list(userId) {
      return [...map.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({ ...t, dueDate: readDueDate(t as Todo), focusDate: readFocusDate(t as Todo) }))
    },
    async create(userId, title, dueDate, focusDate) {
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
      }
      map.set(todo.id, todo)
      return todo
    },
    async update(userId, id, patch) {
      const t = map.get(id)
      if (!t || t.userId !== userId) return null
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) : t.title
      const next = {
        ...t,
        title: title || t.title,
        done: patch.done ?? t.done,
        dueDate: patch.dueDate !== undefined ? normalizeNullable(patch.dueDate) : readDueDate(t as Todo),
        focusDate: patch.focusDate !== undefined ? normalizeNullable(patch.focusDate) : readFocusDate(t as Todo),
      }
      map.set(id, next)
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
