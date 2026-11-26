import { BALANCE } from '@/data/balance'
import { SALES_RULES, WEEKS_PER_MONTH } from '@/data/rules'
import { resolveOutsourceCampaign } from './enterprise'
import { rollMarketOffer } from './market'
import { isActive } from './project'
import type { Customer, GameSnapshot, MarketOffer, Project, Sales } from './types'
import { clamp } from './utils'

const TRUST_CHANGE = { great: 18, success: 12, ok: -4, fail: -16 } as const
const FOLLOWUP_TICKS = SALES_RULES.followUpDays * BALANCE.TICKS_PER_DAY

export function gameMonth(week: number): number {
  return Math.floor((week - 1) / WEEKS_PER_MONTH) + 1
}

export function emptySales(): Sales {
  return { startedMonth: 0, campaignDueTick: null, nextLeadNumber: 1 }
}

function customerFor(state: GameSnapshot, name: string): Customer {
  const existing = state.customers.find((entry) => entry.name === name)
  if (existing) return existing
  let hash = 2166136261
  for (const character of name) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619)
  const prefix = 'customer-' + (hash >>> 0).toString(36)
  let id = prefix
  let suffix = 1
  while (state.customers.some((entry) => entry.id === id)) id = prefix + '-' + suffix++
  const customer: Customer = {
    id, name, trust: SALES_RULES.startingTrust, closedContracts: 0,
    lastResult: null, lastOfferTick: null, nextFollowUp: null,
  }
  state.customers.push(customer)
  return customer
}

export function linkOffer(state: GameSnapshot, offer: MarketOffer): MarketOffer {
  if (!offer.customerId) offer.customerId = customerFor(state, offer.client).id
  offer.source ??= 'monthly'
  return offer
}

export function initializeCustomers(state: GameSnapshot): GameSnapshot {
  const migrating = !Array.isArray(state.customers)
  if (migrating) state.customers = []
  state.sales ??= emptySales()
  for (const project of state.projects) {
    if (project.isProduct) continue
    const customer = customerFor(state, project.client)
    project.customerId ??= customer.id
    project.source ??= 'monthly'
    if (migrating && (project.state === 'done' || project.state === 'failed')) {
      customer.closedContracts++
      project.customerRecorded = true
    }
  }
  for (const offer of state.market) linkOffer(state, offer)
  if (state.lastResult && !state.lastResult.isProduct) {
    state.lastResult.customerId ??= customerFor(state, state.lastResult.client).id
    state.lastResult.source ??= 'monthly'
  }
  return state
}

export function recordCustomerOutcome(state: GameSnapshot, project: Project): Customer | undefined {
  if (project.isProduct || project.customerRecorded || !project.result) return undefined
  const customer = customerFor(state, project.client)
  project.customerId ??= customer.id
  project.customerRecorded = true
  customer.closedContracts++
  customer.lastResult = project.result
  customer.trust = clamp(customer.trust + TRUST_CHANGE[project.result], 0, 100)
  if ((project.result === 'great' || project.result === 'success') && customer.trust >= SALES_RULES.followUpTrust) {
    customer.nextFollowUp = {
      dueTick: Math.max(state.tick + FOLLOWUP_TICKS, (customer.lastOfferTick ?? 0) + FOLLOWUP_TICKS),
      domain: project.domain,
      technology: project.technology,
    }
  } else {
    customer.nextFollowUp = null
  }
  return customer
}

export function advanceSales(state: GameSnapshot, random: () => number = Math.random): { offer: MarketOffer; customer: Customer }[] {
  const additions: { offer: MarketOffer; customer: Customer }[] = []
  if (state.sales.campaignDueTick !== null && state.tick >= state.sales.campaignDueTick) {
    state.sales.campaignDueTick = null
    if (resolveOutsourceCampaign(state, random)) {
      let name: string
      do {
        name = '신규 고객 ' + state.sales.nextLeadNumber++
      } while (state.customers.some((customer) => customer.name === name))
      const customer = customerFor(state, name)
      const offer: MarketOffer = {
        ...rollMarketOffer(state.company.trust), client: customer.name, customerId: customer.id, source: 'promotion',
      }
      customer.lastOfferTick = state.tick
      state.market.push(offer)
      additions.push({ offer, customer })
    }
  }

  const committed = new Set([
    ...state.market.map((offer) => offer.customerId),
    ...state.projects.filter(isActive).map((project) => project.customerId),
  ])
  for (const customer of state.customers) {
    const followUp = customer.nextFollowUp
    if (!followUp || state.tick < followUp.dueTick || committed.has(customer.id)) continue
    const offer: MarketOffer = {
      ...rollMarketOffer(state.company.trust, followUp), client: customer.name, customerId: customer.id, source: 'followup',
    }
    customer.nextFollowUp = null
    customer.lastOfferTick = state.tick
    state.market.push(offer)
    additions.push({ offer, customer })
  }
  return additions
}
