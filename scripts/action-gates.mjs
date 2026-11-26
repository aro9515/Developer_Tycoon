import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { Game, assignmentBlock, trainingBlock } = await vite.ssrLoadModule('/src/core/Game.ts')
  const game = new Game(undefined, () => 0)
  assert.ok(game.hireEmployee('backend'))
  const s = game.state
  const [lead, second] = s.employees
  const offer = s.market[0]
  offer.difficulty = 2
  offer.style = 'changing'
  assert.ok(game.acceptOffer(offer.id, lead.id))
  const project = s.projects[0]
  project.progress = 41.9
  assert.equal(assignmentBlock(s, lead, undefined, true), 'last-assignee')
  assert.equal(game.assignEmployee(lead.id, null, true), false)
  assert.equal(assignmentBlock(s, second, project), null)
  assert.ok(game.startTraining(second.id, 'javascript'))
  assert.equal(assignmentBlock(s, second, project), null, 'unstarted education can be replaced')
  game.advance('week')
  assert.equal(s.tick, 1)
  assert.ok(project.scopePending)
  assert.equal(assignmentBlock(s, second, project), 'worked-this-week')
  assert.equal(game.assignEmployee(second.id, project.id), false)
  assert.equal(assignmentBlock(s, second, project, true), null)
  assert.ok(game.assignEmployee(second.id, project.id, true))
  assert.deepEqual(project.assigneeIds, [lead.id, second.id])
  assert.equal(trainingBlock(s, second, 'javascript', true), 'busy')
  assert.equal(game.startTraining(second.id, 'javascript', true), false)
  game.advance('week')
  assert.equal(s.tick, 1)
  assert.ok(game.resolveScope(project.id, false))
  game.advance('week')
  assert.ok(s.tick > 1)
  const fresh = new Game()
  const person = fresh.state.employees[0]
  assert.equal(trainingBlock(fresh.state, person, 'javascript', true), 'skill')
  assert.equal(fresh.startTraining(person.id, 'javascript', true), false)
  person.stats.frontend = 20
  assert.equal(trainingBlock(fresh.state, person, 'javascript', true), null)
  assert.equal(fresh.startTraining(person.id, 'javascript', true), true)
  console.log('PASS shared assignment/training reasons and week freeze/resume')
} finally {
  await vite.close()
}
