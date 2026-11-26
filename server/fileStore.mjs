import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const actions = new Set([
  'contract', 'assignment', 'delivery', 'staff', 'training', 'maintenance', 'incident',
  'settlement', 'market', 'scope', 'negotiation', 'review', 'shop', 'product', 'reset', 'sales', 'customer', 'solution',
])
const outcomes = new Set([
  'accepted', 'canceled', 'assigned', 'emergency', 'great', 'success', 'ok', 'fail', 'vacant',
  'hired', 'departed', 'promoted', 'salary', 'trained', 'pilot', 'opened', 'internal', 'outsourced',
  'repaired', 'settled', 'refreshed', 'requested', 'declined', 'critical', 'bought', 'used', 'started', 'acquired', 'followup', 'milestone',
])
const codes = /^[a-z0-9_-]{1,70}$/i
const number = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12
const validGameTime = (value) => Number.isSafeInteger(value) && value >= 0

export function cleanEvents(events) {
  return events.flatMap((event) => {
    if (!event || !actions.has(event.action) || !outcomes.has(event.result) ||
        !['tick', 'day', 'week'].every((key) => validGameTime(event[key]))) return []
    const clean = { tick: event.tick, day: event.day, week: event.week, action: event.action, result: event.result }
    for (const key of ['projectId', 'employeeId', 'customerId', 'technology', 'mode', 'domain']) {
      if (typeof event[key] === 'string' && codes.test(event[key])) clean[key] = event[key]
    }
    for (const key of ['amount', 'cash', 'debt', 'heat', 'research', 'remaining', 'duration', 'difficulty', 'trust']) {
      if (number(event[key])) clean[key] = event[key]
    }
    return [clean]
  })
}

async function atomicJson(dir, name, data) {
  const temp = join(dir, '.' + name + '-' + randomUUID())
  try {
    const file = await open(temp, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(data))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temp, join(dir, name))
    try {
      const parent = await open(dir, 'r')
      try { await parent.sync() } finally { await parent.close() }
    } catch (error) {
      if (!['EINVAL', 'ENOTSUP', 'EPERM', 'EISDIR'].includes(error.code)) throw error
    }
  } finally {
    await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error })
  }
}

function publicHead(commit) {
  return commit ? {
    revision: commit.revision, id: commit.id, savedAt: commit.savedAt, state: commit.state,
  } : { revision: 0, state: null }
}

export async function createFileStore(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const logPath = join(dir, 'events.ndjson')
  let queue = Promise.resolve()
  function serial(task) {
    const current = queue.then(task)
    queue = current.catch(() => {})
    return current
  }

  async function readCommit() {
    try {
      return JSON.parse(await readFile(join(dir, 'save.json'), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async function reconcile(commit) {
    if (!commit) return 0
    const payload = Buffer.from(commit.events.map((event) =>
      JSON.stringify({ ...event, recordedAt: commit.savedAt, revision: commit.revision }) + '\n',
    ).join(''))
    const end = commit.logOffset + payload.length
    const file = await open(logPath, 'r+').catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return open(logPath, 'wx+', 0o600)
    })
    try {
      const { size } = await file.stat()
      if (size < commit.logOffset || size > end) throw new Error('Unexpected event log offset')
      if (size === end && payload.length) {
        const written = Buffer.alloc(payload.length)
        await file.read(written, 0, written.length, commit.logOffset)
        if (!written.equals(payload)) throw new Error('Unexpected committed event log data')
      } else if (size < end) {
        // A restart may find an incomplete append from this latest commit.
        if (size > commit.logOffset) await file.truncate(commit.logOffset)
        let offset = 0
        while (offset < payload.length) {
          const { bytesWritten } = await file.write(payload, offset, payload.length - offset, commit.logOffset + offset)
          if (bytesWritten === 0) throw new Error('Could not write event log')
          offset += bytesWritten
        }
        await file.sync()
      }
      return end
    } finally {
      await file.close()
    }
  }

  return {
    read: () => serial(async () => {
      const previous = await readCommit()
      await reconcile(previous)
      return publicHead(previous)
    }),
    write: (request) => serial(async () => {
      const previous = await readCommit()
      const logOffset = await reconcile(previous)
      const revision = previous?.revision ?? 0
      if (previous?.id === request.id) return { conflict: false, head: publicHead(previous) }
      if (revision !== request.baseRevision) return { conflict: true, head: publicHead(previous) }

      if (previous && request.backup) {
        await atomicJson(dir, 'recovery-' + revision + '.json', publicHead(previous))
      }
      const commit = {
        revision: revision + 1, id: request.id, savedAt: new Date().toISOString(),
        state: request.state, events: cleanEvents(request.events), logOffset,
      }
      await atomicJson(dir, 'save.json', commit)
      await reconcile(commit)
      return { conflict: false, head: publicHead(commit) }
    }),
  }
}
