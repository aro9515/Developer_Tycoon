import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { Game } = await server.ssrLoadModule('/src/core/Game.ts')
  const { offerToProject, settleProject, tickProject } = await server.ssrLoadModule('/src/core/project.ts')
  const {
    LONG_CONTRACT, approveLongReview, createLongContractOffer, longPayments, longRoleXpGain, longReviewReady,
    startLongContract, waitingForLongReview,
  } = await server.ssrLoadModule('/src/core/longContracts.ts')

  function fixture() {
    const game = new Game(undefined, () => 0.99)
    const state = game.state
    const customer = state.customers[0]
    customer.closedContracts = 2
    customer.trust = 78
    customer.lastResult = 'success'
    state.projects = Array.from({ length: 4 }, (_, i) => ({
      ...offerToProject(state.market[0]), id: 'delivered-' + i, state: 'done', result: 'success',
    }))
    state.market = []
    state.weekIndex = 9
    state.dayOfWeek = 1
    return { game, state, customer }
  }

  await test('Established clients occasionally propose a single 10–12-week contract with work estimated separately', () => {
    const { state, customer } = fixture()
    state.weekIndex = 8
    assert.equal(createLongContractOffer(state), undefined)
    state.weekIndex = 9
    customer.trust = 74
    assert.equal(createLongContractOffer(state), undefined)
    customer.trust = 75
    const { offer } = createLongContractOffer(state)
    assert.equal(offer.customerId, customer.id)
    assert.ok(offer.durationTicks >= 560 && offer.durationTicks <= 672)
    assert.equal(offer.durationTicks % 56, 0)
    assert.ok(offer.longContract.workDays > 15 && offer.longContract.workDays < 84)
    const { labor, overhead, risk, margin } = offer.weeklyTerms
    assert.equal(offer.budget, labor + overhead + risk + margin)
    assert.equal(offer.source, 'followup')
    assert.equal(createLongContractOffer(state), undefined)
  })

  await test('Checkpoint blocks repeat work and pays exactly once across JSON reload', () => {
    const { state } = fixture()
    const { offer } = createLongContractOffer(state)
    const project = offerToProject(offer)
    project.longContract = startLongContract(offer)
    const employee = state.employees[0]
    project.assigneeIds.push(employee.id)
    project.state = 'inDev'
    project.progress = LONG_CONTRACT.checkpointProgress - 0.1
    project.elapsedTicks = LONG_CONTRACT.checkpointEarliestTicks - 2
    tickProject(project, [employee])
    assert.equal(project.progress, LONG_CONTRACT.checkpointProgress)
    assert.equal(waitingForLongReview(project), true)
    assert.equal(longReviewReady(project), false)
    assert.equal(approveLongReview(project), null)
    project.elapsedTicks++
    const payments = longPayments(offer.budget)
    assert.equal(approveLongReview(project), payments.middle)
    const reloaded = JSON.parse(JSON.stringify(project))
    assert.equal(waitingForLongReview(reloaded), false)
    assert.equal(approveLongReview(reloaded), null)
    reloaded.progress = 110
    reloaded.elapsedTicks = 400
    const settled = settleProject(reloaded)
    assert.equal(settled.cash, payments.final)
    assert.equal(payments.advance + payments.middle + payments.final, offer.budget)
    const settledReload = JSON.parse(JSON.stringify(reloaded))
    assert.equal(settleProject(settledReload).cash, 0)
    assert.equal(settledReload.payout, payments.final)
  })

  await test('Unapproved or failed final never pays and repetitive role XP cannot reach 32', () => {
    const { state } = fixture()
    const { offer } = createLongContractOffer(state)
    const project = offerToProject(offer)
    project.longContract = startLongContract(offer)
    assert.equal(settleProject(project).cash, 0)
    const failed = offerToProject(offer)
    failed.longContract = startLongContract(offer)
    failed.longContract.middlePaid = true
    failed.elapsedTicks = 672
    failed.bugs = 100
    assert.equal(settleProject(failed).cash, 0)
    let xp = 0
    for (let work = 1; work <= 672; work++) xp += longRoleXpGain(project, work, work <= 8 ? 0.17 : 0.44)
    assert.ok(xp > 0 && xp < 32)
    assert.equal(longRoleXpGain({ ...project, longContract: undefined }, 1, 0.17), 0.17)
  })
  await test('Game accepts, verifies, reloads, delivers and releases a long contract exactly once', async () => {
    const { game, state } = fixture()
    const { deserializeGame, serializeGame } = await server.ssrLoadModule('/src/core/save.ts')
    const { offer } = createLongContractOffer(state)
    const employee = state.employees[0]
    const payments = longPayments(offer.budget)
    const openingCash = state.company.cash
    assert.equal(game.acceptOffer(offer.id, employee.id), true)
    const project = state.projects.at(-1)
    assert.equal(project.durationTicks, offer.durationTicks)
    assert.equal(state.company.cash, openingCash + payments.advance)
    assert.equal(game.approveLongContractReview(project.id), false)

    project.scopeChecked = true
    project.progress = LONG_CONTRACT.checkpointProgress
    project.elapsedTicks = LONG_CONTRACT.checkpointEarliestTicks - 1
    const previousWork = { ...project.workTicks }
    game.setSpeed(1)
    game.tick()
    game.setSpeed(0)
    assert.deepEqual(project.workTicks, previousWork)
    assert.equal(project.progress, LONG_CONTRACT.checkpointProgress)

    assert.equal(game.approveLongContractReview(project.id), true)
    assert.equal(game.approveLongContractReview(project.id), false)
    assert.equal(state.company.cash, openingCash + payments.advance + payments.middle)
    const reloaded = deserializeGame(serializeGame(game))
    assert.ok(reloaded)
    const savedProject = reloaded.state.projects.at(-1)
    assert.equal(reloaded.approveLongContractReview(savedProject.id), false)
    savedProject.state = 'deploying'
    savedProject.progress = 109
    reloaded.setSpeed(1)
    reloaded.tick()
    assert.equal(savedProject.state, 'done')
    assert.equal(savedProject.payout, payments.final)
    assert.equal(reloaded.state.company.cash, openingCash + offer.budget)
    assert.equal(reloaded.state.employees[0].assignedProjectId, null)
    reloaded.tick()
    assert.equal(reloaded.state.company.cash, openingCash + offer.budget)
  })

  await test('Game preserves only earned checkpoint money on cancellation and no final pay on a missed deadline', () => {
    for (const condition of ['cancel', 'deadline']) {
      const { game, state } = fixture()
      const { offer } = createLongContractOffer(state)
      const openingCash = state.company.cash
      assert.equal(game.acceptOffer(offer.id, state.employees[0].id), true)
      const project = state.projects.at(-1)
      project.scopeChecked = true
      project.progress = LONG_CONTRACT.checkpointProgress
      project.elapsedTicks = LONG_CONTRACT.checkpointEarliestTicks

      if (condition === 'cancel') {
        assert.equal(game.approveLongContractReview(project.id), true)
        assert.equal(game.cancelProject(project.id), true)
        assert.equal(game.cancelProject(project.id), false)
        assert.equal(state.company.cash, openingCash + longPayments(offer.budget).middle)
        assert.equal(project.state, 'canceled')
      } else {
        project.elapsedTicks = project.durationTicks - 1
        game.setSpeed(1)
        game.tick()
        assert.equal(project.state, 'failed')
        assert.equal(project.payout, 0)
        assert.equal(game.approveLongContractReview(project.id), false)
      }
    }
  })
  await test('Normal play can actually deliver a long contract inside its window', () => {
    const { game, state } = fixture()
    state.company.cash = 5000
    const { offer } = createLongContractOffer(state)
    const employee = state.employees[0]
    for (const skill of Object.keys(employee.stats)) employee.stats[skill] = 36
    employee.stackXp[offer.technology] = 32
    assert.equal(game.acceptOffer(offer.id, employee.id), true)
    const project = state.projects.at(-1)
    let paid = false
    for (let day = 0; day <= 84; day++) {
      if (project.state === 'done' || project.state === 'failed') break
      if (project.scopePending) assert.ok(game.resolveScope(project.id, false))
      if (longReviewReady(project) && !paid) paid = game.approveLongContractReview(project.id)
      game.advance('day')
    }
    assert.equal(paid, true)
    assert.equal(project.state, 'done', 'Normal long project ended with ' + project.bugs + ' bugs')
    assert.ok(project.elapsedTicks >= LONG_CONTRACT.checkpointEarliestTicks)
    assert.ok(project.elapsedTicks < LONG_CONTRACT.durationTicks)
    assert.ok(project.workTicks[employee.id] < project.elapsedTicks)
    assert.equal(project.payout, longPayments(offer.budget).final)
  })
} finally {
  await server.close()
}
