import { createPublicKey, verify } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createFileStore } from './fileStore.mjs'

const API = '/api/playtest/save'
const SAVE_RELEASE = 'enterprise-1'
const MAX_BYTES = 4 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function accessVerifier({ issuer, audience, ownerEmail, fetchKeys }) {
  let keys = []
  let fetchedAt = 0
  let loading
  return async (token) => {
    if (typeof token !== 'string' || token.length > 12000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return false
    try {
      const [meta, data, signature] = token.split('.')
      const header = JSON.parse(Buffer.from(meta, 'base64url'))
      const claims = JSON.parse(Buffer.from(data, 'base64url'))
      const now = Math.floor(Date.now() / 1000)
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
          claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
          !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
          (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
          typeof claims.email !== 'string' || claims.email.toLowerCase() !== ownerEmail.toLowerCase()) return false

      const known = keys.some((key) => key.kid === header.kid)
      if (Date.now() - fetchedAt > 5 * 60_000 || (!known && Date.now() - fetchedAt > 30_000)) {
        loading ??= Promise.resolve().then(fetchKeys).then((fresh) => {
          if (!Array.isArray(fresh)) throw new Error('Invalid public key response')
          keys = fresh
          fetchedAt = Date.now()
        }).finally(() => { loading = undefined })
        await loading
      }
      const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'))
      if (!jwk) return false
      return verify('RSA-SHA256', Buffer.from(meta + '.' + data), createPublicKey({ format: 'jwk', key: jwk }), Buffer.from(signature, 'base64url'))
    } catch {
      return false
    }
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BYTES) return null
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null }
}

function validWrite(body) {
  const state = body?.state
  return Number.isSafeInteger(body?.baseRevision) && body.baseRevision >= 0 &&
    typeof body.id === 'string' && uuid.test(body.id) &&
    Array.isArray(body.events) && body.events.length <= 8000 &&
    (body.backup === undefined || typeof body.backup === 'boolean') &&
    state?.version === 2 && Number.isSafeInteger(state.tick) && state.tick >= 0 &&
    Number.isSafeInteger(state.dayIndex) && Number.isSafeInteger(state.weekIndex) &&
    typeof state.company?.name === 'string' && Number.isFinite(state.company.cash) &&
    Array.isArray(state.employees) && state.employees.length > 0 &&
    Array.isArray(state.projects) && Array.isArray(state.market)
}

export function createPlaytestServer({ store, verifyAccess, origin, requireReleaseClient = false }) {
  return createServer({ requestTimeout: 20_000 }, async (req, res) => {
    if (req.url !== API) return send(res, 404, { error: 'not-found' })
    if (!await verifyAccess(req.headers['cf-access-jwt-assertion'])) return send(res, 403, { error: 'access-denied' })
    try {
      if (req.method === 'GET') return send(res, 200, await store.read())
      if (req.method !== 'PUT') return send(res, 405, { error: 'method-not-allowed' })
      if (req.headers.origin !== origin) return send(res, 403, { error: 'origin-denied' })
      if (requireReleaseClient && req.headers['x-developer-tycoon-release'] !== SAVE_RELEASE) {
        return send(res, 426, { error: 'reload-required' })
      }
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'unsupported-content' })
      if (Number(req.headers['content-length']) > MAX_BYTES) return send(res, 413, { error: 'too-large' })
      const body = await readJson(req)
      if (!validWrite(body) || (requireReleaseClient && (!body.state.enterprise || !body.state.growth))) return send(res, 400, { error: 'invalid-save' })
      const { conflict, head } = await store.write(body)
      return send(res, conflict ? 409 : 200, head)
    } catch {
      return send(res, 503, { error: 'storage-unavailable' })
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: audience, ACCESS_OWNER_EMAIL: ownerEmail, PLAYTEST_ORIGIN: origin } = process.env
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer ?? '') || !audience || !ownerEmail || !origin) {
    throw new Error('Access verification must be configured')
  }
  const fetchKeys = async () => {
    const response = await fetch(issuer + '/cdn-cgi/access/certs', { redirect: 'error', signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Access key lookup failed')
    return (await response.json()).keys
  }
  const store = await createFileStore('/data')
  createPlaytestServer({
    store, verifyAccess: accessVerifier({ issuer, audience, ownerEmail, fetchKeys }), origin, requireReleaseClient: true,
  }).listen(8080, '0.0.0.0')
}
