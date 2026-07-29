import { BALANCE, type ProjectResult, type WorkMode } from '@/data/balance'
import type { Employee, MarketOffer, Project, Requirement, SkillStats } from './types'
import { clamp, uid } from './utils'

export function offerToProject(offer: MarketOffer): Project {
  return {
    id: uid('proj'),
    title: offer.title,
    client: offer.client,
    difficulty: offer.difficulty,
    budget: offer.budget,
    durationTicks: offer.durationTicks,
    elapsedTicks: 0,
    bugTolerance: offer.bugTolerance,
    requirements: offer.requirements,
    state: 'contracted',
    progress: 0,
    bugs: 0,
    mode: 'normal',
    assigneeIds: [],
    paidAdvance: false,
    result: null,
    payout: 0,
  }
}

export function calcMatchScore(stats: SkillStats, requirements: Requirement[]): number {
  const need = requirements.reduce((s, r) => s + r.amount, 0) || 1
  const have = requirements.reduce((s, r) => s + Math.min(stats[r.skill], r.amount * 1.5), 0)
  return clamp(have / need, 0.35, 1.35)
}

export function teamMatch(employees: Employee[], project: Project): number {
  if (project.assigneeIds.length === 0) return 0
  const assigned = employees.filter((e) => project.assigneeIds.includes(e.id))
  if (assigned.length === 0) return 0
  const avg =
    assigned.reduce((s, e) => s + calcMatchScore(e.stats, project.requirements), 0) /
    assigned.length
  const stamina = assigned.reduce((s, e) => s + e.stamina, 0) / assigned.length / 100
  const stress = assigned.reduce((s, e) => s + e.stress, 0) / assigned.length / 100
  return avg * (0.7 + stamina * 0.3) * (1 - stress * 0.25)
}

export function tickProject(
  project: Project,
  employees: Employee[],
): { dpGain: number; heatGain: number; finished: boolean } {
  let dpGain = 0
  let heatGain = 0

  if (project.state === 'contracted') {
    if (project.assigneeIds.length > 0) project.state = 'inDev'
    else return { dpGain, heatGain, finished: false }
  }

  if (project.state !== 'inDev' && project.state !== 'inTest' && project.state !== 'deploying') {
    return { dpGain, heatGain, finished: false }
  }

  const match = teamMatch(employees, project)
  if (match <= 0) return { dpGain, heatGain, finished: false }

  const mode = BALANCE.MODES[project.mode]
  project.elapsedTicks += 1

  if (project.state === 'inDev') {
    const power = BALANCE.BASE_PROGRESS * match * mode.progress
    project.progress = clamp(project.progress + power, 0, 100)
    project.bugs += BALANCE.BASE_BUG * mode.bug * (1 + project.difficulty * 0.08)
    if (project.mode === 'speed') {
      dpGain += BALANCE.SPEED_DP_PER_TICK * project.difficulty * mode.debt
      heatGain += 0.35
    }
    if (project.progress >= 100) {
      project.progress = 100
      project.state = 'inTest'
    }
  } else if (project.state === 'inTest') {
    project.bugs = Math.max(0, project.bugs - 1.6 * match)
    project.progress = clamp(project.progress + 0.8, 100, 110)
    if (project.progress >= 108 || project.elapsedTicks > project.durationTicks * 0.85) {
      project.state = 'deploying'
    }
  } else if (project.state === 'deploying') {
    project.progress = 110
    return { dpGain, heatGain, finished: true }
  }

  if (project.elapsedTicks > project.durationTicks * 1.35 && project.state === 'inDev') {
    // overdue pressure
    heatGain += 0.5
    project.bugs += 0.4
  }

  return { dpGain, heatGain, finished: false }
}

export function judgeResult(project: Project): ProjectResult {
  const overdue = Math.max(0, project.elapsedTicks - project.durationTicks)
  const bugPenalty = Math.max(0, project.bugs - project.bugTolerance) * 2
  const overduePenalty = overdue * 1.2
  const debtish = project.mode === 'speed' ? 8 : 0
  const score = 100 - bugPenalty - overduePenalty - debtish

  if (score >= 90) return 'great'
  if (score >= 70) return 'success'
  if (score >= 50) return 'ok'
  return 'fail'
}

export function settleProject(project: Project): { cash: number; trust: number; dp: number } {
  const result = judgeResult(project)
  project.result = result
  project.state = result === 'fail' ? 'failed' : 'done'

  const mul = BALANCE.RESULT_PAY[result]
  const finalPay = Math.round(project.budget * BALANCE.FINAL_RATIO * mul)
  project.payout = finalPay

  return {
    cash: finalPay,
    trust: BALANCE.RESULT_TRUST[result],
    dp: result === 'fail' ? 6 : result === 'ok' ? 2 : 0,
  }
}

export function setMode(project: Project, mode: WorkMode): void {
  if (project.state === 'inDev' || project.state === 'contracted') {
    project.mode = mode
  }
}
