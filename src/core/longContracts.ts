import { BALANCE } from '@/data/balance'
import { rollMarketOffer } from './market'
import { isActive } from './project'
import type { Customer, GameSnapshot, MarketOffer, Project } from './types'

const WEEK_TICKS = BALANCE.DAYS_PER_WEEK * BALANCE.TICKS_PER_DAY
const WORK_FACTOR = 5

export const LONG_CONTRACT = {
  weeks: 12,
  durationTicks: 12 * WEEK_TICKS,
  offerEveryWeeks: 8,
  deliveriesRequired: 4,
  customerTrust: 75,
  customerDeliveries: 2,
  checkpointProgress: 45,
  checkpointEarliestTicks: 4 * WEEK_TICKS,
  minBudget: 1400,
  maxBudget: 1800,
  workFactor: WORK_FACTOR,
  workDays: Math.ceil(100 * WORK_FACTOR / (BALANCE.BASE_PROGRESS * 0.7 * BALANCE.TICKS_PER_DAY)) + 2,
  roleXpRate: 0.15,
  roleXpTicks: 360,
} as const

export interface LongContractOffer {
  workFactor: number
  workDays: number
}

export interface LongContractProgress extends LongContractOffer {
  middlePaid: boolean
  finalPaid: boolean
}

export function createLongContractOffer(state: GameSnapshot): { offer: MarketOffer; customer: Customer } | undefined {
  const isOfferWeek = state.weekIndex > LONG_CONTRACT.offerEveryWeeks &&
    (state.weekIndex - 1) % LONG_CONTRACT.offerEveryWeeks === 0
  if (!isOfferWeek || state.dayOfWeek !== 1 ||
      state.projects.filter((project) => project.state === 'done' && !project.isProduct).length < LONG_CONTRACT.deliveriesRequired) return
  const active = state.projects.filter(isActive)
  if ([...state.market, ...active].some((item) => item.longContract)) return

  const committed = new Set([...state.market, ...active].map((item) => item.customerId))
  const customer = state.customers.filter((entry) => entry.closedContracts >= LONG_CONTRACT.customerDeliveries &&
    entry.trust >= LONG_CONTRACT.customerTrust &&
    (entry.lastResult === 'great' || entry.lastResult === 'success') &&
    !committed.has(entry.id))
    .sort((left, right) => right.trust - left.trust)[0]
  if (!customer) return
  const recent = [...state.projects].reverse().find((project) => project.customerId === customer.id &&
    project.state === 'done' && !project.isProduct)
  const related = customer.nextFollowUp ?? recent
  const rolled = rollMarketOffer(state.company.trust, related)
  const requirements = rolled.requirements.map((requirement) => ({ ...requirement, amount: requirement.amount + 3 }))
  const budget = Math.min(LONG_CONTRACT.maxBudget, LONG_CONTRACT.minBudget + (rolled.difficulty - 1) * 100 + requirements.length * 75)
  const offer: MarketOffer = {
    ...rolled, requirements, budget, title: '3개월 · ' + rolled.title,
    client: customer.name, customerId: customer.id, source: 'followup',
    difficulty: Math.max(2, rolled.difficulty), durationTicks: LONG_CONTRACT.durationTicks,
    longContract: { workFactor: LONG_CONTRACT.workFactor, workDays: LONG_CONTRACT.workDays },
  }
  state.market.push(offer)
  customer.lastOfferTick = state.tick
  customer.nextFollowUp = null
  return { offer, customer }
}

export function startLongContract(offer: MarketOffer): LongContractProgress | undefined {
  if (!offer.longContract) return
  return { ...offer.longContract, middlePaid: false, finalPaid: false }
}

export function longPayments(budget: number): { advance: number; middle: number; final: number } {
  const advance = Math.round(budget * 0.3)
  const middle = Math.round(budget * 0.3)
  return { advance, middle, final: budget - advance - middle }
}

export function waitingForLongReview(project: Project): boolean {
  return Boolean(project.longContract && !project.longContract.middlePaid &&
    project.state === 'inDev' && project.progress >= LONG_CONTRACT.checkpointProgress)
}

export function longReviewReady(project: Project): boolean {
  return waitingForLongReview(project) && !project.scopePending && project.assigneeIds.length > 0 &&
    project.elapsedTicks >= LONG_CONTRACT.checkpointEarliestTicks && project.elapsedTicks < project.durationTicks
}

export function approveLongReview(project: Project): number | null {
  if (!project.longContract || !longReviewReady(project)) return null
  project.longContract.middlePaid = true
  return longPayments(project.budget).middle
}

export function longRoleXpGain(project: Project, workCount: number, gain: number): number {
  if (!project.longContract) return gain
  return workCount <= LONG_CONTRACT.roleXpTicks ? gain * LONG_CONTRACT.roleXpRate : 0
}
