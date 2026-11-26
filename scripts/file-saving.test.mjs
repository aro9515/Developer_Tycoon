import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileStore } from '../server/fileStore.mjs'
import { createPlaytestServer, accessVerifier } from '../server/playtest.mjs'

const save = { version: 2, tick: 4, dayIndex: 1, weekIndex: 1, company: { name: '테스트', cash: 740 }, employees: [{}], projects: [], market: [] }
const event = { tick: 4, day: 1, week: 1, action: 'contract', result: 'accepted', projectId: 'proj_test_1', amount: 195 }
const commit = (revision, id, state = save, events = [event]) => ({ baseRevision: revision, id, state, events })
const firstId = '7ecb44c2-8903-4e7e-9f60-7bd740ddce1d'
const secondId = '3ed066b1-c64f-4eb7-b232-2605f853c5df'

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'developer-tycoon-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { dir, store: await createFileStore(dir) }
}

test('an empty store accepts a migrated save and persists logs across restart without duplicate retries', async (t) => {
  const { dir, store } = await fixture(t)
  assert.deepEqual(await store.read(), { revision: 0, state: null })
  const request = commit(0, firstId, save, [])
  assert.equal((await store.write(request)).head.revision, 1)
  const restarted = await createFileStore(dir)
  assert.deepEqual((await restarted.read()).state, save)
  const later = commit(1, secondId, { ...save, tick: 5 })
  assert.equal((await restarted.write(later)).head.revision, 2)
  assert.equal((await restarted.write(later)).head.revision, 2)
  const entries = (await readFile(join(dir, 'events.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].action, 'contract')
  assert.equal(entries[0].day, 1)
  assert.ok(Date.parse(entries[0].recordedAt))
  assert.equal(entries[0].revision, 2)
})

test('concurrent old tabs cannot overwrite a newer save or append their events', async (t) => {
  const { dir, store } = await fixture(t)
  const [one, two] = await Promise.all([
    store.write(commit(0, firstId)),
    store.write(commit(0, secondId, { ...save, tick: 20 })),
  ])
  assert.equal(one.conflict, false)
  assert.equal(two.conflict, true)
  assert.equal((await store.read()).state.tick, 4)
  assert.equal((await readFile(join(dir, 'events.ndjson'), 'utf8')).trim().split('\n').length, 1)
})

test('Access endpoint rejects missing, wrong-audience, expired and forged identities', async (t) => {
  const { store } = await fixture(t)
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  const issuer = 'https://test.cloudflareaccess.com'
  const audience = 'test-app'
  const email = 'owner@example.test'
  const verifier = accessVerifier({ issuer, audience, ownerEmail: email, fetchKeys: async () => [
    { ...publicKey.export({ format: 'jwk' }), kid: 'key-one', alg: 'RS256' },
  ] })
  function token(patch = {}, key = privateKey) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = encode({ alg: 'RS256', kid: 'key-one' }) + '.' +
      encode({ iss: issuer, aud: [audience], exp: Math.floor(Date.now() / 1000) + 60, email, ...patch })
    return body + '.' + sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')
  }
  const server = createPlaytestServer({ store, verifyAccess: verifier, origin: 'https://app.example.test', requireReleaseClient: true })
  await new Promise((finish) => server.listen(0, '127.0.0.1', finish))
  t.after(() => server.close())
  const uri = 'http://127.0.0.1:' + server.address().port + '/api/playtest/save'
  const open = (assertion) => fetch(uri, { headers: assertion ? { 'cf-access-jwt-assertion': assertion } : {} })
  for (const assertion of [null, token({ aud: ['different'] }), token({ exp: 0 }), token({ email: 'other@example.test' }), token({}, attacker)]) {
    assert.equal((await open(assertion)).status, 403)
  }
  assert.equal((await open(token())).status, 200)
  const badOrigin = await fetch(uri, { method: 'PUT', headers: {
    'content-type': 'application/json', 'cf-access-jwt-assertion': token(), origin: 'https://other.test',
  }, body: JSON.stringify(commit(0, firstId)) })
  assert.equal(badOrigin.status, 403)
  const headers = {
    'content-type': 'application/json', 'cf-access-jwt-assertion': token(), origin: 'https://app.example.test',
  }
  const oldTab = await fetch(uri, { method: 'PUT', headers, body: JSON.stringify(commit(0, firstId)) })
  assert.equal(oldTab.status, 426)
  assert.equal((await store.read()).revision, 0)
  const write = (request, release = 'enterprise-1') => fetch(uri, {
    method: 'PUT', headers: { ...headers, 'x-developer-tycoon-release': release }, body: JSON.stringify(request),
  })
  assert.equal((await write(commit(0, firstId))).status, 400)
  const migrated = { ...save, enterprise: { accounts: [] }, growth: { stageIndex: 0 } }
  const good = await write(commit(0, firstId, migrated))
  assert.equal(good.status, 200)
  assert.equal((await good.json()).revision, 1)
  assert.equal((await write(commit(0, secondId, { ...migrated, tick: 12 }))).status, 409)
  assert.equal((await store.read()).state.tick, 4)
})
