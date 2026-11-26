import { BALANCE } from '@/data/balance'
import { tech } from '@/data/rules'
import { gainRoleXp, skillRole } from './staff'
import type { Employee, MarketOffer, Project, Requirement, SkillKey } from './types'
import { clamp } from './utils'

export const OFFER_NEGOTIATION_GOALS = {
  schedule: '납기 조정',
  milestones: '단계별 납품',
  scope: '필수 범위·공수 조정',
  reliability: '운영 설계 제안',
} as const
export type OfferNegotiationGoal = keyof typeof OFFER_NEGOTIATION_GOALS
type Decision = 'pending' | 'accepted' | 'rejected' | 'original'
type Outcome = 'success' | 'fail' | 'critical'

export interface OfferNegotiationTerms {
  budget: number
  durationTicks: number
  requirements: Requirement[]
  scope: string
  workMultiplier: number
  debtMultiplier: number
}

export interface OfferNegotiation {
  employeeId: string
  goal: OfferNegotiationGoal
  skill: SkillKey
  technology: string
  outcome: Outcome
  decision: Decision
  proposal?: OfferNegotiationTerms
}

export interface AcceptedOfferNegotiation {
  employeeId: string
  skill: SkillKey
  experienceEligible: boolean
  workMultiplier: number
  debtMultiplier: number
  awardPaid?: boolean
  deliveryAwardPaid?: boolean
}

export function isOfferNegotiationGoal(value: string): value is OfferNegotiationGoal {
  return Object.hasOwn(OFFER_NEGOTIATION_GOALS, value)
}

function proposalSkill(offer: MarketOffer, employee: Employee, goal: OfferNegotiationGoal, technology: string): SkillKey {
  if (goal === 'schedule' || goal === 'milestones') return 'communication'
  if (goal === 'reliability') return 'infra'
  const primary = tech(technology)?.skill ?? 'coding'
  return offer.requirements.reduce<SkillKey>((best, requirement) => {
    const current = requirement.skill
    return current !== 'communication' && employee.stats[current] > employee.stats[best] ? current : best
  }, primary)
}

export function offerNegotiationOdds(
  offer: MarketOffer, employee: Employee, trust: number, goal: OfferNegotiationGoal, technology: string,
) {
  const skill = proposalSkill(offer, employee, goal, technology)
  const direct = employee.stackXp[technology] ?? 0
  const family = tech(technology)?.family
  const foundation = family ? (employee.stackXp[family] ?? 0) * 0.35 : 0
  const technical = goal === 'reliability' || goal === 'scope'
  const knowledgeBonus = technical ? Math.min(14, Math.max(direct, foundation) * 0.22 + (employee.domainXp[offer.domain] ?? 0) * 0.12) : 0
  const stylePenalty = offer.style === 'urgent' ? 8 : offer.style === 'changing' ? 4 : 0
  const success = clamp(Math.round(
    30 + employee.stats[skill] * 0.6 + Math.min(100, trust) * 0.16 + knowledgeBonus -
    (offer.difficulty - 1) * 4 - stylePenalty,
  ), 16, 86)
  const critical = Math.min(100 - success, offer.style === 'urgent' ? 15 : offer.style === 'changing' ? 12 : 8)
  return { skill, success, critical, fail: 100 - success - critical }
}

export function originalOfferTerms(offer: MarketOffer): OfferNegotiationTerms {
  return {
    budget: offer.budget, durationTicks: offer.durationTicks, requirements: offer.requirements.map((entry) => ({ ...entry })),
    scope: '요청 기능 전체', workMultiplier: 1, debtMultiplier: 1,
  }
}

function adjustedRequirements(terms: OfferNegotiationTerms, factor: number): Requirement[] {
  return terms.requirements.map((requirement) => ({ ...requirement, amount: Math.max(1, Math.round(requirement.amount * factor)) }))
}

export function proposedOfferTerms(offer: MarketOffer, goal: OfferNegotiationGoal, critical = false): OfferNegotiationTerms {
  const original = originalOfferTerms(offer)
  const days = BALANCE.TICKS_PER_DAY
  if (critical) {
    return {
      ...original, requirements: adjustedRequirements(original, 1.2),
      scope: '요청 기능 전체와 추가 검수·보완', workMultiplier: 1.15, debtMultiplier: 1.25,
    }
  }
  if (goal === 'schedule') {
    const long = Boolean(offer.longContract)
    return {
      ...original, budget: Math.round(offer.budget * 0.96), durationTicks: offer.durationTicks + (long ? 0 : 2 * days),
      scope: long ? '기능 전체 · 중간 확인 일정 여유 확보' : original.scope,
      workMultiplier: long ? 0.94 : 1,
    }
  }
  if (goal === 'milestones') {
    return {
      ...original, budget: Math.round(offer.budget * 0.98), scope: '기능 전체 · 초안과 최종본으로 단계별 확인',
      workMultiplier: 0.97, debtMultiplier: 0.9,
    }
  }
  if (goal === 'scope') {
    return {
      ...original, budget: Math.round(offer.budget * 0.95), requirements: adjustedRequirements(original, 0.84),
      scope: '핵심 기능 필수 · 부가 기능 제외', workMultiplier: 0.88, debtMultiplier: 0.95,
    }
  }
  return {
    ...original, budget: Math.round(offer.budget * 1.06), durationTicks: offer.durationTicks + (offer.longContract ? 0 : days),
    scope: '기능 전체 · 백업·배포 점검 및 구조 검토 추가', workMultiplier: 1.04, debtMultiplier: 0.75,
  }
}

export function rollOfferNegotiation(
  offer: MarketOffer, employee: Employee, trust: number, goal: OfferNegotiationGoal, technology: string, random: number,
): OfferNegotiation {
  const odds = offerNegotiationOdds(offer, employee, trust, goal, technology)
  const roll = random * 100
  const basics = { employeeId: employee.id, goal, skill: odds.skill, technology }
  if (roll < odds.success) {
    return { ...basics, outcome: 'success', decision: 'pending', proposal: proposedOfferTerms(offer, goal) }
  }
  if (roll >= 100 - odds.critical) {
    return { ...basics, outcome: 'critical', decision: 'pending', proposal: proposedOfferTerms(offer, goal, true) }
  }
  return { ...basics, outcome: 'fail', decision: 'original' }
}

export function isOfferNegotiationPending(offer: MarketOffer): boolean {
  return offer.offerNegotiation?.decision === 'pending'
}

export function decideOfferNegotiation(offer: MarketOffer, accept: boolean): boolean {
  const negotiation = offer.offerNegotiation
  if (negotiation?.decision !== 'pending') return false
  negotiation.decision = accept ? 'accepted' : 'rejected'
  return true
}

export function effectiveOffer(offer: MarketOffer): MarketOffer & { acceptedOfferNegotiation?: AcceptedOfferNegotiation } {
  const negotiation = offer.offerNegotiation
  if (negotiation?.decision !== 'accepted' || !negotiation.proposal) return offer
  const { budget, durationTicks, requirements, workMultiplier, debtMultiplier } = negotiation.proposal
  return {
    ...offer, budget, durationTicks, requirements: requirements.map((requirement) => ({ ...requirement })),
    acceptedOfferNegotiation: {
      employeeId: negotiation.employeeId, skill: negotiation.skill,
      experienceEligible: negotiation.outcome === 'success', workMultiplier, debtMultiplier,
    },
  }
}

export function applyOfferNegotiationAward(project: Project, employees: Employee[]): void {
  const agreement = project.acceptedOfferNegotiation
  if (!agreement?.experienceEligible || agreement.awardPaid) return
  const employee = employees.find((member) => member.id === agreement.employeeId)
  if (employee) {
    employee.stackXp[project.technology] = (employee.stackXp[project.technology] ?? 0) + 2
    employee.domainXp[project.domain] = (employee.domainXp[project.domain] ?? 0) + 1
    gainRoleXp(employee, skillRole(agreement.skill), 0.75)
  }
  agreement.awardPaid = true
}

export function rewardOfferNegotiationDelivery(project: Project, employees: Employee[]): void {
  const agreement = project.acceptedOfferNegotiation
  if (!agreement?.experienceEligible || !agreement.awardPaid || agreement.deliveryAwardPaid ||
      (project.result !== 'great' && project.result !== 'success')) return
  const employee = employees.find((member) => member.id === agreement.employeeId)
  if (employee) employee.stats[agreement.skill] = Math.min(100, employee.stats[agreement.skill] + 0.5)
  agreement.deliveryAwardPaid = true
}
