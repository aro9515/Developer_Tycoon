import { ref, shallowRef } from 'vue'
import { deserializeGame } from './save'
import type { Game } from './Game'
import type { PlayEvent } from './playEvent'

const API = '/api/playtest/save'
const SAVE_RELEASE = 'enterprise-1'
const ORIGINAL = 'developer_tycoon_save_v1'
const CACHE = 'developer_tycoon_server_cache_v1'
const DRAFT = 'developer_tycoon_pending_v1_'
const BACKUP = 'developer_tycoon_recovery_v1_'

type Status = 'checking' | 'ready' | 'saving' | 'saved' | 'offline' | 'migration' | 'conflict'
type Head = { revision: number; state: unknown; id?: string; savedAt?: string }
type Batch = { id: string; raw: string; count: number; sequence: number; backup: boolean }
type LocalDraft = {
  raw: string; base: number | null; events: PlayEvent[]; sequence: number; at: number;
  batch: Batch | null; backup: boolean;
}

function get(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function parse<T>(raw: string | null): T | null {
  try { return raw ? JSON.parse(raw) as T : null } catch { return null }
}

function localEntries(prefix: string): { key: string; contents: string }[] {
  try {
    const items: { key: string; contents: string }[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      const contents = key?.startsWith(prefix) ? get(key) : null
      if (key && contents) items.push({ key, contents })
    }
    return items
  } catch { return [] }
}

function recoveredDraft() {
  return localEntries(DRAFT).flatMap((entry) => {
    const pending = parse<LocalDraft>(entry.contents)
    return pending && Array.isArray(pending.events) && deserializeGame(pending.raw) ? [{ ...entry, pending }] : []
  }).sort((left, right) => right.pending.at - left.pending.at).at(0)
}

async function request(body?: object): Promise<{ conflict: boolean; head: Head }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetch(API, {
      method: body ? 'PUT' : 'GET', credentials: 'same-origin', redirect: 'error',
      cache: 'no-store', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Developer-Tycoon-Release': SAVE_RELEASE }, body: JSON.stringify(body) } : {}),
    })
    if (!response.ok && response.status !== 409) throw new Error('Save server unavailable')
    const head = await response.json() as Head
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 ||
        (head.revision > 0 && (!head.id || !deserializeGame(JSON.stringify(head.state))))) throw new Error('Invalid save')
    return { conflict: response.status === 409, head }
  } finally { clearTimeout(timeout) }
}

export function createPlaytestSync(replace: (next: Game) => void) {
  const original = get(ORIGINAL)
  const cached = parse<Head>(get(CACHE))
  let recovered = recoveredDraft()
  let draft: LocalDraft | null = recovered?.pending ?? null
  let base = draft ? draft.base : cached?.revision ?? null
  const initial: Game | null = (draft ? deserializeGame(draft.raw) : null) ??
    (cached?.state ? deserializeGame(JSON.stringify(cached.state)) : null) ??
    (original ? deserializeGame(original) : null)

  const status = ref<Status>('checking')
  const ready = ref(false)
  const storageAvailable = ref(true)
  const revision = ref(base)
  const savedAt = ref<string>()
  const hasOriginal = Boolean(original)
  const hasDraft = ref(Boolean(draft))
  const backups = shallowRef(localEntries(BACKUP))
  const latest = shallowRef<Head>()
  const tabKey = DRAFT + crypto.randomUUID()
  let enabled = false
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRaw = draft?.raw ?? (cached?.state ? JSON.stringify(cached.state) : original)

  function writeLocal(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value)
      storageAvailable.value = true
      return true
    } catch {
      storageAvailable.value = false
      return false
    }
  }

  function removeLocal(key: string): void {
    try { localStorage.removeItem(key) } catch { /* recovery data remains */ }
  }

  function persistLocal(): void {
    if (draft) writeLocal(tabKey, JSON.stringify(draft))
  }

  function clearRecovered(): void {
    if (recovered && get(recovered.key) === recovered.contents) removeLocal(recovered.key)
    recovered = undefined
  }

  function updateHead(head: Head): void {
    base = head.revision
    revision.value = base
    savedAt.value = head.savedAt
    const cachedHead = parse<Head>(get(CACHE))
    if (head.state && (!cachedHead || cachedHead.revision <= head.revision)) writeLocal(CACHE, JSON.stringify(head))
  }

  function markConflict(head: Head): void {
    latest.value = head
    enabled = false
    status.value = 'conflict'
    persistLocal()
  }

  function acknowledge(head: Head, batch: Batch): void {
    if (!draft) return
    updateHead(head)
    draft.base = head.revision
    draft.events = draft.events.slice(batch.count)
    draft.batch = null
    draft.backup = false
    if (draft.sequence === batch.sequence && draft.events.length === 0) draft = null
    hasDraft.value = Boolean(draft)
    if (draft) persistLocal()
    else removeLocal(tabKey)
    clearRecovered()
    status.value = draft ? 'ready' : 'saved'
  }

  function schedule(): void {
    if (!enabled || !draft || timer !== undefined || busy) return
    timer = setTimeout(() => { timer = undefined; void flush() }, 400)
  }

  async function flush(): Promise<void> {
    if (!enabled || !draft || busy || draft.base === null) return
    busy = true
    status.value = 'saving'
    const batch = draft.batch ??= {
      id: crypto.randomUUID(), raw: draft.raw, count: Math.min(8000, draft.events.length),
      sequence: draft.sequence, backup: draft.backup,
    }
    const baseRevision = draft.base
    persistLocal()
    try {
      const queued = JSON.parse(batch.raw)
      const state = queued.growth && queued.enterprise ? queued : deserializeGame(batch.raw)?.getSnapshot()
      if (!state) throw new Error('Invalid saved draft')
      const { conflict, head } = await request({
        baseRevision, id: batch.id, state, events: draft.events.slice(0, batch.count), backup: batch.backup,
      })
      if (conflict) markConflict(head)
      else acknowledge(head, batch)
    } catch {
      status.value = 'offline'
    } finally {
      busy = false
      if (status.value !== 'offline') schedule()
    }
  }

  async function connect(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const { head } = await request()
      if (draft?.batch && draft.batch.id === head.id) acknowledge(head, draft.batch)
      if (draft) {
        if (draft.base === head.revision) {
          updateHead(head)
          enabled = true
          status.value = 'ready'
        } else if (draft.base === null && head.revision === 0) {
          enabled = false
          status.value = 'migration'
        } else markConflict(head)
      } else if (head.revision > 0) {
        adopt(head)
      } else if (initial && base !== 0) {
        enabled = false
        status.value = 'migration'
      } else {
        updateHead(head)
        enabled = true
        status.value = 'ready'
      }
    } catch {
      status.value = 'offline'
    } finally {
      ready.value = true
      busy = false
      if (status.value !== 'offline') schedule()
    }
  }

  function capture(game: Game, events: PlayEvent[], backup = false): void {
    const raw = JSON.stringify(game.getSnapshot())
    if (raw === lastRaw && events.length === 0 && !backup) return
    lastRaw = raw
    draft ??= { raw, base, events: [], sequence: 0, at: Date.now(), batch: null, backup: false }
    draft.raw = raw
    draft.events.push(...events)
    draft.sequence++
    draft.at = Date.now()
    draft.backup ||= backup
    hasDraft.value = true
    persistLocal()
    if (status.value === 'saved') status.value = 'ready'
    schedule()
  }

  function migrate(game: Game): void {
    if (busy || status.value !== 'migration') return
    base = 0
    if (draft) draft.base = 0
    enabled = true
    status.value = 'ready'
    capture(game, [], true)
    schedule()
  }

  function adopt(head: Head): boolean {
    const raw = JSON.stringify(head.state)
    const game = deserializeGame(raw)
    if (!game) return false
    lastRaw = raw
    draft = null
    hasDraft.value = false
    latest.value = undefined
    updateHead(head)
    enabled = true
    status.value = 'saved'
    replace(game)
    return true
  }

  function useServer(): void {
    const head = latest.value
    if (!head?.state || busy) return
    if (draft && !writeLocal(BACKUP + crypto.randomUUID(), draft.raw)) return
    removeLocal(tabKey)
    clearRecovered()
    backups.value = localEntries(BACKUP)
    adopt(head)
  }

  function restoreLocal(game: Game): void {
    if (!latest.value || busy || status.value !== 'conflict' || !draft) return
    base = latest.value.revision
    draft.base = base
    draft.batch = null
    latest.value = undefined
    enabled = true
    status.value = 'ready'
    capture(game, [], true)
  }

  function download(kind: 'original' | 'draft' | 'server' | 'backup', key?: string): void {
    const raw = kind === 'original' ? original : kind === 'draft' ? draft?.raw :
      kind === 'server' ? (latest.value?.state ? JSON.stringify(latest.value.state) : null) : key && get(key)
    if (!raw) return
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'developer-tycoon-' + kind + '.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return {
    initial: initial || null, status, ready, storageAvailable, revision, savedAt, latest, hasOriginal, hasDraft, backups,
    connect, capture, migrate, persistLocal, useServer, restoreLocal, download,
  }
}
