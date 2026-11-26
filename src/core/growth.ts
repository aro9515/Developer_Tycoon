import { BALANCE } from '@/data/balance'
import { WEEKS_PER_MONTH } from '@/data/rules'
import { gameMonth } from './customers'
import type { Employee, Project } from './types'

export const GROWTH_STAGES = [
  { index: 0, name: '1인 개발사', hires: 2, slots: 1, rent: BALANCE.WEEKLY_RENT },
  { index: 1, name: '소규모 스튜디오', hires: 3, slots: 2, rent: 44 },
  { index: 2, name: '자사 제품 회사', hires: 5, slots: 3, rent: 58 },
  { index: 3, name: '부서 있는 중견사', hires: 10, slots: 5, rent: 84 },
  { index: 4, name: '글로벌 기업', hires: 18, slots: 8, rent: 120 },
] as const

export const OPERATING_LABELS = {
  contracts: '외주 계약', solutions: '솔루션 매출', payroll: '급여', rent: '임대료',
  hosting: '서버비', support: '지원·유지보수', ads: '광고비', other: '기타 운영',
} as const
export type OperatingCategory = keyof typeof OPERATING_LABELS
export type GrowthPath = 'independent' | 'ipo' | 'acquisition'
export const GROWTH_PATHS: Record<GrowthPath, { label: string; ending: string }> = {
  independent: { label: '독립 경영', ending: '창업팀이 경영권을 유지하는 독립 글로벌 기업이 되었습니다.' },
  ipo: { label: '기업공개', ending: '흑자와 시장 성과를 기반으로 상장해 공개시장 자본을 확보했습니다.' },
  acquisition: { label: '인수 수락', ending: '인수 제안을 수락해 제품과 팀이 글로벌 기업에 합류했습니다.' },
}
const MONTHS_PER_QUARTER = 3
export const ENDING_QUARTERS = 4
export const ENDING_MARKETS = 3
export const INVESTMENT_AMOUNT = 300
export const IPO_AMOUNT = 900

export interface OperatingMonth {
  month: number
  complete: boolean
  income: number
  expenses: number
  capital: number
  categories: Partial<Record<OperatingCategory, number>>
  balance: number | null
}

export interface GrowthState {
  stageIndex: number
  current: OperatingMonth
  months: OperatingMonth[]
  quarters: { quarter: number; profit: number | null }[]
  profitableQuarters: number
  investmentMonth: number | null
  ending: { path: GrowthPath; month: number } | null
}

export interface EnterpriseProgress {
  paidCustomers: number
  renewals: number
  activeMarkets: readonly string[]
  overseasCustomers: number
  overseasRenewals: number
  monthlyRecurringNet: number
}

type GrowthContext = {
  weekIndex: number
  tick: number
  company: { cash: number }
  employees: Pick<Employee, 'salary'>[]
  projects: Pick<Project, 'isProduct' | 'state' | 'result'>[]
  gameOver: boolean
  growth: GrowthState
}

function emptyOperatingMonth(month: number, complete = true): OperatingMonth {
  return { month, complete, income: 0, expenses: 0, capital: 0, categories: {}, balance: null }
}

export function emptyGrowth(month = 1, complete = true): GrowthState {
  return {
    stageIndex: 0, current: emptyOperatingMonth(month, complete), months: [], quarters: [],
    profitableQuarters: 0, investmentMonth: null, ending: null,
  }
}

export function hydrateGrowth(state: Omit<GrowthContext, 'growth'> & { growth?: GrowthState }): void {
  const startOfMonth = (state.weekIndex - 1) % WEEKS_PER_MONTH === 0 &&
    state.tick % (BALANCE.DAYS_PER_WEEK * BALANCE.TICKS_PER_DAY * WEEKS_PER_MONTH) === 0
  state.growth ??= emptyGrowth(gameMonth(state.weekIndex), startOfMonth)
}

export function growthStage(state: Pick<GrowthContext, 'growth'>) {
  return GROWTH_STAGES[state.growth.stageIndex] ?? GROWTH_STAGES[0]
}

export function weeklyRent(state: Pick<GrowthContext, 'growth'>): number {
  return growthStage(state).rent
}

export function monthlyPayroll(state: Pick<GrowthContext, 'employees'>): number {
  return state.employees.reduce((total, employee) => total + employee.salary * WEEKS_PER_MONTH, 0)
}

export function updateGrowth(state: GrowthContext, enterprise: EnterpriseProgress): void {
  const growth = state.growth
  if (growth.stageIndex === 0 && state.projects.some((project) =>
    project.state === 'done' && !project.isProduct && project.result !== 'fail')) growth.stageIndex = 1
  if (growth.stageIndex === 1 && enterprise.paidCustomers > 0) growth.stageIndex = 2
  if (growth.stageIndex === 2 && enterprise.paidCustomers > 0 && enterprise.renewals > 0 &&
      enterprise.monthlyRecurringNet > 0 && enterprise.monthlyRecurringNet >= monthlyPayroll(state)) growth.stageIndex = 3
  if (growth.stageIndex === 3 && enterprise.overseasCustomers > 0 && enterprise.overseasRenewals > 0) growth.stageIndex = 4
}

export function operatingProfit(month: OperatingMonth): number {
  return month.income - month.expenses
}

export function postOperating(state: GrowthContext, category: OperatingCategory, delta: number): void {
  if (delta === 0) return
  state.company.cash += delta
  const current = state.growth.current
  if (delta > 0) current.income += delta
  else current.expenses -= delta
  current.categories[category] = (current.categories[category] ?? 0) + delta
}

export function closeOperatingMonth(state: GrowthContext): void {
  const growth = state.growth
  const current = growth.current
  if (state.weekIndex % WEEKS_PER_MONTH !== 0 || current.month !== gameMonth(state.weekIndex)) return
  current.balance = state.company.cash
  growth.months.push(current)
  if (growth.months.length > 12) growth.months.shift()
  if (current.month % MONTHS_PER_QUARTER === 0) {
    const months = growth.months.slice(-MONTHS_PER_QUARTER)
    const complete = months.length === MONTHS_PER_QUARTER &&
      months.every((month, index) => month.complete && month.month === current.month - MONTHS_PER_QUARTER + index + 1)
    const profit = complete ? months.reduce((total, month) => total + operatingProfit(month), 0) : null
    growth.quarters.push({ quarter: current.month / MONTHS_PER_QUARTER, profit })
    if (growth.quarters.length > 8) growth.quarters.shift()
    growth.profitableQuarters = profit !== null && profit > 0 ? growth.profitableQuarters + 1 : 0
  }
  growth.current = emptyOperatingMonth(current.month + 1)
}

export function operatingRunway(state: GrowthContext): { weeks: number | null; basis: 'recent' | 'fixed' } {
  const month = [...state.growth.months].reverse().find((record) => record.complete)
  const monthlyCost = month ? -operatingProfit(month) :
    monthlyPayroll(state) + (weeklyRent(state) + BALANCE.WEEKLY_SERVER) * WEEKS_PER_MONTH
  const basis = month ? 'recent' : 'fixed'
  if (monthlyCost <= 0) return { weeks: null, basis }
  return { weeks: Math.floor(Math.max(0, state.company.cash) * WEEKS_PER_MONTH / monthlyCost), basis }
}

export function canRaiseInvestment(state: GrowthContext): boolean {
  return !state.gameOver && !state.growth.ending && state.growth.stageIndex >= 1 && state.growth.investmentMonth === null
}

function postCapital(state: GrowthContext, amount: number): void {
  state.company.cash += amount
  state.growth.current.capital += amount
}

export function raiseInvestment(state: GrowthContext): boolean {
  if (!canRaiseInvestment(state)) return false
  state.growth.investmentMonth = state.growth.current.month
  postCapital(state, INVESTMENT_AMOUNT)
  return true
}

export function payingMarketCount(enterprise: EnterpriseProgress): number {
  return new Set(enterprise.activeMarkets).size
}

export function growthEndingReady(state: GrowthContext, enterprise: EnterpriseProgress): boolean {
  return !state.gameOver && !state.growth.ending && state.growth.profitableQuarters >= ENDING_QUARTERS &&
    payingMarketCount(enterprise) >= ENDING_MARKETS
}

export function finishGrowth(state: GrowthContext, enterprise: EnterpriseProgress, path: GrowthPath): boolean {
  if (!Object.hasOwn(GROWTH_PATHS, path) || !growthEndingReady(state, enterprise)) return false
  if (path === 'ipo') postCapital(state, IPO_AMOUNT)
  state.growth.ending = { path, month: state.growth.current.month }
  return true
}
