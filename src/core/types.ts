import type { ProjectResult, WorkMode } from '@/data/balance'

export type SpeedSetting = 0 | 1 | 2
export type ProjectState =
  | 'contracted'
  | 'inDev'
  | 'inTest'
  | 'deploying'
  | 'done'
  | 'failed'

export type SkillKey =
  | 'coding'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'infra'
  | 'ai'
  | 'communication'

export interface SkillStats {
  coding: number
  frontend: number
  backend: number
  database: number
  infra: number
  ai: number
  communication: number
}

export interface Employee {
  id: string
  isPlayer: boolean
  name: string
  salary: number
  stats: SkillStats
  stamina: number
  stress: number
  morale: number
  assignedProjectId: string | null
  stackXp: Record<string, number>
}

export interface Requirement {
  skill: SkillKey
  amount: number
}

export interface MarketOffer {
  id: string
  title: string
  client: string
  difficulty: number
  budget: number
  durationTicks: number
  bugTolerance: number
  requirements: Requirement[]
  forced?: boolean
}

export interface Project {
  id: string
  title: string
  client: string
  difficulty: number
  budget: number
  durationTicks: number
  elapsedTicks: number
  bugTolerance: number
  requirements: Requirement[]
  state: ProjectState
  progress: number
  bugs: number
  mode: WorkMode
  assigneeIds: string[]
  paidAdvance: boolean
  result: ProjectResult | null
  payout: number
}

export interface Company {
  name: string
  cash: number
  trust: number
  dp: number
  heat: number
  projectSlots: number
}

export interface Toast {
  id: string
  text: string
}

export interface GameSnapshot {
  version: number
  tick: number
  dayIndex: number
  dayOfWeek: number
  weekIndex: number
  speed: SpeedSetting
  tutorialStep: number
  company: Company
  employees: Employee[]
  projects: Project[]
  market: MarketOffer[]
  lastResult: Project | null
  toasts: Toast[]
  gameOver: boolean
  bankruptGraceDays: number
}
