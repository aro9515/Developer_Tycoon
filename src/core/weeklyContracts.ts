import { BALANCE } from '@/data/balance'
import type { BaseRole, ClientStyle } from '@/data/rules'
import type { Requirement, SkillKey } from './types'

export const WEEK_TICKS = BALANCE.DAYS_PER_WEEK * BALANCE.TICKS_PER_DAY

export const BASE_WEEKLY_WAGES: Readonly<Record<BaseRole, number>> = {
  frontend: 36, backend: 42, server: 40, coordinator: 32,
}

export interface WeeklyStaffing {
  role: BaseRole
  personWeeks: number
  weeklyWage: number
}

export interface WeeklyContractTerms {
  personWeeks: number
  workFactor: number
  staffing: WeeklyStaffing[]
  labor: number
  overhead: number
  risk: number
  margin: number
}

const PRODUCTION_ROLE: Readonly<Record<Exclude<SkillKey, 'coding' | 'communication'>, BaseRole>> = {
  frontend: 'frontend', backend: 'backend', database: 'backend', infra: 'server', ai: 'backend',
}

export function formatContractDuration(ticks: number): string {
  const days = Math.ceil(Math.max(0, ticks) / BALANCE.TICKS_PER_DAY)
  const weeks = Math.floor(days / BALANCE.DAYS_PER_WEEK)
  const remaining = days % BALANCE.DAYS_PER_WEEK
  if (weeks === 0) return days + '일'
  return remaining === 0 ? weeks + '주' : weeks + '주 ' + remaining + '일'
}

export function shortDeadlineWeeks(difficulty: number, style: ClientStyle): number {
  if (difficulty === 1) return 2
  if (style === 'urgent') return 3
  return difficulty === 3 && style === 'stable' ? 5 : 4
}

export function plannedPersonWeeks(difficulty: number, requirements: Requirement[], long = false): number {
  const additionalSkills = Math.max(0, requirements.length - 1)
  if (long) return (difficulty === 3 ? 6.5 : 5) + additionalSkills * 0.5
  if (difficulty === 1) return 0.8 + additionalSkills * 0.1
  return difficulty === 3 ? 2.5 + additionalSkills * 0.2 : 1.65 + additionalSkills * 0.15
}

export function quoteWeeklyContract(
  requirements: Requirement[], difficulty: number, style: ClientStyle, personWeeks: number, long = false,
): { budget: number; weeklyTerms: WeeklyContractTerms } {
  const weights = new Map<BaseRole, number>()
  for (const requirement of requirements) {
    if (requirement.skill === 'communication' || requirement.skill === 'coding') continue
    const role = PRODUCTION_ROLE[requirement.skill]
    weights.set(role, (weights.get(role) ?? 0) + requirement.amount)
  }
  if (!weights.size) weights.set('backend', 1)

  const hundredths = Math.round(personWeeks * 100)
  const coordination = Math.round(hundredths * 0.15)
  const development = hundredths - coordination
  let remaining = development
  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0)
  const staffing: WeeklyStaffing[] = [...weights].map(([role, weight], index) => {
    const allocated = index + 1 === weights.size ? remaining : Math.round(development * weight / totalWeight)
    remaining -= allocated
    return { role, personWeeks: allocated / 100, weeklyWage: BASE_WEEKLY_WAGES[role] }
  })
  staffing.push({ role: 'coordinator', personWeeks: coordination / 100, weeklyWage: BASE_WEEKLY_WAGES.coordinator })

  const labor = Math.round(staffing.reduce((total, row) => total + row.personWeeks * row.weeklyWage, 0))
  const overhead = BALANCE.WEEKLY_RENT + BALANCE.WEEKLY_SERVER + Math.floor(labor * 0.30)
  const riskRate = 0.10 + (difficulty - 1) * 0.06 +
    (style === 'urgent' ? 0.12 : style === 'changing' ? 0.08 : 0) + (long ? 0.18 : 0)
  const risk = Math.round((labor + overhead) * riskRate)
  const margin = Math.round((labor + overhead + risk) * 2 / 3)
  // At 1.0 team match, allow eight fixed testing/deploy ticks in the quoted person-work.
  const workFactor = Math.max(1, (hundredths / 100 * WEEK_TICKS - 8) * BALANCE.BASE_PROGRESS / 100)
  return {
    budget: labor + overhead + risk + margin,
    weeklyTerms: { personWeeks: hundredths / 100, workFactor, staffing, labor, overhead, risk, margin },
  }
}
