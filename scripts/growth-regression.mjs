import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true },
})
const baseProgress = {
  paidCustomers: 0, renewals: 0, activeMarkets: [], overseasCustomers: 0, overseasRenewals: 0, monthlyRecurringNet: 0,
}
const globalProgress = {
  paidCustomers: 3, renewals: 3, activeMarkets: ['domestic', 'japan', 'northAmerica'],
  overseasCustomers: 2, overseasRenewals: 2, monthlyRecurringNet: 400,
}
try {
  const {
    closeOperatingMonth, emptyGrowth, finishGrowth, growthEndingReady, growthStage, hydrateGrowth,
    operatingRunway, postOperating, raiseInvestment, updateGrowth, weeklyRent,
  } = await vite.ssrLoadModule('/src/core/growth.ts')
  const { Game } = await vite.ssrLoadModule('/src/core/Game.ts')
  const { deserializeGame, serializeGame } = await vite.ssrLoadModule('/src/core/save.ts')
  const { offerToProject } = await vite.ssrLoadModule('/src/core/project.ts')
  const { createEmployee } = await vite.ssrLoadModule('/src/core/staff.ts')
  function start(weekIndex = 1, tick = 0) {
    const state = { weekIndex, tick, company: { cash: 800 }, employees: [{ salary: 0 }], projects: [], gameOver: false }
    hydrateGrowth(state)
    return state
  }
  function month(state, index, income = 200, expenses = 100) {
    state.weekIndex = index * 4
    postOperating(state, 'contracts', income)
    postOperating(state, 'payroll', -expenses)
    closeOperatingMonth(state)
  }

  await test('Operating entries change actual cash and close one signed month once', () => {
    const state = start()
    assert.deepEqual(state.growth, emptyGrowth())
    month(state, 1, 200, 300)
    closeOperatingMonth(state)
    assert.equal(state.company.cash, 700)
    assert.equal(state.growth.current.month, 2)
    assert.deepEqual(state.growth.months.map(({ month, complete, income, expenses, balance }) =>
      [month, complete, income, expenses, balance]), [[1, true, 200, 300, 700]])
    assert.equal(operatingRunway(state)?.weeks, 28)
  })

  await test('Real week advancement closes the original weekly costs into month 1', () => {
    const game = new Game(undefined, () => 0.99)
    for (let week = 1; week <= 4; week++) game.advance('week')
    const { company, growth, weekIndex } = game.state
    assert.equal(weekIndex, 5)
    assert.equal(company.cash, 600)
    assert.equal(growth.current.month, 2)
    assert.deepEqual(growth.months.map(({ month, balance, income, expenses, categories }) =>
      [month, balance, income, expenses, categories]), [[1, 600, 0, 200, { rent: -160, hosting: -40 }]])
  })

  await test('Old Game snapshots keep cash and do not invent historical operating profit', () => {
    const original = new Game(undefined, () => 0.99)
    original.advance('week')
    const { cash } = original.state.company
    const previous = JSON.parse(serializeGame(original))
    delete previous.growth
    const imported = deserializeGame(JSON.stringify(previous))
    assert.ok(imported)
    assert.equal(imported.state.company.cash, cash)
    assert.equal(imported.state.growth.current.complete, false)
    assert.deepEqual(imported.state.growth.months, [])
    assert.deepEqual(imported.state.growth.quarters, [])
  })

  await test('Return, payroll and overseas checks unlock the five persistent stages', () => {
    const state = start()
    state.employees.push({ salary: 35 })
    updateGrowth(state, baseProgress)
    assert.equal(growthStage(state).index, 0)
    assert.equal(weeklyRent(state), 40)
    state.projects.push({ state: 'done', isProduct: false, result: 'success' })
    updateGrowth(state, baseProgress)
    assert.equal(growthStage(state).index, 1)
    updateGrowth(state, { ...baseProgress, paidCustomers: 1 })
    assert.equal(growthStage(state).index, 2)
    updateGrowth(state, { ...baseProgress, paidCustomers: 1, renewals: 1, monthlyRecurringNet: 139 })
    assert.equal(growthStage(state).index, 2)
    updateGrowth(state, { ...baseProgress, paidCustomers: 1, renewals: 1, monthlyRecurringNet: 140 })
    assert.equal(growthStage(state).index, 3)
    updateGrowth(state, { ...globalProgress, overseasRenewals: 0 })
    assert.equal(growthStage(state).index, 3)
    updateGrowth(state, globalProgress)
    assert.equal(growthStage(state).index, 4)
    assert.equal(weeklyRent(state), 120)
    updateGrowth(state, baseProgress)
    assert.equal(growthStage(state).index, 4)
  })

  await test('Investment is optional, once-only capital and never makes operating losses profitable', () => {
    const state = start()
    assert.equal(raiseInvestment(state), false)
    state.projects.push({ state: 'done', isProduct: false, result: 'success' })
    updateGrowth(state, baseProgress)
    postOperating(state, 'ads', -100)
    assert.equal(raiseInvestment(state), true)
    assert.equal(raiseInvestment(state), false)
    assert.equal(state.company.cash, 1000)
    assert.equal(state.growth.current.capital, 300)
    assert.equal(state.growth.current.income, 0)
    for (let index = 1; index <= 3; index++) month(state, index, 10, 50)
    assert.equal(state.growth.quarters[0].profit, -220)
    assert.equal(state.growth.profitableQuarters, 0)
  })

  await test('A migrated partial month cannot silently count toward the first quarter', () => {
    const state = start(2, 56)
    assert.equal(state.growth.current.complete, false)
    for (let index = 1; index <= 6; index++) month(state, index)
    assert.equal(state.growth.quarters[0].profit, null)
    assert.equal(state.growth.quarters[1].profit, 300)
    assert.equal(state.growth.profitableQuarters, 1)
    const restored = JSON.parse(JSON.stringify(state))
    hydrateGrowth(restored)
    assert.deepEqual(restored.growth, state.growth)
    assert.equal(start(5, 224).growth.current.complete, true)
  })

  await test('Installed customers in three markets sustain 48 real weeks, renew, and unlock each ending', () => {
    const game = new Game(undefined, () => 0.99)
    const state = game.state
    const template = state.market[0]
    const product = { ...offerToProject(template), isProduct: true, state: 'done', progress: 100, result: 'success' }
    state.projects = [product, { ...offerToProject(template), state: 'done', progress: 100, result: 'success' }]
    state.enterprise.primaryProductId = product.id
    state.enterprise.automation = 3
    state.company.cash = 2400
    state.employees.push(createEmployee(1, 'coordinator', 1), createEmployee(1, 'coordinator', 2))
    for (const [index, market] of ['domestic', 'japan', 'northAmerica'].entries()) {
      const customerId = 'fixture-established-' + index
      state.customers.push({ id: customerId, name: customerId, trust: 80, closedContracts: 2, lastResult: 'success',
        lastOfferTick: null, nextFollowUp: null })
      state.enterprise.markets[market].open = true
      state.enterprise.profiles[customerId] = { market, size: 'large' }
      state.enterprise.accounts.push({ customerId, model: 'subscription', paidUntil: 2, satisfaction: 100, backlog: 0, renewals: 0 })
    }
    for (let week = 1; week <= 48; week++) {
      if (week % 4 === 0) {
        for (const [index, account] of state.enterprise.accounts.entries()) {
          assert.equal(game.enterpriseAction({ type: 'renew', customerId: account.customerId,
            employeeId: state.employees[index].id }), true)
          assert.equal(account.renewals, week / 4)
        }
      } else {
        assert.equal(game.enterpriseAction({ type: 'support', employeeIds: state.employees.slice(1).map((employee) => employee.id) }), true)
      }
      game.advance('week')
      assert.equal(state.weekIndex, week + 1)
      assert.equal(state.gameOver, false)
    }
    assert.equal(state.growth.profitableQuarters, 4)
    assert.equal(growthStage(state).index, 4)
    assert.ok(state.company.cash > 2400)
    for (const path of ['independent', 'ipo', 'acquisition']) {
      const imported = deserializeGame(serializeGame(game))
      assert.ok(imported)
      assert.equal(imported.finishGrowth(path), true)
      assert.equal(imported.state.growth.ending.path, path)
    }
  })

  await test('Ending needs three distinct concurrently paying markets and four consecutive profitable quarters', () => {
    const state = start()
    for (let index = 1; index <= 12; index++) month(state, index)
    assert.equal(state.growth.profitableQuarters, 4)
    assert.equal(growthEndingReady(state, { ...globalProgress, activeMarkets: ['domestic', 'japan', 'japan'] }), false)
    assert.equal(growthEndingReady(state, globalProgress), true)
    for (const path of ['independent', 'ipo', 'acquisition']) {
      const branch = JSON.parse(JSON.stringify(state))
      const before = branch.company.cash
      assert.equal(finishGrowth(branch, globalProgress, path), true)
      assert.equal(branch.growth.ending.path, path)
      assert.equal(branch.company.cash - before, path === 'ipo' ? 900 : 0)
      assert.equal(branch.growth.current.income, 0)
      assert.equal(branch.growth.current.capital, path === 'ipo' ? 900 : 0)
      assert.equal(finishGrowth(branch, globalProgress, 'independent'), false)
    }
    for (let index = 13; index <= 15; index++) month(state, index, 0, 50)
    assert.equal(state.growth.profitableQuarters, 0)
    assert.equal(growthEndingReady(state, globalProgress), false)
    for (let index = 16; index <= 27; index++) month(state, index)
    assert.equal(state.growth.profitableQuarters, 4)
    assert.equal(growthEndingReady(state, globalProgress), true)
  })
} finally {
  await vite.close()
}
