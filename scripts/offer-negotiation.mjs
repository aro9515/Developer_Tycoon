import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ configLoader: 'runner', server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { Game } = await vite.ssrLoadModule('/src/core/Game.ts')
  const { offerToProject } = await vite.ssrLoadModule('/src/core/project.ts')
  const helpers = await vite.ssrLoadModule('/src/core/offerNegotiation.ts')
  const { deserializeGame, serializeGame } = await vite.ssrLoadModule('/src/core/save.ts')
  const fixtures = () => {
    const game = new Game()
    const offer = structuredClone(game.state.market[0])
    return { game, offer, employee: game.state.employees[0] }
  }

  await test('a lost offer negotiation retains exact original terms and employee experience', () => {
    const { offer, employee } = fixtures()
    const { offerNegotiationOdds, rollOfferNegotiation, effectiveOffer } = helpers
    const original = structuredClone(offer)
    const odds = offerNegotiationOdds(offer, employee, 10, 'schedule', offer.technology)
    const oldXp = structuredClone(employee.roleXp)
    offer.offerNegotiation = rollOfferNegotiation(offer, employee, 10, 'schedule', offer.technology, (odds.success + 2) / 100)
    assert.equal(offer.offerNegotiation.outcome, 'fail')
    assert.equal(offer.offerNegotiation.decision, 'original')
    assert.equal(offer.offerNegotiation.proposal, undefined)
    assert.equal(effectiveOffer(offer).budget, original.budget)
    assert.equal(effectiveOffer(offer).durationTicks, original.durationTicks)
    assert.deepEqual(effectiveOffer(offer).requirements, original.requirements)
    assert.deepEqual(employee.roleXp, oldXp)
  })

  await test('an adverse proposal is explicit and may be rejected without changing any contract term', () => {
    const { offer, employee } = fixtures()
    const { rollOfferNegotiation, isOfferNegotiationPending, decideOfferNegotiation, effectiveOffer } = helpers
    const original = structuredClone(offer)
    offer.offerNegotiation = rollOfferNegotiation(offer, employee, 10, 'scope', offer.technology, 0.999)
    assert.equal(offer.offerNegotiation.outcome, 'critical')
    assert.equal(offer.offerNegotiation.proposal.budget, original.budget)
    assert.ok(offer.offerNegotiation.proposal.requirements[0].amount > original.requirements[0].amount)
    assert.ok(offer.offerNegotiation.proposal.debtMultiplier > 1)
    assert.equal(effectiveOffer(offer).acceptedOfferNegotiation, undefined)
    assert.equal(isOfferNegotiationPending(offer), true)
    assert.equal(decideOfferNegotiation(offer, false), true)
    assert.equal(decideOfferNegotiation(offer, true), false)
    assert.equal(isOfferNegotiationPending(offer), false)
    assert.equal(effectiveOffer(offer).budget, original.budget)
    assert.deepEqual(effectiveOffer(offer).requirements, original.requirements)
  })

  await test('successful selected proposal applies only after decision and grants one award at contract then delivery', () => {
    const { offer, employee } = fixtures()
    const {
      rollOfferNegotiation, decideOfferNegotiation, effectiveOffer, applyOfferNegotiationAward, rewardOfferNegotiationDelivery,
    } = helpers
    const initialTechXp = employee.stackXp[offer.technology] ?? 0
    const initialStat = employee.stats.infra
    offer.offerNegotiation = rollOfferNegotiation(offer, employee, 10, 'reliability', offer.technology, 0)
    assert.equal(effectiveOffer(offer).acceptedOfferNegotiation, undefined)
    assert.equal(decideOfferNegotiation(offer, true), true)
    assert.equal(employee.stackXp[offer.technology] ?? 0, initialTechXp)
    const proposed = effectiveOffer(offer)
    assert.ok(proposed.budget > offer.budget)
    assert.ok(proposed.acceptedOfferNegotiation.debtMultiplier < 1)
    const project = offerToProject(proposed)
    applyOfferNegotiationAward(project, [employee])
    applyOfferNegotiationAward(project, [employee])
    assert.equal(employee.stackXp[offer.technology], initialTechXp + 2)
    assert.equal(employee.roleXp.server, 0.75)
    assert.equal(employee.stats.infra, initialStat)
    project.state = 'failed'
    project.result = 'fail'
    rewardOfferNegotiationDelivery(project, [employee])
    assert.equal(employee.stats.infra, initialStat)
    project.state = 'done'
    project.result = 'success'
    rewardOfferNegotiationDelivery(project, [employee])
    rewardOfferNegotiationDelivery(project, [employee])
    assert.equal(employee.stats.infra, initialStat + 0.5)
  })

  await test('communication, delivery skill and technical know-how affect their proposal types', () => {
    const { offer, employee } = fixtures()
    const { offerNegotiationOdds } = helpers
    const known = (goal) => offerNegotiationOdds(offer, employee, 10, goal, offer.technology).success
    const schedule = known('schedule')
    const milestones = known('milestones')
    const scope = known('scope')
    const reliability = known('reliability')
    employee.stats.communication += 35
    assert.ok(known('schedule') > schedule)
    assert.ok(known('milestones') > milestones)
    employee.stats.frontend += 30
    assert.ok(known('scope') > scope)
    employee.stats.infra += 30
    employee.stackXp[offer.technology] += 24
    assert.ok(known('reliability') > reliability)
  })
  await test('a pending offer survives reload and blocks acceptance until explicit rejection', () => {
    const game = new Game(undefined, () => 0.99)
    const offer = game.state.market[0]
    const employee = game.state.employees[0]
    const originalBudget = offer.budget
    const originalDeadline = offer.durationTicks
    const startingCash = game.state.company.cash
    assert.equal(game.negotiateOffer(offer.id, employee.id, 'scope'), true)
    assert.equal(game.negotiateOffer(offer.id, employee.id, 'reliability'), false)
    assert.equal(game.acceptOffer(offer.id, employee.id), false)
    assert.equal(game.state.projects.length, 0)
    assert.equal(game.state.company.cash, startingCash)
    const reloaded = deserializeGame(serializeGame(game))
    assert.equal(reloaded.state.market[0].offerNegotiation.decision, 'pending')
    assert.equal(reloaded.acceptOffer(offer.id, employee.id), false)
    assert.equal(reloaded.resolveOfferNegotiation(offer.id, false), true)
    assert.equal(reloaded.acceptOffer(offer.id, employee.id), true)
    assert.equal(reloaded.acceptOffer(offer.id, employee.id), false)
    assert.equal(reloaded.state.projects[0].budget, originalBudget)
    assert.equal(reloaded.state.projects[0].durationTicks, originalDeadline)
    assert.equal(reloaded.state.company.cash, startingCash + Math.round(originalBudget * 0.3))
    assert.equal(reloaded.state.employees[0].roleXp.frontend, undefined)
  })

  await test('a successful offer concerns terms only until separate contract acceptance', () => {
    const game = new Game(undefined, () => 0)
    const offer = game.state.market[0]
    const employee = game.state.employees[0]
    const oldTechExperience = employee.stackXp[offer.technology]
    const oldBudget = offer.budget
    const startingCash = game.state.company.cash
    assert.equal(game.negotiateOffer(offer.id, employee.id, 'scope'), true)
    assert.equal(game.resolveOfferNegotiation(offer.id, true), true)
    assert.equal(game.state.projects.length, 0)
    assert.equal(game.state.company.cash, startingCash)
    assert.equal(employee.stackXp[offer.technology], oldTechExperience)
    assert.equal(game.acceptOffer(offer.id, employee.id, 'kotlin'), false)
    assert.equal(game.acceptOffer(offer.id, employee.id), true)
    assert.ok(game.state.projects[0].budget < oldBudget)
    assert.ok(game.state.projects[0].acceptedOfferNegotiation.workMultiplier < 1)
    assert.equal(employee.stackXp[offer.technology], oldTechExperience + 2)
    assert.equal(game.state.company.cash, startingCash + Math.round(game.state.projects[0].budget * 0.3))
  })

  await test('three-month offers retain their fixed deadline in every outcome', () => {
    const { offer } = fixtures()
    offer.longContract = { workFactor: 2.6, workDays: 36 }
    offer.durationTicks = 672
    for (const goal of Object.keys(helpers.OFFER_NEGOTIATION_GOALS)) {
      assert.equal(helpers.proposedOfferTerms(offer, goal).durationTicks, 672)
      assert.equal(helpers.proposedOfferTerms(offer, goal, true).durationTicks, 672)
    }
  })
} finally {
  await vite.close()
}
