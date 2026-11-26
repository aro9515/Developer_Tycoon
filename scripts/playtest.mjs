import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
let failures = 0
const check = (label, test) => {
  try {
    test()
    console.log('PASS', label)
  } catch (error) {
    failures++
    console.error('FAIL', label, error.message)
  }
}

try {
  const { Game } = await server.ssrLoadModule('/src/core/Game.ts')
  const { deserializeGame, serializeGame } = await server.ssrLoadModule('/src/core/save.ts')
  const { weeklyRent } = await server.ssrLoadModule('/src/core/growth.ts')
  const { BALANCE } = await server.ssrLoadModule('/src/data/balance.ts')
  const tick = (game, count) => {
    game.setSpeed(1)
    for (let index = 0; index < count; index++) { game.setSpeed(1); game.tick() }
    game.setSpeed(0)
  }
  const finishTutorialInFirstWeek = (game, project) => {
    const weekTicks = BALANCE.DAYS_PER_WEEK * BALANCE.TICKS_PER_DAY
    while (project.state !== 'done' && game.state.tick < weekTicks) tick(game, 1)
    assert.equal(project.state, 'done')
    assert.equal(game.state.weekIndex, 1)
  }
  const first = (game) => {
    const player = game.state.employees[0]
    assert.equal(game.acceptOffer(game.state.market[0].id, player.id), true)
    return { player, project: game.state.projects[0] }
  }
  const offers = (game) => game.state.market.map((offer) => offer.id)
  check('market refreshes at the start of month two, while costs settle every week', () => {
    const game = new Game()
    const original = offers(game)
    const cash = game.state.company.cash
    tick(game, 56)
    assert.deepEqual(offers(game), original)
    assert.ok(game.state.company.cash < cash)
    tick(game, 168)
    assert.equal(game.state.weekIndex, 5)
    assert.notDeepEqual(offers(game), original)
  })
  check('acceptance appoints a lead and protects the last assignment', () => {
    const game = new Game()
    const { player, project } = first(game)
    assert.deepEqual(project.assigneeIds, [player.id])
    assert.equal(game.assignEmployee(player.id, null, true), false)
    assert.equal(player.assignedProjectId, project.id)
  })
  check('normal delivery frees the same worker for another contract this week', () => {
    const game = new Game(undefined, () => 0.99)
    const { player, project } = first(game)
    finishTutorialInFirstWeek(game, project)
    assert.equal(game.state.weekIndex, 1)
    assert.equal(player.assignedProjectId, null)
    const before = { cash: game.state.company.cash, elapsed: project.elapsedTicks, payout: project.payout }
    const next = game.state.market[0]
    const advance = Math.round(next.budget * 0.3)
    assert.equal(game.acceptOffer(next.id, player.id), true)
    const followUp = game.state.projects[1]
    assert.equal(followUp.elapsedTicks, 0)
    assert.equal(game.state.company.cash, before.cash + advance)
    tick(game, 1)
    assert.equal(game.state.weekIndex, 1)
    assert.equal(followUp.elapsedTicks, 1)
    assert.equal(project.elapsedTicks, before.elapsed)
    assert.equal(project.payout, before.payout)
    assert.equal(game.state.company.cash, before.cash + advance)
  })
  check('delivery availability survives reload and applies only to client contract work', () => {
    const game = new Game(undefined, () => 0.99)
    const { player, project } = first(game)
    assert.equal(game.hireEmployee('backend'), true)
    finishTutorialInFirstWeek(game, project)
    const restored = deserializeGame(serializeGame(game))
    const worker = restored.state.employees[1]
    assert.equal(restored.startTraining(player.id, 'linux'), false)
    const next = restored.state.market[0]
    assert.equal(restored.acceptOffer(next.id, worker.id), true)
    const followUp = restored.state.projects[1]
    assert.equal(restored.assignEmployee(player.id, followUp.id), true)
    assert.deepEqual(followUp.assigneeIds, [worker.id, player.id])
  })
  check('cancellation after work does not unlock another contract in the same week', () => {
    const game = new Game()
    const { player, project } = first(game)
    tick(game, 4)
    assert.equal(game.cancelProject(project.id), true)
    assert.equal(game.acceptOffer(game.state.market[0].id, player.id), false)
  })
  check('cancellation returns the whole advance and preserves earned know-how', () => {
    const game = new Game()
    const cash = game.state.company.cash
    const { player, project } = first(game)
    const previous = player.stackXp.javascript
    tick(game, 4)
    assert.ok(player.stackXp.javascript > previous)
    const earned = player.stackXp.javascript
    assert.equal(game.cancelProject(project.id), true)
    assert.equal(project.state, 'canceled')
    assert.equal(game.state.company.cash, cash)
    assert.equal(player.stackXp.javascript, earned)
    assert.equal(game.cancelProject(project.id), false)
  })
  check('vacant contracts age and fail at the deadline', () => {
    const game = new Game()
    const player = game.state.employees[0]
    assert.equal(game.hireEmployee('backend'), true)
    const employee = game.state.employees[1]
    assert.equal(game.acceptOffer(game.state.market[0].id, employee.id), true)
    const project = game.state.projects[0]
    project.durationTicks = 70
    tick(game, 4)
    game.departEmployee(employee.id)
    assert.equal(player.assignedProjectId, null)
    assert.equal(project.assigneeIds.length, 0)
    tick(game, 66)
    assert.equal(project.state, 'failed')
    assert.equal(project.elapsedTicks, 70)
    assert.equal(project.payout, 0)
  })
  check('ongoing assigned contracts survive month-end refresh', () => {
    const game = new Game()
    tick(game, 220)
    const { project } = first(game)
    const id = project.id
    tick(game, 4)
    assert.equal(game.state.weekIndex, 5)
    assert.equal(game.state.projects[0].id, id)
    assert.equal(game.state.projects[0].assigneeIds.length, 1)
  })
  check('training gains stop at emergency reassignment', () => {
    const game = new Game()
    assert.equal(game.hireEmployee('backend'), true)
    const worker = game.state.employees[1]
    assert.equal(game.startTraining(worker.id, 'linux'), true)
    tick(game, 8)
    const learned = worker.stackXp.linux
    assert.ok(learned > 0)
    const { project } = first(game)
    assert.equal(game.assignEmployee(worker.id, project.id), false)
    assert.equal(game.assignEmployee(worker.id, project.id, true), true)
    tick(game, 4)
    assert.equal(worker.stackXp.linux, learned)
  })
  check('technical debt survives a cash incident settlement', () => {
    const game = new Game()
    const { project } = first(game)
    project.debt = 100
    game.state.company.heat = 100
    game.state.company.dp = 100
    tick(game, 56)
    assert.equal(weeklyRent(game.state), 44)
    const fixedCosts = weeklyRent(game.state) + BALANCE.WEEKLY_SERVER
    assert.equal(game.state.company.cash, 800 + project.advance + project.payout - fixedCosts - Math.round(80 + game.state.company.dp * 0.5))
    assert.ok(project.debt >= 100)
    assert.ok(game.state.company.heat < 85)
  })
  check('outsourcing costs money and time before repair reduces project debt', () => {
    const game = new Game()
    const { project } = first(game)
    tick(game, 40)
    assert.equal(project.state, 'done')
    project.debt = 20
    project.issue = { remaining: 10, source: '점검', assignedId: null, outsourcedUntil: null }
    assert.equal(game.outsourceRepair(project.id), true)
    assert.equal(project.debt, 20)
    tick(game, 56)
    assert.equal(project.issue, null)
    assert.ok(project.debt < 20)
  })
  check('client scope changes pause time and update contract when accepted', () => {
    const game = new Game(undefined, () => 0)
    game.state.market[0].difficulty = 2
    game.state.market[0].style = 'changing'
    const { project } = first(game)
    game.advance('week')
    assert.ok(project.scopePending)
    assert.equal(game.state.speed, 0)
    const original = project.budget
    assert.equal(game.resolveScope(project.id, true), true)
    assert.ok(project.budget > original)
    assert.equal(project.scopePending, false)
  })
  check('pilot uses the relevant skill and unlocks a selectable alternative', () => {
    const game = new Game()
    assert.equal(game.hireEmployee('backend'), true)
    const staff = game.state.employees[1]
    assert.equal(game.startTraining(staff.id, 'linux', true), false)
    assert.equal(game.startTraining(staff.id, 'spring', true), true)
    tick(game, 32)
    assert.ok(game.state.company.validated.includes('spring'))
    assert.equal(game.state.company.research, 3)
    const lead = game.state.employees[0]
    const offer = game.state.market[0]
    offer.alternatives = ['spring']
    assert.equal(game.acceptOffer(offer.id, lead.id, 'spring'), true)
    assert.equal(game.state.projects[0].technology, 'spring')
  })
  check('an advanced PM spends research and a successful negotiation changes the deadline', () => {
    const game = new Game(undefined, () => 0)
    assert.equal(game.hireEmployee('coordinator'), true)
    const candidate = game.state.employees[1]
    assert.equal(game.changeRole(candidate.id, 'pm'), false)
    candidate.roleXp.frontend = 32
    candidate.roleXp.coordinator = 32
    for (const role of ['coordinator', 'frontend']) {
      if (candidate.role !== role) assert.equal(game.changeRole(candidate.id, role), true)
      for (let level = 1; level < 5; level++) assert.equal(game.levelUpRole(candidate.id), true)
    }
    assert.equal(game.changeRole(candidate.id, 'pm'), true)
    const { project } = first(game)
    game.state.company.research = 3
    const before = project.durationTicks
    assert.equal(game.negotiateProject(project.id, candidate.id, 'time', true), true)
    assert.equal(project.durationTicks, before + 56)
    assert.equal(game.state.company.research, 0)
    assert.equal(game.negotiateProject(project.id, candidate.id, 'time', true), false)
  })
  check('salary reviews honor each employee anniversary', () => {
    const game = new Game()
    assert.equal(game.hireEmployee('backend'), true)
    const employee = game.state.employees[1]
    assert.equal(game.negotiateSalary(employee.id, employee.salary + 5), false)
    game.state.weekIndex = employee.hiredWeek + 48
    const salary = employee.salary + 5
    assert.equal(game.negotiateSalary(employee.id, salary), true)
    assert.equal(employee.salary, salary)
    assert.equal(game.negotiateSalary(employee.id, salary + 5), false)
  })
  check('legacy saves retain balancing state and can repay inherited debt', () => {
    const game = new Game()
    const { project } = first(game)
    const legacy = JSON.parse(serializeGame(game))
    legacy.version = 1
    legacy.company.dp = 25
    delete legacy.company.research
    delete legacy.projects[0].debt
    delete legacy.projects[0].technology
    const restored = deserializeGame(JSON.stringify(legacy))
    assert.equal(restored.state.version, 2)
    assert.equal(restored.state.company.dp, 25)
    assert.equal(restored.state.company.research, 0)
    assert.equal(restored.state.projects[0].id, project.id)
    assert.equal(restored.state.projects[0].debt, 25)
  })
  check('paid promotion produces one new client offer after three days, once per month', () => {
    const game = new Game(undefined, () => 0.99)
    const cash = game.state.company.cash
    const market = game.state.market.length
    const employees = structuredClone(game.state.employees)
    assert.equal(game.startPromotion(), true)
    assert.equal(game.state.company.cash, cash - 250)
    assert.equal(game.startPromotion(), false)
    assert.deepEqual(game.state.employees, employees)
    tick(game, 23)
    assert.equal(game.state.market.length, market)
    tick(game, 1)
    const offer = game.state.market.find((entry) => entry.source === 'promotion')
    assert.ok(offer)
    assert.equal(game.state.market.length, market + 1)
    const customer = game.state.customers.find((item) => item.id === offer.customerId)
    assert.equal(customer.name, offer.client)
    assert.equal(customer.trust, 50)
    assert.equal(game.startPromotion(), false)
    const events = game.drainEvents()
    assert.ok(events.some((e) => e.action === 'sales' && e.result === 'started' && e.amount === 250))
    assert.ok(events.some((e) => e.action === 'customer' && e.result === 'acquired' && e.customerId === customer.id))
    assert.equal(deserializeGame(serializeGame(game)).state.customers.find((item) => item.id === customer.id).name, customer.name)
    tick(game, 200)
    assert.equal(game.state.market.filter((entry) => entry.source === 'monthly').length, 3)
    assert.equal(game.startPromotion(), true)
  })
  check('quality delivery schedules a related follow-up, but an open customer offer postpones it', () => {
    const game = new Game(undefined, () => 0.99)
    const { project } = first(game)
    const customer = game.state.customers.find((item) => item.id === project.customerId)
    const duplicate = { ...game.state.market[0], id: 'open-fixture', client: project.client, customerId: customer.id }
    game.state.market.push(duplicate)
    finishTutorialInFirstWeek(game, project)
    assert.equal(customer.trust, 68)
    assert.equal(customer.closedContracts, 1)
    assert.ok(customer.nextFollowUp)
    tick(game, 72)
    assert.equal(game.state.market.some((offer) => offer.source === 'followup'), false)
    game.state.market = game.state.market.filter((offer) => offer.customerId !== customer.id)
    tick(game, 8)
    const followup = game.state.market.filter((offer) => offer.source === 'followup')
    assert.equal(followup.length, 1)
    assert.equal(followup[0].customerId, customer.id)
    assert.equal(followup[0].domain, project.domain)
    assert.equal(customer.nextFollowUp, null)
    tick(game, 8)
    assert.equal(game.state.market.filter((offer) => offer.source === 'followup').length, 1)
  })
  check('failed delivery reduces the customer relationship and yields no follow-up', () => {
    const game = new Game(undefined, () => 0.99)
    const { project } = first(game)
    const customer = game.state.customers.find((item) => item.id === project.customerId)
    project.bugs = 500
    tick(game, 40)
    assert.equal(project.state, 'failed')
    assert.equal(customer.trust, 34)
    assert.equal(customer.lastResult, 'fail')
    assert.equal(customer.nextFollowUp, null)
    tick(game, 80)
    assert.equal(game.state.market.some((offer) => offer.source === 'followup'), false)
  })
  check('older saves keep balances and the existing contracts without retroactive follow-ups', () => {
    const game = new Game(undefined, () => 0.99)
    const { project } = first(game)
    finishTutorialInFirstWeek(game, project)
    const legacy = JSON.parse(serializeGame(game))
    delete legacy.customers
    delete legacy.sales
    for (const item of [...legacy.projects, ...legacy.market]) {
      delete item.customerId
      delete item.source
      delete item.customerRecorded
      delete item.weeklyTerms
    }
    const restored = deserializeGame(JSON.stringify(legacy))
    assert.equal(restored.state.company.cash, legacy.company.cash)
    assert.deepEqual(restored.state.projects.map((item) => [item.id, item.client, item.state]), [[project.id, project.client, 'done']])
    assert.deepEqual(restored.state.market.map((item) => [item.id, item.client]), legacy.market.map((item) => [item.id, item.client]))
    const client = restored.state.customers.find((item) => item.name === project.client)
    assert.equal(client.closedContracts, 1)
    assert.equal(client.nextFollowUp, null)
    assert.equal(restored.drainEvents().length, 0)
    assert.equal(deserializeGame(serializeGame(restored)).state.customers.find((item) => item.id === client.id).closedContracts, 1)
  })
  check('save round trip retains activities, research, and project data', () => {
    const game = new Game()
    const { project } = first(game)
    game.state.company.research = 4
    const restored = deserializeGame(serializeGame(game))
    assert.equal(restored.state.company.research, 4)
    assert.equal(restored.state.projects[0].technology, project.technology)
    assert.deepEqual(restored.state.projects[0].assigneeIds, project.assigneeIds)
  })
} finally {
  await server.close()
}

if (failures) process.exitCode = 1
