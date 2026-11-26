import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try {
  const { createNewGame } = await vite.ssrLoadModule('/src/core/Game.ts')
  let app
  try {
    app = await vite.ssrLoadModule('/src/core/enterprise.ts')
  } catch (error) {
    if (!error.message.includes('/src/core/enterprise.ts')) throw error
  }
  assert.ok(app, 'Enterprise sales and support rules must be available')
  const { adChannels, advanceEnterpriseDay, enterpriseProgress, initializeEnterprise, legacyProductProjects,
    quoteOutsourceCampaign, resolveOutsourceCampaign, runEnterpriseAction, settleEnterpriseWeek, solutionPrices } = app
  const always = () => 0
  const apply = (state, action) => {
    const result = runEnterpriseAction(state, action, always)
    if (result) state.company.cash += result.income - result.expense
    return result
  }
  const client = (id, trust = 80) => ({
    id, name: id, trust, closedContracts: 1, lastResult: 'success', lastOfferTick: null, nextFollowUp: null,
  })
  function fixture(deliveries = 4) {
    const state = createNewGame()
    state.company.cash = 10000
    const product = { id: 'fixture-product', isProduct: true, state: 'done', domain: 'operations', technology: 'javascript', issue: null }
    state.projects = [product, ...Array.from({ length: deliveries }, (_, index) => ({
      id: 'fixture-delivery-' + index, isProduct: false, state: 'done', client: '단기 고객 ' + index,
    }))]
    state.customers = [client('retail'), client('office')]
    initializeEnterprise(state)
    return { state, employeeId: state.employees[0].id, product }
  }
  function demo(state, customerId, employeeId) {
    assert.ok(apply(state, { type: 'trial', customerId, employeeId }))
    state.weekIndex++
    state.tick += 56
    advanceEnterpriseDay(state, always)
  }

  await test('explicit enterprise model pricing, worked-week rules, paid renewals, legacy excluded only when operated', () => {
    const { state, employeeId, product } = fixture()
    delete state.enterprise
    initializeEnterprise(state)
    assert.deepEqual(legacyProductProjects(state).map((p) => p.id), [product.id])
    state.customers[0].trust = 55
    assert.equal(apply(state, { type: 'trial', customerId: 'retail', employeeId }), null)
    state.customers[0].trust = 80
    demo(state, 'retail', employeeId)
    assert.deepEqual(legacyProductProjects(state).map((p) => p.id), [product.id])
    const license = { type: 'sell', customerId: 'retail', employeeId, model: 'license' }
    const price = solutionPrices(state, 'retail', 'license')
    assert.equal(apply(state, license).income, price.onboarding + price.monthly)
    assert.equal(apply(state, license), null)
    assert.equal(enterpriseProgress(state).paidCustomers, 1)
    assert.deepEqual(legacyProductProjects(state), [])
    assert.equal(apply(state, { type: 'renew', customerId: 'retail', employeeId }), null)
    state.weekIndex = 4
    const beforeRenew = state.enterprise.accounts[0].paidUntil
    assert.equal(apply(state, { type: 'renew', customerId: 'retail', employeeId }).income, price.monthly)
    assert.equal(state.enterprise.accounts[0].paidUntil, beforeRenew + 1)
    assert.equal(apply(state, { type: 'renew', customerId: 'retail', employeeId }), null)
    assert.equal(enterpriseProgress(state).renewals, 1)
  })

  await test('license onboarding is one-time and renewals open for the last two weeks', () => {
    const { state, employeeId } = fixture()
    demo(state, 'retail', employeeId)
    const purchase = { type: 'sell', customerId: 'retail', employeeId, model: 'license' }
    const initial = solutionPrices(state, 'retail', 'license')
    assert.equal(apply(state, purchase).income, initial.onboarding + initial.monthly)
    state.weekIndex = 3
    assert.equal(apply(state, { type: 'renew', customerId: 'retail', employeeId }).income, initial.monthly)
    state.weekIndex = 4
    assert.equal(apply(state, { type: 'renew', customerId: 'retail', employeeId }), null)
    assert.equal(state.enterprise.accounts[0].paidUntil, 3)
    state.weekIndex = 9
    demo(state, 'retail', employeeId)
    assert.equal(solutionPrices(state, 'retail', 'license').onboarding, 0)
    assert.equal(apply(state, purchase).income, initial.monthly)
    assert.equal(state.enterprise.accounts.length, 1)
    assert.equal(enterpriseProgress(state).renewals, 1)
  })

  await test('product channels create segment prospects and subscription includes support once', () => {
    const { state, employeeId } = fixture(12)
    const offer = apply(state, { type: 'advertise', channel: 'online', market: 'domestic', target: 'small' })
    assert.equal(offer.expense, 30)
    assert.equal(apply(state, { type: 'advertise', channel: 'newspaper', market: 'domestic', target: 'small' }), null)
    state.tick += 56
    advanceEnterpriseDay(state, always)
    const prospect = state.enterprise.opportunities[0]
    assert.ok(prospect.customerId)
    demo(state, prospect.customerId, employeeId)
    const amount = solutionPrices(state, prospect.customerId, 'subscription')
    assert.equal(amount.onboarding, 0)
    assert.equal(apply(state, { type: 'sell', customerId: prospect.customerId, employeeId, model: 'subscription' }).income, amount.monthly)
    assert.equal(settleEnterpriseWeek(state, always).income, 0)
  })

  await test('support queues consume employee capacity, raise hosting, and recover satisfaction', () => {
    const { state, employeeId } = fixture()
    demo(state, 'retail', employeeId)
    apply(state, { type: 'sell', customerId: 'retail', employeeId, model: 'license' })
    const account = state.enterprise.accounts[0]
    const noStaff = settleEnterpriseWeek(state, always)
    assert.ok(noStaff.expense > 0)
    assert.ok(account.backlog > 0)
    assert.ok(account.satisfaction < 76)
    const before = account.satisfaction
    const backlog = account.backlog
    assert.equal(settleEnterpriseWeek(state, always).expense, 0, 'same week cannot be settled twice')
    state.weekIndex++
    assert.ok(apply(state, { type: 'support', employeeIds: [employeeId, employeeId] }))
    assert.equal(state.enterprise.support.employeeIds.length, 1)
    settleEnterpriseWeek(state, always)
    assert.ok(account.backlog < backlog)
    assert.ok(account.satisfaction > before)
    assert.ok(apply(state, { type: 'automate' }).expense > 0)
  })

  await test('entry requires paid relationships and yields a paid customer and renewal in a distinct market', () => {
    const { state, employeeId } = fixture(8)
    assert.equal(apply(state, { type: 'enter-market', market: 'japan' }), null)
    demo(state, 'retail', employeeId)
    apply(state, { type: 'sell', customerId: 'retail', employeeId, model: 'license' })
    state.weekIndex = 4
    apply(state, { type: 'renew', customerId: 'retail', employeeId })
    assert.ok(apply(state, { type: 'enter-market', market: 'japan' }))
    state.tick += 112
    state.weekIndex += 2
    advanceEnterpriseDay(state, always)
    assert.ok(apply(state, { type: 'advertise', channel: 'banner', market: 'japan', target: 'large' }))
    state.tick += 56
    advanceEnterpriseDay(state, always)
    assert.equal(state.enterprise.opportunities.length, 2)
    const lead = state.enterprise.opportunities[0]
    demo(state, lead.customerId, employeeId)
    assert.ok(apply(state, { type: 'sell', customerId: lead.customerId, employeeId, model: 'subscription' }))
    assert.deepEqual(enterpriseProgress(state).activeMarkets.sort(), ['domestic', 'japan'])
    state.weekIndex = 8
    assert.ok(apply(state, { type: 'renew', customerId: lead.customerId, employeeId }))
    assert.equal(enterpriseProgress(state).overseasRenewals, 1)
  })

  await test('outsourcing ad quotes enforce stage unlocks and retain old campaign semantics', () => {
    const { state } = fixture(0)
    assert.equal(quoteOutsourceCampaign(state).cost, 250)
    assert.equal(quoteOutsourceCampaign(state, 'online').cost, 30)
    assert.equal(quoteOutsourceCampaign(state, 'radio'), null)
    assert.equal(adChannels.length, 6)
    state.enterprise.outsourceChannel = 'online'
    assert.equal(resolveOutsourceCampaign(state, () => 0.99), false)
    assert.equal(state.enterprise.outsourceChannel, null)
    assert.equal(resolveOutsourceCampaign(state, () => 0.99), true)
  })
} finally {
  await vite.close()
}
