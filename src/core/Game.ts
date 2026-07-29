import { BALANCE } from '@/data/balance'
import type {
  Company,
  Employee,
  GameSnapshot,
  MarketOffer,
  Project,
  SpeedSetting,
  Toast,
} from './types'
import { createForcedOffer, refreshMarket } from './market'
import { offerToProject, setMode, settleProject, tickProject } from './project'
import { clamp, uid } from './utils'
import type { WorkMode } from '@/data/balance'

export const SAVE_VERSION = 1

function createPlayer(): Employee {
  return {
    id: uid('emp'),
    isPlayer: true,
    name: '나',
    salary: BALANCE.PLAYER_SALARY,
    stats: {
      coding: 25,
      frontend: 15,
      backend: 15,
      database: 10,
      infra: 5,
      ai: 5,
      communication: 20,
    },
    stamina: 100,
    stress: 10,
    morale: 70,
    assignedProjectId: null,
    stackXp: { javascript: 20 },
  }
}

export function createNewGame(companyName = '코드한입 스튜디오'): GameSnapshot {
  const player = createPlayer()
  return {
    version: SAVE_VERSION,
    tick: 0,
    dayIndex: 1,
    dayOfWeek: 1,
    weekIndex: 1,
    speed: 1,
    tutorialStep: 0,
    company: {
      name: companyName,
      cash: BALANCE.START_CASH,
      trust: BALANCE.START_TRUST,
      dp: 0,
      heat: 0,
      projectSlots: 1,
    },
    employees: [player],
    projects: [],
    market: [createForcedOffer(), ...refreshMarket(BALANCE.START_TRUST).slice(0, 2)],
    lastResult: null,
    toasts: [
      {
        id: uid('toast'),
        text: '첫 외주를 수락하고, 나를 배치해 보세요.',
      },
    ],
    gameOver: false,
    bankruptGraceDays: 0,
  }
}

export class Game {
  state: GameSnapshot

  constructor(state?: GameSnapshot) {
    this.state = state ?? createNewGame()
  }

  getSnapshot(): GameSnapshot {
    return this.state
  }

  setSpeed(speed: SpeedSetting): void {
    this.state.speed = speed
  }

  pushToast(text: string): void {
    this.state.toasts.unshift({ id: uid('toast'), text })
    this.state.toasts = this.state.toasts.slice(0, 4)
  }

  clearToasts(): void {
    this.state.toasts = []
  }

  dismissResult(): void {
    this.state.lastResult = null
  }

  acceptOffer(offerId: string): boolean {
    const s = this.state
    if (s.gameOver) return false
    const active = s.projects.filter((p) => !['done', 'failed'].includes(p.state))
    if (active.length >= s.company.projectSlots) {
      this.pushToast('진행 슬롯이 가득 찼습니다.')
      return false
    }
    const idx = s.market.findIndex((o) => o.id === offerId)
    if (idx < 0) return false
    const offer = s.market[idx]!
    const project = offerToProject(offer)
    const advance = Math.round(offer.budget * BALANCE.ADVANCE_RATIO)
    s.company.cash += advance
    project.paidAdvance = true
    s.projects.push(project)
    s.market.splice(idx, 1)
    if (s.tutorialStep === 0) s.tutorialStep = 1
    this.pushToast(`수주! 착수금 +₩${advance.toLocaleString()}`)
    return true
  }

  assignEmployee(employeeId: string, projectId: string | null): boolean {
    const s = this.state
    const emp = s.employees.find((e) => e.id === employeeId)
    if (!emp) return false

    if (emp.assignedProjectId) {
      const prev = s.projects.find((p) => p.id === emp.assignedProjectId)
      if (prev) prev.assigneeIds = prev.assigneeIds.filter((id) => id !== emp.id)
      emp.assignedProjectId = null
    }

    if (!projectId) return true

    const project = s.projects.find((p) => p.id === projectId)
    if (!project || ['done', 'failed'].includes(project.state)) return false

    project.assigneeIds.push(emp.id)
    emp.assignedProjectId = projectId
    if (project.state === 'contracted') project.state = 'inDev'
    if (s.tutorialStep === 1) {
      s.tutorialStep = 2
      this.pushToast('배치 완료. 시간이 흐르며 개발이 진행됩니다.')
    }
    return true
  }

  setProjectMode(projectId: string, mode: WorkMode): void {
    const project = this.state.projects.find((p) => p.id === projectId)
    if (!project) return
    setMode(project, mode)
    if (mode === 'speed') {
      this.pushToast('스피드 모드: 일정↑ 부채↑')
    }
  }

  private finishProject(project: Project): void {
    const settle = settleProject(project)
    this.state.company.cash += settle.cash
    this.state.company.trust = clamp(this.state.company.trust + settle.trust, 0, 100)
    this.state.company.dp += settle.dp
    this.state.company.heat = clamp(
      this.state.company.heat + settle.dp * BALANCE.HEAT_FROM_DP_RATIO,
      0,
      100,
    )

    for (const id of project.assigneeIds) {
      const emp = this.state.employees.find((e) => e.id === id)
      if (emp) {
        emp.assignedProjectId = null
        emp.stackXp.javascript = (emp.stackXp.javascript ?? 0) + 3
        if (project.result === 'great' || project.result === 'success') {
          emp.morale = clamp(emp.morale + 5, 0, 100)
        }
      }
    }
    project.assigneeIds = []
    this.state.lastResult = { ...project }
    if (this.state.tutorialStep < 3) this.state.tutorialStep = 3

    const label =
      project.result === 'great'
        ? '대성공'
        : project.result === 'success'
          ? '성공'
          : project.result === 'ok'
            ? '보통'
            : '실패'
    this.pushToast(`${label}! 잔금 +₩${settle.cash.toLocaleString()}`)
  }

  private weeklySettlement(): void {
    const s = this.state
    const payroll = s.employees.reduce((sum, e) => sum + e.salary, 0)
    const fixed = BALANCE.WEEKLY_RENT + BALANCE.WEEKLY_SERVER
    const interest = Math.floor(s.company.dp * BALANCE.INTEREST_BASE)
    s.company.dp += interest
    s.company.heat = clamp(s.company.heat + interest * 0.4, 0, 100)
    s.company.cash -= payroll + fixed

    this.pushToast(
      `주간 정산: 고정비 -₩${(payroll + fixed).toLocaleString()}` +
        (interest > 0 ? ` / 부채이자 +${interest}` : ''),
    )

    if (s.company.heat >= BALANCE.MELTDOWN_HEAT) {
      const hit = Math.round(80 + s.company.dp * 0.5)
      s.company.cash -= hit
      s.company.dp = Math.floor(s.company.dp * 0.55)
      s.company.heat = 35
      this.pushToast(`부채 폭발! 복구 비용 -₩${hit.toLocaleString()}`)
    }

    s.market = refreshMarket(s.company.trust)
    s.weekIndex += 1
  }

  private endDay(): void {
    const s = this.state
    s.dayIndex += 1
    s.dayOfWeek += 1
    if (s.dayOfWeek > BALANCE.DAYS_PER_WEEK) {
      s.dayOfWeek = 1
      this.weeklySettlement()
    }

    for (const emp of s.employees) {
      emp.stamina = clamp(emp.stamina + 8, 0, 100)
      emp.stress = clamp(emp.stress - 3, 0, 100)
    }

    if (s.company.cash < 0) {
      s.bankruptGraceDays += 1
      if (s.bankruptGraceDays > 3) {
        s.gameOver = true
        s.speed = 0
        this.pushToast('파산했습니다...')
      } else {
        this.pushToast(`자금 부족 유예 ${s.bankruptGraceDays}/3일`)
      }
    } else {
      s.bankruptGraceDays = 0
    }
  }

  tick(): void {
    const s = this.state
    if (s.speed === 0 || s.gameOver) return

    s.tick += 1

    for (const project of [...s.projects]) {
      if (['done', 'failed'].includes(project.state)) continue
      const { dpGain, heatGain, finished } = tickProject(project, s.employees)
      s.company.dp += dpGain
      s.company.heat = clamp(s.company.heat + heatGain, 0, 100)
      if (finished) this.finishProject(project)
    }

    if (s.tick % BALANCE.TICKS_PER_DAY === 0) {
      this.endDay()
    }
  }
}

export type { Company, Employee, MarketOffer, Project, Toast }
