import { describe, expect, it } from 'vitest'
import { DEFAULT_LIST_ID, createMemoryTodoStore, getNextDueDate } from '../src/todo'

describe('TodoStore seam', () => {
  it('作成時はデフォルトのリストに入り、前後空白を落とす', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, '  牛乳を買う  ')
    expect(t.listId).toBe(DEFAULT_LIST_ID)
    expect(t.title).toBe('牛乳を買う')
    expect(t.done).toBe(false)
  })

  it('listは利用者で分離される', async () => {
    const store = createMemoryTodoStore()
    await store.create(1, 'aのtodo')
    await store.create(2, 'bのtodo')
    const a = await store.list(1)
    expect(a.map((t) => t.title)).toEqual(['aのtodo'])
  })

  it('汎用updateで題名と完了を変えられる', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'before')
    const next = await store.update(1, t.id, { title: 'after', done: true })
    expect(next?.title).toBe('after')
    expect(next?.done).toBe(true)
  })

  it('空題名のupdateは旧題名を保つ', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'keep')
    const next = await store.update(1, t.id, { title: '   ' })
    expect(next?.title).toBe('keep')
  })

  it('他人のtodoはupdate/removeできない', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'mine')
    expect(await store.update(2, t.id, { done: true })).toBeNull()
    expect(await store.remove(2, t.id)).toBe(false)
    expect((await store.list(1)).length).toBe(1)
  })

  it('期限は任意で保持され、nullで解除できる', async () => {
    const store = createMemoryTodoStore()
    const withDate = await store.create(1, 'with', '2026-12-31')
    expect(withDate.dueDate).toBe('2026-12-31')
    const without = await store.create(1, 'without')
    expect(without.dueDate).toBeNull()
    const cleared = await store.update(1, withDate.id, { dueDate: null })
    expect(cleared?.dueDate).toBeNull()
    const kept = await store.update(1, without.id, { done: true })
    expect(kept?.dueDate).toBeNull()
  })

  it('空文字は期限なしとして扱う', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'empty', '')
    expect(t.dueDate).toBeNull()
  })

  it('フォーカス日は任意で保持され、nullで解除できる', async () => {
    const store = createMemoryTodoStore()
    const withFocus = await store.create(1, 'with', null, '2026-11-28')
    expect(withFocus.focusDate).toBe('2026-11-28')
    const without = await store.create(1, 'without')
    expect(without.focusDate).toBeNull()
    const cleared = await store.update(1, withFocus.id, { focusDate: null })
    expect(cleared?.focusDate).toBeNull()
  })

  it('繰り返し規則は任意で保持され、nullで解除できる', async () => {
    const store = createMemoryTodoStore()
    const withRepeat = await store.create(1, 'with', '2026-11-28', null, { unit: 'day', interval: 3 })
    expect(withRepeat.repeat).toEqual({ unit: 'day', interval: 3 })
    const without = await store.create(1, 'without')
    expect(without.repeat).toBeNull()
    const cleared = await store.update(1, withRepeat.id, { repeat: null })
    expect(cleared?.repeat).toBeNull()
  })

  it('次回期限はカレンダー加算で月末は丸める', () => {
    expect(getNextDueDate('2026-11-28', { unit: 'day', interval: 3 })).toBe('2026-12-01')
    expect(getNextDueDate('2026-11-01', { unit: 'week', interval: 1 })).toBe('2026-11-08')
    expect(getNextDueDate('2026-01-31', { unit: 'month', interval: 1 })).toBe('2026-02-28')
    expect(getNextDueDate('2024-02-29', { unit: 'year', interval: 1 })).toBe('2025-02-28')
  })

  it('週の曜日指定は直後の該当曜日に進む', () => {
    // 2026-11-02=月曜、2026-11-04=水曜は既知リテラル
    expect(getNextDueDate('2026-11-02', { unit: 'week', interval: 1, byWeekday: [3] })).toBe('2026-11-04')
    expect(getNextDueDate('2026-11-03', { unit: 'week', interval: 1, byWeekday: [1] })).toBe('2026-11-09')
  })

  it('複数曜日×interval2は同週残りを含めた週ブロックで進む', () => {
    // 月曜起点・月水・隔週 → 同週水曜、次は2週間後の月曜
    expect(getNextDueDate('2026-11-02', { unit: 'week', interval: 2, byWeekday: [1, 3] })).toBe('2026-11-04')
    expect(getNextDueDate('2026-11-04', { unit: 'week', interval: 2, byWeekday: [1, 3] })).toBe('2026-11-16')
    expect(getNextDueDate('2026-11-02', { unit: 'week', interval: 2, byWeekday: [1] })).toBe('2026-11-16')
  })

  it('完了で次回分のTodoが1件作られる', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-01', null, { unit: 'week', interval: 1 })
    await store.update(1, t.id, { done: true })
    const all = await store.list(1)
    expect(all.length).toBe(2)
    const next = all.find((x) => x.id !== t.id)!
    expect(next.title).toBe('ごみ出し')
    expect(next.done).toBe(false)
    expect(next.dueDate).toBe('2026-11-08')
    expect(next.focusDate).toBeNull()
    expect(next.repeat).toEqual({ unit: 'week', interval: 1 })
  })

  it('手作成のspawnedFromIdはnullで、生成時に親idが刻まれる', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-01', null, { unit: 'week', interval: 1 })
    expect(t.spawnedFromId).toBeNull()
    await store.update(1, t.id, { done: true })
    const all = await store.list(1)
    const next = all.find((x) => x.id !== t.id)!
    expect(next.spawnedFromId).toBe(t.id)
  })

  it('解除→再チェックで重複生成しない', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-01', null, { unit: 'week', interval: 1 })
    await store.update(1, t.id, { done: true })
    await store.update(1, t.id, { done: false })
    await store.update(1, t.id, { done: true })
    expect((await store.list(1)).length).toBe(2)
  })

  it('子が完了済みでも再チェックで作らない', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-01', null, { unit: 'week', interval: 1 })
    await store.update(1, t.id, { done: true })
    const child = (await store.list(1)).find((x) => x.id !== t.id)!
    await store.update(1, child.id, { done: true })
    await store.update(1, t.id, { done: false })
    await store.update(1, t.id, { done: true })
    expect((await store.list(1)).length).toBe(3)
  })

  it('子を手削除後は再チェックで作り直せる', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-01', null, { unit: 'week', interval: 1 })
    await store.update(1, t.id, { done: true })
    const child = (await store.list(1)).find((x) => x.id !== t.id)!
    await store.remove(1, child.id)
    await store.update(1, t.id, { done: false })
    await store.update(1, t.id, { done: true })
    const all = await store.list(1)
    expect(all.length).toBe(2)
    expect(all.find((x) => x.id !== t.id)!.spawnedFromId).toBe(t.id)
  })

  it('曜日指定の完了で次回が該当曜日に作られrepeatを継承する', async () => {
    const store = createMemoryTodoStore()
    const t = await store.create(1, 'ごみ出し', '2026-11-02', null, { unit: 'week', interval: 1, byWeekday: [3, 1] })
    expect(t.repeat).toEqual({ unit: 'week', interval: 1, byWeekday: [1, 3] })
    await store.update(1, t.id, { done: true })
    const all = await store.list(1)
    expect(all.length).toBe(2)
    const next = all.find((x) => x.id !== t.id)!
    expect(next.dueDate).toBe('2026-11-04')
    expect(next.repeat).toEqual({ unit: 'week', interval: 1, byWeekday: [1, 3] })
  })
})
