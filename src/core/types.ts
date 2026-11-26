import type { ProjectResult, WorkMode } from '@/data/balance'
import type { ClientStyle, Domain, Item, Role, RoleLevel } from '@/data/rules'

import type { EnterpriseState } from './enterprise'
import type { GrowthState } from './growth'
import type { LongContractOffer, LongContractProgress } from './longContracts'
import type { AcceptedOfferNegotiation, OfferNegotiation } from './offerNegotiation'

export type SpeedSetting = 0 | 1 | 2
export type ProjectState = 'contracted' | 'inDev' | 'inTest' | 'deploying' | 'done' | 'failed' | 'canceled'

export interface SkillStats {
  coding: number
  frontend: number
  backend: number
  database: number
  infra: number
  ai: number
  communication: number
}
export type SkillKey = keyof SkillStats

export type Activity =
  | { kind: 'training' | 'pilot'; target: string; progress: number; duration: number; voucher: boolean }
  | { kind: 'repair'; target: string }

export interface Handover {
  projectId: string
  sourceId: string
  remaining: number
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
  domainXp: Partial<Record<Domain, number>>
  role: Role
  roleXp: Partial<Record<Role, number>>
  roleLevels: Partial<Record<Role, RoleLevel>>
  activity: Activity | null
  workedWeek: number
  contractAvailableWeek?: number
  hiredWeek: number
  salaryReviewYear: number
  desiredSalary: number
  workloadLimit: number
  complaints: Record<'salary' | 'balance', number>
  handover: Handover | null
  itemWeek: Partial<Record<Item, number>>
}

export interface Requirement {
  skill: SkillKey
  amount: number
}

export type OfferSource = 'monthly' | 'promotion' | 'followup'

export interface Customer {
  id: string
  name: string
  trust: number
  closedContracts: number
  lastResult: ProjectResult | null
  lastOfferTick: number | null
  nextFollowUp: { dueTick: number; domain: Domain; technology: string } | null
}

export interface Sales {
  startedMonth: number
  campaignDueTick: number | null
  nextLeadNumber: number
}

export interface MarketOffer {
  longContract?: LongContractOffer
  offerNegotiation?: OfferNegotiation
  customerId?: string
  source?: OfferSource
  id: string
  title: string
  client: string
  difficulty: number
  budget: number
  durationTicks: number
  bugTolerance: number
  requirements: Requirement[]
  technology: string
  alternatives: string[]
  domain: Domain
  style: ClientStyle
  forced?: boolean
}

export interface RepairIssue {
  remaining: number
  source: string
  assignedId: string | null
  outsourcedUntil: number | null
}

export interface Project {
  longContract?: LongContractProgress
  acceptedOfferNegotiation?: AcceptedOfferNegotiation
  customerId?: string
  source?: OfferSource
  customerRecorded?: boolean
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
  technology: string
  domain: Domain
  style: ClientStyle
  advance: number
  debt: number
  issue: RepairIssue | null
  workTicks: Record<string, number>
  scopeChecked: boolean
  scopePending: boolean
  negotiationWeek: number
  reviewUsed: boolean
  reviewRisk: boolean
  isProduct: boolean
}

export interface Company {
  name: string
  cash: number
  trust: number
  dp: number
  heat: number
  projectSlots: number
  research: number
  validated: string[]
  inventory: Record<Item, number>
  shopStock: Record<Item, number>
  supportNet: number
}

export interface Toast {
  id: string
  text: string
}

export interface GameSnapshot {
  enterprise: EnterpriseState
  growth: GrowthState
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
  customers: Customer[]
  sales: Sales
  lastResult: Project | null
  toasts: Toast[]
  gameOver: boolean
  bankruptGraceDays: number
}
