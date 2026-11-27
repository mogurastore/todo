export const DEFAULT_LIST_ID = 'default'

export type Todo = {
  id: string
  userId: number
  listId: string
  title: string
  done: boolean
  createdAt: number
}

// 繰り返しは後付けにする。旧行にフィールドが無くても
// `repeat ?? null` で読めば移行不要のため、今は型にも持たない。

export type TodoPatch = {
  title?: string
  done?: boolean
}

export type TodoStore = {
  list(userId: number): Promise<Todo[]>
  create(userId: number, title: string): Promise<Todo>
  update(userId: number, id: string, patch: TodoPatch): Promise<Todo | null>
  remove(userId: number, id: string): Promise<boolean>
}

export function createMemoryTodoStore(): TodoStore & { clear(): void } {
  const map = new Map<string, Todo>()
  return {
    clear() {
      map.clear()
    },
    async list(userId) {
      return [...map.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    async create(userId, title) {
      const now = Date.now()
      const todo: Todo = {
        id: crypto.randomUUID(),
        userId,
        listId: DEFAULT_LIST_ID,
        title: title.trim(),
        done: false,
        createdAt: now,
      }
      map.set(todo.id, todo)
      return todo
    },
    async update(userId, id, patch) {
      const t = map.get(id)
      if (!t || t.userId !== userId) return null
      const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) : t.title
      const next = { ...t, title: title || t.title, done: patch.done ?? t.done }
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
