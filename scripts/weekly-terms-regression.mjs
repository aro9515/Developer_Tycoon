import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { Game } = await vite.ssrLoadModule('/src/core/Game.ts')
  const { createForcedOffer, rollMarketOffer } = await vite.ssrLoadModule('/src/core/market.ts')
  const { createLongContractOffer, longPayments, longRoleXpGain } = await vite.ssrLoadModule('/src/core/longContracts.ts')
  const { offerToProject, tickProject } = await vite.ssrLoadModule('/src/core/project.ts')
  const { deserializeGame, serializeGame } = await vite.ssrLoadModule('/src/core/save.ts')
  const { createEmployee } = await vite.ssrLoadModule('/src/core/staff.ts')

  const WEEK = 56
  function assertQuote(offer) {
    const terms = offer.weeklyTerms
    assert.ok(terms)
    assert.equal(terms.staffing.reduce((sum, allocation) => sum + Math.round(allocation.personWeeks * 100), 0),
      Math.round(terms.personWeeks * 100))
    assert.equal(terms.labor, Math.round(terms.staffing.reduce((sum, allocation) => sum + allocation.personWeeks * allocation.weeklyWage, 0)))
    assert.equal(offer.budget, terms.labor + terms.overhead + terms.risk + terms.margin)
    for (const row of terms.staffing) assert.equal(createEmployee(1, row.role, 1).salary, row.weeklyWage)
  }

  await test('new small and medium quotes have calendar deadlines independent of labor and workload', () => {
    const tutorial = createForcedOffer()
    assert.equal(tutorial.durationTicks, 2 * WEEK)
    assert.equal(tutorial.budget, 150)
    assertQuote(tutorial)
    const weeks = new Set()
    const amounts = new Set()
    for (const trust of [10, 28, 70]) for (const roll of [.03, .5, .97]) {
      const prior = Math.random
      Math.random = () => roll
      try {
        const offer = rollMarketOffer(trust)
        assertQuote(offer)
        assert.equal(offer.durationTicks % WEEK, 0)
        const duration = offer.durationTicks / WEEK
        if (offer.difficulty === 1) assert.equal(duration, 2)
        else assert.ok(duration >= 3 && duration <= 5)
        assert.ok(offer.weeklyTerms.personWeeks < duration)
        weeks.add(duration)
        amounts.add(offer.budget)
      } finally { Math.random = prior }
    }
    const prior = Math.random
    const rolls = [.97, .03]
    Math.random = () => rolls.shift() ?? .5
    try {
      const stableDifficult = rollMarketOffer(70)
      weeks.add(stableDifficult.durationTicks / WEEK)
    } finally { Math.random = prior }
    assert.deepEqual([...weeks].sort(), [2, 3, 4, 5])
    assert.ok(amounts.size > 3)
  })

  function openingLongOffer(random) {
    const game = new Game()
    const s = game.state
    s.market = []
    s.weekIndex = 9
    s.dayOfWeek = 1
    s.company.trust = 60
    const customer = s.customers[0]
    Object.assign(customer, { closedContracts: 2, trust: 88, lastResult: 'great' })
    s.projects = Array.from({ length: 4 }, () => ({ ...offerToProject(createForcedOffer()), state: 'done', customerId: customer.id }))
    const prior = Math.random
    const offerRolls = [.35, .35, .10, .35]
    Math.random = () => offerRolls.shift() ?? random
    try {
      return createLongContractOffer(s).offer
    } finally { Math.random = prior }
  }

  await test('new long quotes emit 10, 11 and 12 weeks and keep existing checkpoint pay and role XP cap', () => {
    const reference = openingLongOffer(.5)
    for (const [random, weeks] of [[0, 10], [.5, 11], [.99, 12]]) {
      const offer = openingLongOffer(random)
      assert.equal(offer.durationTicks, weeks * WEEK)
      assertQuote(offer)
      assert.equal(offer.budget, reference.budget)
      assert.deepEqual(offer.weeklyTerms, reference.weeklyTerms)
      const project = offerToProject(offer)
      assert.equal(project.durationTicks, weeks * WEEK)
      assert.deepEqual(project.weeklyTerms, offer.weeklyTerms)
      const split = longPayments(offer.budget)
      assert.equal(split.advance + split.middle + split.final, offer.budget)
      assert.equal(split.advance, Math.round(offer.budget * .3))
      assert.equal(split.middle, Math.round(offer.budget * .3))
      assert.equal(longRoleXpGain(project, 360, 1), .15)
      assert.equal(longRoleXpGain(project, 361, 1), 0)
    }
  })

  await test('weekly person-work independent of deadline changes actual progress and preserves legacy work', () => {
    const offer = createForcedOffer()
    const employee = createEmployee(1, 'frontend', 1)
    function progress(terms, duration) {
      const project = offerToProject({ ...offer, weeklyTerms: terms, durationTicks: duration })
      project.assigneeIds.push(employee.id)
      tickProject(project, [employee])
      return project.progress
    }
    const original = progress(undefined, 38)
    assert.equal(original, progress(undefined, 180))
    assert.equal(progress(offer.weeklyTerms, 112), progress(offer.weeklyTerms, 180))
    assert.ok(progress(offer.weeklyTerms, 112) < original)
    assert.ok(progress({ ...offer.weeklyTerms, workFactor: offer.weeklyTerms.workFactor * 2 }, 112) < progress(offer.weeklyTerms, 112))
  })

  await test('loaded listed and accepted contracts keep prior deadlines, budgets and effort factors', () => {
    const game = new Game()
    const listing = game.state.market[0]
    listing.durationTicks = 38
    listing.budget = 650
    delete listing.weeklyTerms
    const legacy = offerToProject({ ...listing, durationTicks: 672, budget: 1590, longContract: { workFactor: 5, workDays: 24 } })
    legacy.state = 'inDev'
    game.state.projects.push(legacy)
    const reopened = deserializeGame(serializeGame(game))
    const loaded = reopened.state.market[0]
    assert.deepEqual([loaded.durationTicks, loaded.budget, loaded.weeklyTerms], [38, 650, undefined])
    const ongoing = reopened.state.projects[0]
    assert.deepEqual([ongoing.durationTicks, ongoing.budget, ongoing.longContract.workFactor, ongoing.weeklyTerms], [672, 1590, 5, undefined])
    reopened.state.company.projectSlots = 2
    assert.ok(reopened.acceptOffer(loaded.id))
    assert.deepEqual(reopened.state.projects.slice(-1).map(p => [p.durationTicks, p.budget, p.advance]), [[38, 650, 195]])
  })
} finally {
  await vite.close()
}
