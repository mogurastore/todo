export const DEFAULT_LIST_ID = 'default'

export type Todo = {
  id: string
  userId: number
  listId: string
  title: string
  done: boolean
  createdAt: number
  dueDate: string | null
}

// 繰り返しは後付けにする。旧行にフィールドが無くても
// `repeat ?? null` で読めば移行不要のため、今は型にも持たない。

export type TodoPatch = {
  title?: string
  done?: boolean
  dueDate?: string | null
}

export type TodoStore = {
  list(userId: number): Promise<Todo[]>
  create(userId: number, title: string, dueDate?: string | null): Promise<Todo>
  update(userId: number, id: string, patch: TodoPatch): Promise<Todo | null>
  remove(userId: number, id: string): Promise<boolean>
}

export function createMemoryTodoStore(): TodoStore & { clear(): void } {
  const map = new Map<string, Todo>()
  function normalizeDueDate(v: string | null | undefined): string | null {
    return v === '' || v === undefined ? null : v
  }
  function readDueDate(t: Todo): string | null {
    return normalizeDueDate(t.dueDate)
  }
  return {
    clear() {
      map.clear()
    },
    async list(userId) {
      return [...map.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((t) => ({ ...t, dueDate: readDueDate(t as Todo) }))
    },
    async create(userId, title, dueDate) {
      const now = Date.now()
      const todo: Todo = {
        id: crypto.randomUUID(),
        userId,
        listId: DEFAULT_LIST_ID,
        title: title.trim(),
        done: false,
        createdAt: now,
        dueDate: normalizeDueDate(dueDate),
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
        dueDate: patch.dueDate !== undefined ? normalizeDueDate(patch.dueDate) : readDueDate(t as Todo),
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
