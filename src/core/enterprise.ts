import { BALANCE } from '@/data/balance'
import { SALES_RULES, WEEKS_PER_MONTH } from '@/data/rules'
import { gameMonth } from './customers'
import type { Customer, Employee, GameSnapshot, Project } from './types'
import { clamp } from './utils'

export const solutionMarkets = {
  domestic: { label: '한국', cost: 0, days: 0, deliveries: 0, leadName: '국내 기업' },
  japan: { label: '일본', cost: 130, days: 10, deliveries: 4, leadName: '일본 기업' },
  northAmerica: { label: '북미', cost: 220, days: 14, deliveries: 8, leadName: '북미 기업' },
} as const
export type SolutionMarket = keyof typeof solutionMarkets
export type ForeignMarket = Exclude<SolutionMarket, 'domestic'>
export const solutionSizes = { small: '소형', medium: '중형', large: '대형' } as const
export type SolutionSize = keyof typeof solutionSizes
export type BillingModel = 'license' | 'subscription'
export const billingModels: Record<BillingModel, string> = { license: '기업 도입 + 월 유지보수', subscription: '월 구독 · 기본 지원 포함' }

const sizes: SolutionSize[] = ['small', 'medium', 'large']
const weights: Record<SolutionSize, number> = { small: 1, medium: 2, large: 3 }
export const adChannels = [
  { id: 'online', label: '소액 온라인', cost: 30, days: 2, deliveries: 0, reach: 1, awareness: 4, fit: [0.89, 0.56, 0.28], outsource: 0.80 },
  { id: 'newspaper', label: '지역 신문', cost: 50, days: 3, deliveries: 0, reach: 1, awareness: 7, fit: [0.96, 0.65, 0.22], outsource: 0.88 },
  { id: 'radio', label: '라디오', cost: 120, days: 4, deliveries: 4, reach: 2, awareness: 12, fit: [0.78, 0.78, 0.44], outsource: 0.82 },
  { id: 'banner', label: '산업 인터넷 배너', cost: 250, days: 4, deliveries: 4, reach: 2, awareness: 15, fit: [0.57, 0.88, 0.91], outsource: 0.95 },
  { id: 'tv', label: 'TV', cost: 500, days: 5, deliveries: 8, reach: 3, awareness: 28, fit: [0.62, 0.78, 0.83], outsource: 0.94 },
  { id: 'influencer', label: '대형 인플루언서', cost: 700, days: 5, deliveries: 8, reach: 3, awareness: 35, fit: [0.91, 0.63, 0.68], outsource: 0.87 },
] as const
export type AdChannel = (typeof adChannels)[number]['id']

interface CustomerProfile { market: SolutionMarket; size: SolutionSize }
interface MarketStatus { open: boolean; awareness: number; dueTick: number | null }
interface Campaign { channel: AdChannel; market: SolutionMarket; target: SolutionSize; dueTick: number }
interface Opportunity { customerId: string; status: 'inquiry' | 'trial' | 'ready'; dueTick: number; fit: number }
export interface SolutionAccount {
  customerId: string
  model: BillingModel
  licenseOnboarded: boolean
  paidUntil: number
  satisfaction: number
  backlog: number
  renewals: number
}
export interface EnterpriseState {
  primaryProductId: string | null
  legacyProductIds: string[]
  profiles: Record<string, CustomerProfile>
  markets: Record<SolutionMarket, MarketStatus>
  campaign: Campaign | null
  campaignMonth: number
  nextProspect: number
  outsourceChannel: AdChannel | null
  opportunities: Opportunity[]
  accounts: SolutionAccount[]
  support: { week: number; employeeIds: string[]; handled: number; expense: number; hostingExpense: number; supportExpense: number; settledWeek: number }
  automation: number
}
export type EnterpriseAction =
  | { type: 'advertise'; channel: AdChannel; market: SolutionMarket; target: SolutionSize }
  | { type: 'trial'; customerId: string; employeeId: string }
  | { type: 'sell'; customerId: string; employeeId: string; model: BillingModel }
  | { type: 'renew'; customerId: string; employeeId: string }
  | { type: 'support'; employeeIds: string[] }
  | { type: 'automate' }
  | { type: 'enter-market'; market: ForeignMarket }
export interface EnterpriseResult {
  income: number
  expense: number
  messages: string[]
  expenseBreakdown?: { hosting: number; support: number }
}

const result = (income = 0, expense = 0, ...messages: string[]): EnterpriseResult => ({ income, expense, messages })
const deliveryCount = (state: GameSnapshot) => state.projects.filter((project) => !project.isProduct && project.state === 'done').length
const month = (state: GameSnapshot) => gameMonth(state.weekIndex)
const ticks = (days: number) => days * BALANCE.TICKS_PER_DAY
const free = (employee: Employee, state: GameSnapshot) => !employee.assignedProjectId && !employee.activity && employee.workedWeek !== state.weekIndex

export function emptyEnterprise(): EnterpriseState {
  return {
    primaryProductId: null, legacyProductIds: [], profiles: {},
    markets: {
      domestic: { open: true, awareness: 0, dueTick: null },
      japan: { open: false, awareness: 0, dueTick: null },
      northAmerica: { open: false, awareness: 0, dueTick: null },
    },
    campaign: null, campaignMonth: 0, nextProspect: 1, outsourceChannel: null, opportunities: [], accounts: [],
    support: { week: 0, employeeIds: [], handled: 0, expense: 0, hostingExpense: 0, supportExpense: 0, settledWeek: 0 }, automation: 0,
  }
}

export function initializeEnterprise(state: GameSnapshot): GameSnapshot {
  if (!state.enterprise) {
    state.enterprise = emptyEnterprise()
    state.enterprise.legacyProductIds = state.projects.filter((project) =>
      project.isProduct && !['canceled', 'failed'].includes(project.state)).map((project) => project.id)
  }
  return state
}

export function solutionProject(state: GameSnapshot): Project | undefined {
  const { primaryProductId } = state.enterprise
  return state.projects.find((project) => project.isProduct && project.state === 'done' && (!primaryProductId || project.id === primaryProductId))
}

export function legacyProductProjects(state: GameSnapshot): Project[] {
  const { legacyProductIds, primaryProductId } = state.enterprise
  return state.projects.filter((project) => project.state === 'done' && project.id !== primaryProductId && legacyProductIds.includes(project.id))
}

export function customerProfile(state: GameSnapshot, id: string): CustomerProfile {
  const stored = state.enterprise.profiles[id]
  if (stored) return stored
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const bucket = hash % 10
  return { market: 'domestic', size: bucket < 5 ? 'small' : bucket < 9 ? 'medium' : 'large' }
}

export function solutionPrices(state: GameSnapshot, id: string, model: BillingModel) {
  const size = weights[customerProfile(state, id).size]
  const account = state.enterprise.accounts.find((entry) => entry.customerId === id)
  const onboarded = account?.licenseOnboarded || account?.model === 'license'
  return model === 'license' ? { onboarding: onboarded ? 0 : 100 * size, monthly: 76 * size } : { onboarding: 0, monthly: 115 * size }
}

const active = (state: GameSnapshot, account: SolutionAccount) => account.paidUntil > month(state)
const sizeOf = (state: GameSnapshot, account: SolutionAccount) => weights[customerProfile(state, account.customerId).size]
const hosting = (size: number) => 3 + 3 * size

export function enterpriseProgress(state: GameSnapshot) {
  const accounts = state.enterprise.accounts
  const activeAccounts = accounts.filter((account) => active(state, account))
  const overseas = (account: SolutionAccount) => customerProfile(state, account.customerId).market !== 'domestic'
  return {
    paidCustomers: activeAccounts.length,
    renewals: accounts.reduce((sum, account) => sum + account.renewals, 0),
    activeMarkets: [...new Set(activeAccounts.map((account) => customerProfile(state, account.customerId).market))],
    overseasCustomers: activeAccounts.filter(overseas).length,
    overseasRenewals: accounts.filter(overseas).reduce((sum, account) => sum + account.renewals, 0),
    monthlyRecurringNet: activeAccounts.reduce((sum, account) =>
      sum + solutionPrices(state, account.customerId, account.model).monthly - (hosting(sizeOf(state, account)) + 1) * WEEKS_PER_MONTH, 0),
  }
}

function channel(id: AdChannel) { return adChannels.find((entry) => entry.id === id) }

export function quoteOutsourceCampaign(state: GameSnapshot, id?: AdChannel) {
  if (id === undefined) return { cost: SALES_RULES.cost, days: SALES_RULES.leadDays, chance: 1 }
  const entry = channel(id)
  return entry && deliveryCount(state) >= entry.deliveries ? { cost: entry.cost, days: entry.days, chance: entry.outsource } : null
}

export function quoteSolutionCampaign(state: GameSnapshot, id: AdChannel, market: SolutionMarket, target: SolutionSize) {
  const entry = channel(id)
  const status = state.enterprise.markets[market]
  const size = sizes.indexOf(target)
  if (!entry || !status || size < 0) return null
  const awareness = clamp(status.awareness + entry.awareness, 0, 100)
  const fit = entry.fit[size]
  const chance = clamp(fit + awareness / 400 - (market === 'domestic' ? 0 : 0.08), 0, 0.99)
  return { cost: entry.cost, days: entry.days, reach: entry.reach, awareness, fit, chance }
}

export function resolveOutsourceCampaign(state: GameSnapshot, random: () => number): boolean {
  const id = state.enterprise.outsourceChannel
  state.enterprise.outsourceChannel = null
  return id === null || random() < (channel(id)?.outsource ?? 1)
}

export function marketEntryReason(state: GameSnapshot, market: ForeignMarket): string {
  const info = solutionMarkets[market]
  const status = state.enterprise.markets[market]
  if (status.open) return '진출 완료'
  if (status.dueTick !== null) return '진출 준비 중 · ' + Math.max(0, Math.ceil((status.dueTick - state.tick) / ticks(1))) + '일'
  if (deliveryCount(state) < info.deliveries) return '외주 납품 ' + info.deliveries + '건 필요'
  const metrics = enterpriseProgress(state)
  if (!metrics.paidCustomers || !metrics.renewals) return '첫 유료 고객과 첫 갱신 필요'
  if (market === 'northAmerica' && !metrics.overseasRenewals) return '첫 해외 갱신 필요'
  if (state.company.cash < info.cost) return '진출비 부족'
  return ''
}

export function eligibleTrialCustomers(state: GameSnapshot): Customer[] {
  return state.customers.filter((customer) => {
    const application = state.enterprise.opportunities.find((entry) => entry.customerId === customer.id)
    if (application) return application.status === 'inquiry'
    const account = state.enterprise.accounts.find((entry) => entry.customerId === customer.id)
    if (account) return !active(state, account)
    return customer.closedContracts > 0 && customer.trust >= SALES_RULES.followUpTrust
  })
}

export function solutionRenewalReason(state: GameSnapshot, account: SolutionAccount): string {
  if (account.satisfaction < 45) return '만족도 45 필요'
  if (account.paidUntil > month(state) + 1 ||
      (account.paidUntil === month(state) + 1 && (state.weekIndex - 1) % WEEKS_PER_MONTH < WEEKS_PER_MONTH - 2)) {
    return (account.paidUntil - 1) + '개월차 ' + (WEEKS_PER_MONTH - 1) + '주차부터 갱신'
  }
  return ''
}

export function solutionRenewalChance(account: SolutionAccount, employee: Employee): number {
  return clamp((account.satisfaction + employee.stats.communication * 0.5) / 95, 0.25, 1)
}

export function supportCapacity(employee: Employee): number {
  return 2 + Math.floor((employee.stats.communication + employee.stats.infra) / 28) + (employee.role === 'consultant' ? 1 : 0)
}

export function automationCost(state: GameSnapshot): number {
  return (state.enterprise.automation + 1) * 100
}

function scheduleCampaign(state: GameSnapshot, action: Extract<EnterpriseAction, { type: 'advertise' }>): EnterpriseResult | null {
  const entry = channel(action.channel)
  const enterprise = state.enterprise
  if (!entry || !sizes.includes(action.target) || !enterprise.markets[action.market]?.open || !solutionProject(state) ||
      enterprise.campaign || enterprise.campaignMonth === month(state) || deliveryCount(state) < entry.deliveries ||
      state.company.cash < entry.cost) return null
  enterprise.campaign = { channel: entry.id, market: action.market, target: action.target, dueTick: state.tick + ticks(entry.days) }
  enterprise.campaignMonth = month(state)
  return result(0, entry.cost, entry.label + ' · 솔루션 광고 시작')
}

function scheduleTrial(state: GameSnapshot, customer: Customer, employee: Employee): EnterpriseResult | null {
  if (!eligibleTrialCustomers(state).some((candidate) => candidate.id === customer.id)) return null
  const enterprise = state.enterprise
  const index = enterprise.opportunities.findIndex((entry) => entry.customerId === customer.id)
  const existing = enterprise.opportunities[index]
  const solution = solutionProject(state)
  if (!solution) return null
  const knowhow = employee.stackXp[solution.technology] ?? 0
  const fit = clamp((existing?.fit ?? 0.73) + employee.stats.communication * 0.004 + knowhow * 0.001 + (customer.trust - 50) * 0.004, 0.50, 1)
  const trial: Opportunity = { customerId: customer.id, status: 'trial', dueTick: state.tick + ticks(3), fit }
  if (existing) enterprise.opportunities[index] = trial
  else enterprise.opportunities.push(trial)
  employee.workedWeek = state.weekIndex
  return result(0, 0, customer.name + ' · 시범 도입과 데모 시작')
}

function sellSolution(state: GameSnapshot, customer: Customer, employee: Employee, model: BillingModel): EnterpriseResult | null {
  if (model !== 'license' && model !== 'subscription') return null
  const enterprise = state.enterprise
  const solution = solutionProject(state)
  const ready = enterprise.opportunities.find((entry) => entry.customerId === customer.id && entry.status === 'ready')
  const account = enterprise.accounts.find((entry) => entry.customerId === customer.id)
  if (!ready || !solution || (account && active(state, account))) return null
  const price = solutionPrices(state, customer.id, model)
  enterprise.primaryProductId ??= solution.id
  const data: SolutionAccount = {
    customerId: customer.id, model, paidUntil: month(state) + 1,
    licenseOnboarded: model === 'license' || Boolean(account?.licenseOnboarded || account?.model === 'license'),
    satisfaction: 76, backlog: 0, renewals: account?.renewals ?? 0,
  }
  if (account) Object.assign(account, data)
  else enterprise.accounts.push(data)
  enterprise.opportunities = enterprise.opportunities.filter((entry) => entry !== ready)
  employee.workedWeek = state.weekIndex
  customer.trust = clamp(customer.trust + 3, 0, 100)
  return result(price.onboarding + price.monthly, 0, customer.name + ' · ' + billingModels[model] + ' 계약')
}

function renewSolution(state: GameSnapshot, customer: Customer, employee: Employee, random: () => number): EnterpriseResult | null {
  const account = state.enterprise.accounts.find((entry) => entry.customerId === customer.id)
  if (!account || solutionRenewalReason(state, account)) return null
  employee.workedWeek = state.weekIndex
  // Strong support guarantees renewal. At lower satisfaction, the employee's sales skill still matters.
  if (random() >= solutionRenewalChance(account, employee)) {
    account.satisfaction = clamp(account.satisfaction - 4, 0, 100)
    return result(0, 0, customer.name + ' · 갱신 보류')
  }
  account.paidUntil = Math.max(account.paidUntil, month(state)) + 1
  account.renewals++
  state.enterprise.opportunities = state.enterprise.opportunities.filter((entry) => entry.customerId !== customer.id)
  customer.trust = clamp(customer.trust + 2, 0, 100)
  return result(solutionPrices(state, customer.id, account.model).monthly, 0, customer.name + ' · 월 계약 갱신')
}

function assignSupport(state: GameSnapshot, ids: string[]): EnterpriseResult | null {
  if (!state.enterprise.accounts.some((account) => active(state, account))) return null
  const available = state.employees.filter((employee) => ids.includes(employee.id) && free(employee, state))
  if (!available.length) return null
  const support = state.enterprise.support
  if (support.week !== state.weekIndex) {
    support.week = state.weekIndex
    support.employeeIds = []
  }
  for (const employee of available) {
    employee.workedWeek = state.weekIndex
    support.employeeIds.push(employee.id)
  }
  return result(0, 0, '이번 주 제품 지원 · ' + available.length + '명 배정')
}

export function runEnterpriseAction(state: GameSnapshot, action: EnterpriseAction, random: () => number): EnterpriseResult | null {
  if (state.gameOver) return null
  const enterprise = state.enterprise
  switch (action.type) {
    case 'advertise':
      return scheduleCampaign(state, action)
    case 'support':
      return assignSupport(state, action.employeeIds)
    case 'automate': {
      const cost = automationCost(state)
      if (!enterprise.primaryProductId || enterprise.automation >= 3 || state.company.cash < cost) return null
      enterprise.automation++
      return result(0, cost, '제품 지원 자동화 · 단계 ' + enterprise.automation)
    }
    case 'enter-market': {
      const info = solutionMarkets[action.market]
      if (!info || marketEntryReason(state, action.market)) return null
      enterprise.markets[action.market].dueTick = state.tick + ticks(info.days)
      return result(0, info.cost, info.label + ' 시장 진출 준비')
    }
    default: {
      const customer = state.customers.find((entry) => entry.id === action.customerId)
      const employee = state.employees.find((entry) => entry.id === action.employeeId)
      if (!customer || !employee || !free(employee, state) || !solutionProject(state)) return null
      if (action.type === 'trial') return scheduleTrial(state, customer, employee)
      if (action.type === 'sell') return sellSolution(state, customer, employee, action.model)
      return renewSolution(state, customer, employee, random)
    }
  }
}

function createCampaignLeads(state: GameSnapshot, campaign: Campaign, random: () => number): number {
  const enterprise = state.enterprise
  const quote = quoteSolutionCampaign(state, campaign.channel, campaign.market, campaign.target)
  if (!quote) return 0
  const market = enterprise.markets[campaign.market]
  const occupied = enterprise.opportunities.filter((lead) => customerProfile(state, lead.customerId).market === campaign.market).length
  market.awareness = quote.awareness
  let count = 0
  for (let index = 0; index < quote.reach && occupied + count < 3; index++) {
    if (random() >= quote.chance) continue
    let number: number
    do { number = enterprise.nextProspect++ } while (state.customers.some((customer) => customer.id === 'solution-client-' + number))
    const id = 'solution-client-' + number
    state.customers.push({ id, name: solutionMarkets[campaign.market].leadName + ' ' + number,
      trust: 55, closedContracts: 0, lastResult: null, lastOfferTick: null, nextFollowUp: null })
    enterprise.profiles[id] = { market: campaign.market, size: campaign.target }
    enterprise.opportunities.push({ customerId: id, status: 'inquiry', dueTick: state.tick + ticks(28), fit: quote.fit })
    count++
  }
  return count
}

export function advanceEnterpriseDay(state: GameSnapshot, random: () => number): EnterpriseResult {
  const enterprise = state.enterprise
  const messages: string[] = []
  for (const market of Object.keys(solutionMarkets) as SolutionMarket[]) {
    const status = enterprise.markets[market]
    if (status.dueTick === null || status.dueTick > state.tick) continue
    status.open = true
    status.dueTick = null
    messages.push(solutionMarkets[market].label + ' 시장 열림 · 솔루션 광고 가능')
  }
  const campaign = enterprise.campaign
  if (campaign && campaign.dueTick <= state.tick) {
    enterprise.campaign = null
    const leads = createCampaignLeads(state, campaign, random)
    messages.push(solutionMarkets[campaign.market].label + ' 솔루션 광고 종료 · 문의 ' + leads + '건')
  }
  enterprise.opportunities = enterprise.opportunities.filter((entry) => {
    if (entry.dueTick > state.tick) return true
    if (entry.status !== 'trial') return false
    const name = state.customers.find((customer) => customer.id === entry.customerId)?.name ?? '고객'
    if (random() >= entry.fit) {
      messages.push(name + ' · 시범 도입 보류')
      return false
    }
    entry.status = 'ready'
    entry.dueTick = state.tick + ticks(28)
    messages.push(name + ' · 데모 완료, 계약 제안 가능')
    return true
  })
  return result(0, 0, ...messages)
}

export function settleEnterpriseWeek(state: GameSnapshot, _random: () => number): EnterpriseResult {
  const enterprise = state.enterprise
  const support = enterprise.support
  if (support.settledWeek === state.weekIndex) return result()
  support.settledWeek = state.weekIndex
  const crew = state.employees.filter((employee) => support.week === state.weekIndex && support.employeeIds.includes(employee.id))
  let capacity = crew.reduce((total, employee) => total + supportCapacity(employee), enterprise.automation * 2)
  let hostingTotal = 0
  let supportTotal = 0
  let handled = 0
  const accounts = enterprise.accounts.filter((account) => active(state, account))
  accounts.sort((a, b) => b.backlog - a.backlog || a.satisfaction - b.satisfaction)
  const outage = Boolean(solutionProject(state)?.issue)
  for (const account of accounts) {
    const size = sizeOf(state, account)
    account.backlog = Math.min(20, account.backlog + size + (outage ? 1 : 0))
    const fixed = Math.min(capacity, account.backlog)
    account.backlog -= fixed
    capacity -= fixed
    handled += fixed
    account.satisfaction = clamp(account.satisfaction + (account.backlog ? -Math.min(12, 3 + account.backlog * 2) : 7), 0, 100)
    hostingTotal += hosting(size)
    supportTotal += 1 + Math.min(account.backlog, 4)
  }
  support.handled = handled
  support.expense = hostingTotal + supportTotal
  support.hostingExpense = hostingTotal
  support.supportExpense = supportTotal
  return {
    ...result(0, support.expense, ...(support.expense ? [
      '제품 운영비 ' + support.expense + ' · 해결한 지원 요청 ' + handled + '건',
    ] : [])),
    expenseBreakdown: { hosting: hostingTotal, support: supportTotal },
  }
}
