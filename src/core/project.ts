import { BALANCE, type ProjectResult, type WorkMode } from '@/data/balance'
import { tech } from '@/data/rules'
import type { Employee, MarketOffer, Project, Requirement, SkillStats } from './types'
import { clamp, uid } from './utils'
import { LONG_CONTRACT, longPayments, startLongContract, waitingForLongReview } from './longContracts'

export function offerToProject(offer: MarketOffer): Project {
  return {
    ...offer,
    longContract: startLongContract(offer),
    id: uid('proj'), elapsedTicks: 0, state: 'contracted', progress: 0, bugs: 0,
    mode: 'normal', assigneeIds: [], paidAdvance: false, result: null, payout: 0,
    advance: 0, debt: 0, issue: null, workTicks: {}, scopeChecked: false, scopePending: false,
    negotiationWeek: 0, reviewUsed: false, reviewRisk: false, isProduct: false,
  }
}

export function isActive(project: Project): boolean {
  return project.state === 'contracted' || project.state === 'inDev' ||
    project.state === 'inTest' || project.state === 'deploying'
}

export function calcMatchScore(stats: SkillStats, requirements: Requirement[]): number {
  const need = requirements.reduce((sum, r) => sum + r.amount, 0) || 1
  const have = requirements.reduce((sum, r) => sum + Math.min(stats[r.skill], r.amount * 1.5), 0)
  return clamp(have / need, 0.35, 1.35)
}

export function employeeMatch(employee: Employee, project: Pick<Project, 'requirements' | 'technology'>): number {
  const specialty = tech(project.technology)
  const direct = employee.stackXp[project.technology] ?? 0
  const foundation = specialty?.family ? (employee.stackXp[specialty.family] ?? 0) * 0.35 : 0
  const knowledge = Math.max(direct, foundation)
  return calcMatchScore(employee.stats, project.requirements) * (0.88 + Math.min(knowledge, 65) / 200)
}

export function teamMatch(employees: Employee[], project: Project): number {
  const assigned = employees.filter((employee) => project.assigneeIds.includes(employee.id))
  return assigned.reduce((total, employee, index) => {
    const stamina = 0.7 + employee.stamina / 100 * 0.3
    const stress = 1 - employee.stress / 100 * 0.25
    const orientation = employee.handover ? 0.45 : 1
    const roleBonus = employee.role === 'fullstack' ? 1.1 : 1
    return total + employeeMatch(employee, project) * stamina * stress * orientation * roleBonus / (1 + index * 0.55)
  }, 0)
}

export function canReview(project: Project): boolean {
  return !project.reviewUsed && !project.scopePending &&
    (project.state === 'inTest' || project.state === 'deploying') &&
    (project.mode === 'speed' || project.debt > 0 || project.difficulty > 1 || project.reviewRisk)
}

export function tickProject(project: Project, employees: Employee[]) {
  let dpGain = 0
  let heatGain = 0
  if (!isActive(project)) return { dpGain, heatGain, finished: false }
  project.elapsedTicks++
  if (waitingForLongReview(project)) return { dpGain, heatGain, finished: false }
  const match = teamMatch(employees, project)
  if (match <= 0) return { dpGain, heatGain, finished: false }
  if (project.state === 'contracted') project.state = 'inDev'
  const mode = BALANCE.MODES[project.mode]

  if (project.state === 'inDev') {
    const workFactor = (project.longContract?.workFactor ?? 1) * (project.acceptedOfferNegotiation?.workMultiplier ?? 1)
    const progressLimit = project.longContract && !project.longContract.middlePaid ? LONG_CONTRACT.checkpointProgress : 100
    const progressGain = BALANCE.BASE_PROGRESS * match * mode.progress / workFactor
    project.progress = clamp(project.progress + progressGain, 0, progressLimit)
    project.bugs += BALANCE.BASE_BUG * mode.bug * (1 + project.difficulty * 0.08) / (project.longContract?.workFactor ?? 1)
    if (project.mode === 'speed') {
      dpGain += BALANCE.SPEED_DP_PER_TICK * project.difficulty * mode.debt
      heatGain += 0.35
    }
    if (project.progress >= 100) project.state = 'inTest'
  } else if (project.state === 'inTest') {
    project.bugs = Math.max(0, project.bugs - 1.55 * match)
    project.progress = clamp(project.progress + 1.15, 100, 110)
    if (project.progress >= 108) project.state = 'deploying'
  } else if (project.state === 'deploying') {
    project.progress = 110
    return { dpGain, heatGain, finished: true }
  }

  if (project.elapsedTicks > project.durationTicks * 1.35 && project.state === 'inDev') {
    heatGain += 0.5
    project.bugs += 0.4
  }

  return { dpGain, heatGain, finished: false }
}

export function judgeResult(project: Project): ProjectResult {
  const overdue = Math.max(0, project.elapsedTicks - project.durationTicks)
  const bugPenalty = Math.max(0, project.bugs - project.bugTolerance) * 2
  const score = 100 - bugPenalty - overdue * 1.2 - (project.mode === 'speed' ? 8 : 0)
  if (score >= 90) return 'great'
  if (score >= 70) return 'success'
  if (score >= 50) return 'ok'
  return 'fail'
}

export function settleProject(project: Project) {
  const result = project.longContract && !project.longContract.middlePaid ? 'fail' : judgeResult(project)
  project.result = result
  project.state = result === 'fail' ? 'failed' : 'done'

  let cash = 0
  if (project.longContract) {
    if (result !== 'fail' && !project.longContract.finalPaid) {
      cash = longPayments(project.budget).final
      project.longContract.finalPaid = true
      project.payout = cash
    }
  } else {
    cash = project.isProduct ? 0 : Math.round(project.budget * BALANCE.FINAL_RATIO * BALANCE.RESULT_PAY[result])
    project.payout = cash
  }
  return {
    cash,
    trust: BALANCE.RESULT_TRUST[result],
    dp: result === 'fail' ? 6 : result === 'ok' ? 2 : 0,
  }
}

export function setMode(project: Project, mode: WorkMode): void {
  if (project.state === 'inDev' || project.state === 'contracted') project.mode = mode
}
