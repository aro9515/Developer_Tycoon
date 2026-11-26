import type { PlayEvent, PlayEventDetails } from './playEvent'
import { BALANCE, type WorkMode } from '@/data/balance'
import {
  CLIENT_STYLES, COMPANY_STAGES, DOMAINS, ROLES, SHOP, WEEKS_PER_MONTH, tech, techName, trainingCourse,
  type BaseRole, type Domain, type Item, type Role, type RoleLevel,
} from '@/data/rules'
import type { Company, Employee, GameSnapshot, MarketOffer, Project, SpeedSetting, Toast } from './types'
import { refreshMarket } from './market'
import { advanceSales, emptySales, gameMonth, initializeCustomers, linkOffer, recordCustomerOutcome } from './customers'
import { canReview, isActive, offerToProject, setMode, settleProject, tickProject } from './project'
import { canChangeRole, canLevelUpRole, createEmployee, gainRoleXp, HIRE_COST, reviewYear, roleLevel, salaryReviewDue, skillRole } from './staff'
import { clamp, uid } from './utils'
import { formatContractDuration, WEEK_TICKS } from './weeklyContracts'
import {
  advanceEnterpriseDay, emptyEnterprise, enterpriseProgress, initializeEnterprise, legacyProductProjects,
  quoteOutsourceCampaign, runEnterpriseAction, settleEnterpriseWeek, type AdChannel, type EnterpriseAction,
  type EnterpriseResult,
} from './enterprise'
import {
  closeOperatingMonth, emptyGrowth, finishGrowth, growthStage, hydrateGrowth, postOperating, raiseInvestment,
  updateGrowth, weeklyRent, type GrowthPath,
} from './growth'
import {
  approveLongReview, createLongContractOffer, longPayments, longRoleXpGain, waitingForLongReview,
} from './longContracts'
import {
  applyOfferNegotiationAward, decideOfferNegotiation, effectiveOffer, isOfferNegotiationGoal, isOfferNegotiationPending,
  rewardOfferNegotiationDelivery, rollOfferNegotiation, type OfferNegotiationGoal,
} from './offerNegotiation'

export const SAVE_VERSION = 2
export const TRAINING_DAYS = 3
export const PILOT_DAYS = 4
export const PILOT_SKILL_MIN = 20
const OUTSOURCE_TIME = BALANCE.TICKS_PER_DAY * 2
const EMPTY_ITEMS = { meal: 0, book: 0, voucher: 0 }
const INITIAL_STOCK = { meal: SHOP.meal.stock, book: SHOP.book.stock, voucher: SHOP.voucher.stock }

export function createNewGame(companyName = '코드한입 스튜디오'): GameSnapshot {
  return initializeCustomers({
    enterprise: emptyEnterprise(), growth: emptyGrowth(),
    version: SAVE_VERSION, tick: 0, dayIndex: 1, dayOfWeek: 1, weekIndex: 1, speed: 0,
    tutorialStep: 0,
    company: {
      name: companyName, cash: BALANCE.START_CASH, trust: BALANCE.START_TRUST, dp: 0, heat: 0,
      projectSlots: 1, research: 0, validated: [], inventory: { ...EMPTY_ITEMS },
      shopStock: { ...INITIAL_STOCK }, supportNet: 0,
    },
    employees: [createEmployee(1, 'frontend', 1, true)],
    projects: [], market: refreshMarket(BALANCE.START_TRUST, true), customers: [], sales: emptySales(), lastResult: null,
    toasts: [{ id: uid('toast'), text: '시장 의뢰에 담당자를 정하고 하루를 진행해 보세요.' }],
    gameOver: false, bankruptGraceDays: 0,
  })
}

export function companyStage(projects: Project[]) {
  const count = projects.filter((project) => project.state === 'done' && !project.isProduct).length
  return [...COMPANY_STAGES].reverse().find((stage) => count >= stage.deliveries) ?? COMPANY_STAGES[0]
}

export function companyCapacity(state: GameSnapshot) {
  const deliveryStage = companyStage(state.projects)
  const growth = growthStage(state)
  return { ...growth, deliveries: deliveryStage.deliveries, hires: Math.max(deliveryStage.hires, growth.hires), slots: Math.max(deliveryStage.slots, growth.slots) }
}

export function pendingScopeProject(state: Pick<GameSnapshot, 'projects'>): Project | undefined {
  return state.projects.find((project) => project.scopePending && isActive(project))
}

export function freeForActivity(employee: Employee, week: number): boolean {
  return !employee.assignedProjectId && !employee.activity && employee.workedWeek !== week
}

export function freeForContract(employee: Employee, week: number): boolean {
  return !employee.assignedProjectId && !employee.activity &&
    (employee.workedWeek !== week || employee.contractAvailableWeek === week)
}

export function assignmentBlock(
  state: GameSnapshot, employee: Employee, target: Project | undefined, emergency = false,
): 'game-over' | 'last-assignee' | 'worked-this-week' | null {
  if (state.gameOver) return 'game-over'
  if (target && employee.assignedProjectId === target.id) return null
  const previous = state.projects.find((project) => project.id === employee.assignedProjectId)
  if (previous && isActive(previous) && previous.assigneeIds.length === 1) return 'last-assignee'
  const canJoinContract = target && !target.isProduct && freeForContract(employee, state.weekIndex)
  if (employee.workedWeek === state.weekIndex && !emergency && !canJoinContract) return 'worked-this-week'
  return null
}

export function trainingBlock(
  state: GameSnapshot, employee: Employee, technology: string, pilot = false,
): 'game-over' | 'unknown-course' | 'busy' | 'stage' | 'not-technology' | 'skill' | 'validated' | 'pilot-in-progress' | null {
  const entry = trainingCourse(technology)
  if (!entry) return 'unknown-course'
  if (state.gameOver) return 'game-over'
  if (!freeForActivity(employee, state.weekIndex)) return 'busy'
  if (entry.expansion && companyStage(state.projects).deliveries < 4) return 'stage'
  if (!pilot) return null
  if (!tech(technology)) return 'not-technology'
  if (employee.stats[entry.skill] < PILOT_SKILL_MIN) return 'skill'
  if (state.company.validated.includes(technology)) return 'validated'
  if (state.employees.some((member) => member.activity?.kind === 'pilot' && member.activity.target === technology)) return 'pilot-in-progress'
  return null
}

export function productDomains(projects: Project[]): Domain[] {
  return (Object.keys(DOMAINS) as Domain[]).filter((domain) =>
    !projects.some((project) => project.domain === domain && project.isProduct && (isActive(project) || project.state === 'done')) &&
    new Set(projects.filter((project) => project.state === 'done' && !project.isProduct && project.domain === domain)
      .map((project) => project.client)).size >= 2,
  )
}

export function outsourcePrice(project: Project): number {
  return Math.ceil(36 + (project.issue?.remaining ?? 0) * 2 + project.debt * 0.35)
}

export function negotiationOdds(employee: Employee, trust: number, project: Project, research: boolean) {
  const success = clamp(Math.round(40 + employee.stats.communication * 0.65 + trust * 0.18 -
    project.difficulty * 5 + (research ? 20 : 0)), 20, 88)
  const critical = Math.min(100 - success, project.style === 'urgent' ? (research ? 8 : 16) : (research ? 5 : 10))
  return { success, fail: 100 - success - critical, critical }
}

export class Game {
  state: GameSnapshot
  private events: PlayEvent[] = []

  constructor(state?: GameSnapshot, private readonly random: () => number = Math.random) {
    this.state = state ? initializeCustomers(state) : createNewGame()
    for (const employee of this.state.employees) {
      employee.roleLevels ??= {}
      employee.roleLevels[employee.role] ??= 1
    }
    initializeEnterprise(this.state)
    hydrateGrowth(this.state)
    this.refreshGrowth()
    if (pendingScopeProject(this.state)) this.state.speed = 0
  }

  private refreshGrowth(): void {
    const s = this.state
    updateGrowth(s, enterpriseProgress(s))
    s.company.projectSlots = Math.max(s.company.projectSlots, companyCapacity(s).slots)
  }

  private applyEnterpriseResult(result: EnterpriseResult, expense: 'ads' | 'support' | 'hosting' | 'other' = 'other'): void {
    const s = this.state
    postOperating(s, 'solutions', result.income)
    if (result.expenseBreakdown) {
      postOperating(s, 'hosting', -result.expenseBreakdown.hosting)
      postOperating(s, 'support', -result.expenseBreakdown.support)
    } else postOperating(s, expense, -result.expense)
    for (const message of result.messages) this.pushToast(message)
  }

  enterpriseAction(action: EnterpriseAction): boolean {
    if (this.state.gameOver) return false
    const result = runEnterpriseAction(this.state, action, this.random)
    if (!result) return false
    this.applyEnterpriseResult(result, action.type === 'advertise' ? 'ads' : action.type === 'automate' ? 'support' : 'other')
    this.refreshGrowth()
    if (result.income || result.expense) this.record('solution', 'settled', { amount: result.income - result.expense })
    return true
  }

  raiseInvestment(): boolean {
    return !this.state.gameOver && raiseInvestment(this.state)
  }

  finishGrowth(path: GrowthPath): boolean {
    return !this.state.gameOver && finishGrowth(this.state, enterpriseProgress(this.state), path)
  }

  getSnapshot(): GameSnapshot { return this.state }

  drainEvents(): PlayEvent[] {
    const events = this.events
    this.events = []
    return events
  }

  private record(action: string, result: string, details: PlayEventDetails = {}): void {
    const { tick, dayIndex: day, weekIndex: week } = this.state
    this.events.push({ tick, day, week, action, result, ...details })
  }
  setSpeed(speed: SpeedSetting): void {
    this.state.speed = pendingScopeProject(this.state) ? 0 : speed
  }
  dismissResult(): void { this.state.lastResult = null }
  clearToasts(): void { this.state.toasts = [] }

  pushToast(text: string): void {
    this.state.toasts.unshift({ id: uid('toast'), text })
    this.state.toasts = this.state.toasts.slice(0, 12)
  }

  private employee(id: string): Employee | undefined {
    return this.state.employees.find((employee) => employee.id === id)
  }

  private project(id: string): Project | undefined {
    return this.state.projects.find((project) => project.id === id)
  }

  private get activeCount() { return this.state.projects.filter(isActive).length }

  private beginProject(offer: MarketOffer, employee: Employee, isProduct = false): Project {
    const project = offerToProject(offer)
    project.isProduct = isProduct
    project.state = 'inDev'
    project.assigneeIds.push(employee.id)
    employee.assignedProjectId = project.id
    delete employee.contractAvailableWeek
    this.state.projects.push(project)
    return project
  }

  startPromotion(channel?: AdChannel): boolean {
    const s = this.state
    const month = gameMonth(s.weekIndex)
    const quote = quoteOutsourceCampaign(s, channel)
    if (s.gameOver || !quote || s.company.cash < quote.cost ||
        s.sales.startedMonth === month || s.sales.campaignDueTick !== null) return false
    postOperating(s, 'ads', -quote.cost)
    s.enterprise.outsourceChannel = channel ?? null
    s.sales.startedMonth = month
    s.sales.campaignDueTick = s.tick + quote.days * BALANCE.TICKS_PER_DAY
    this.record('sales', 'started', { amount: quote.cost, cash: s.company.cash, duration: quote.days, mode: channel })
    this.pushToast('외주 홍보 시작 · ' + quote.days + '일 후 결과 확인')
    return true
  }

  negotiateOffer(offerId: string, employeeId: string, goal: OfferNegotiationGoal, technology?: string): boolean {
    const s = this.state
    const offer = s.market.find((entry) => entry.id === offerId)
    const employee = this.employee(employeeId)
    if (s.gameOver || !offer || offer.offerNegotiation || !employee ||
        !freeForContract(employee, s.weekIndex) || !isOfferNegotiationGoal(goal)) return false
    const selected = technology ?? offer.technology
    if (selected !== offer.technology && (!offer.alternatives.includes(selected) || !s.company.validated.includes(selected))) return false
    offer.offerNegotiation = rollOfferNegotiation(offer, employee, s.company.trust, goal, selected, this.random())
    this.record('negotiation', offer.offerNegotiation.outcome, { employeeId, mode: 'offer-' + goal, customerId: offer.customerId })
    return true
  }

  resolveOfferNegotiation(offerId: string, accept: boolean): boolean {
    const offer = this.state.market.find((entry) => entry.id === offerId)
    return !this.state.gameOver && Boolean(offer && decideOfferNegotiation(offer, accept))
  }

  acceptOffer(offerId: string, employeeId?: string, technology?: string): boolean {
    const s = this.state
    if (s.gameOver) return false
    if (this.activeCount >= s.company.projectSlots) {
      this.pushToast('동시 계약 한도가 찼습니다.')
      return false
    }
    const employee = employeeId ? this.employee(employeeId) : s.employees.find((member) => freeForContract(member, s.weekIndex))
    const offer = s.market.find((candidate) => candidate.id === offerId)
    if (!offer || !employee || isOfferNegotiationPending(offer)) return false
    if (!freeForContract(employee, s.weekIndex)) {
      this.pushToast('이번 주에 배정할 수 있는 담당자를 선택하세요.')
      return false
    }
    const locked = offer.offerNegotiation?.decision === 'accepted' ? offer.offerNegotiation.technology : undefined
    const selected = technology ?? locked ?? offer.technology
    if ((locked && locked !== selected) ||
        (selected !== offer.technology && (!offer.alternatives.includes(selected) || !s.company.validated.includes(selected)))) {
      this.pushToast('파일럿을 마친 대체 기술을 선택하세요.')
      return false
    }
    const { offerNegotiation: _decision, ...accepted } = effectiveOffer(offer)
    const project = this.beginProject({ ...accepted, technology: selected }, employee)
    if (selected !== offer.technology) {
      if (!project.longContract) project.durationTicks += BALANCE.TICKS_PER_DAY
      project.bugs += 3
      project.reviewRisk = true
    }
    project.advance = project.longContract ? longPayments(project.budget).advance : Math.round(project.budget * BALANCE.ADVANCE_RATIO)
    project.paidAdvance = true
    postOperating(s, 'contracts', project.advance)
    applyOfferNegotiationAward(project, s.employees)
    s.market = s.market.filter((candidate) => candidate.id !== offerId)
    s.tutorialStep = Math.max(2, s.tutorialStep)
    this.record('contract', 'accepted', { projectId: project.id, employeeId: employee.id, technology: selected,
      customerId: project.customerId, mode: project.source,
      domain: project.domain, amount: project.advance, duration: project.durationTicks, difficulty: project.difficulty })
    this.pushToast('수주 · ' + employee.name + ' 배정 · 착수금 +' + project.advance)
    return true
  }

  private clearActivity(employee: Employee): void {
    const support = this.state.enterprise.support
    if (support.week === this.state.weekIndex) {
      support.employeeIds = support.employeeIds.filter((id) => id !== employee.id)
    }
    if (employee.activity?.kind === 'repair') {
      const issue = this.project(employee.activity.target)?.issue
      if (issue?.assignedId === employee.id) issue.assignedId = null
    }
    employee.activity = null
  }

  assignEmployee(employeeId: string, projectId: string | null, emergency = false): boolean {
    if (this.state.gameOver) return false
    const employee = this.employee(employeeId)
    const target = projectId ? this.project(projectId) : undefined
    if (!employee || (projectId && (!target || !isActive(target)))) return false
    if (projectId && employee.assignedProjectId === projectId) return true

    const blocked = assignmentBlock(this.state, employee, target, emergency)
    if (blocked) {
      if (blocked === 'last-assignee') this.pushToast('마지막 담당자입니다. 후임을 먼저 배정하세요.')
      if (blocked === 'worked-this-week') this.pushToast('진행한 주간 활동을 바꾸려면 긴급 재배정을 선택하세요.')
      return false
    }
    const previous = employee.assignedProjectId ? this.project(employee.assignedProjectId) : undefined
    if (previous) previous.assigneeIds = previous.assigneeIds.filter((id) => id !== employee.id)
    this.clearActivity(employee)
    employee.handover = null
    employee.assignedProjectId = target?.id ?? null
    if (!target) return true
    delete employee.contractAvailableWeek

    const sourceId = target.assigneeIds[0]
    if (target.elapsedTicks > 0 && sourceId && !target.workTicks[employee.id]) {
      employee.handover = { projectId: target.id, sourceId, remaining: BALANCE.TICKS_PER_DAY }
    }
    target.assigneeIds.push(employee.id)
    this.record('assignment', emergency ? 'emergency' : 'assigned', { projectId: target.id, employeeId: employee.id })
    if (emergency) this.pushToast(employee.name + ' 긴급 재배정 · 기존 경험 보존')
    return true
  }

  assignDevelopmentTeam(projectId: string): boolean {
    const s = this.state
    const project = this.project(projectId)
    if (!project || !isActive(project) || growthStage(s).index < 3 || s.gameOver) return false
    const suitable = s.employees.filter((employee) =>
      freeForContract(employee, s.weekIndex) && employee.role !== 'coordinator' && employee.role !== 'pm')
    const team = suitable.slice(0, Math.max(0, 4 - project.assigneeIds.length))
    let count = 0
    for (const employee of team) if (this.assignEmployee(employee.id, projectId)) count++
    if (count) this.pushToast(project.title + ' · 개발팀 ' + count + '명 배정')
    return count > 0
  }

  approveLongContractReview(id: string): boolean {
    const s = this.state
    const project = this.project(id)
    if (s.gameOver || !project || pendingScopeProject(s)) return false
    const balance = approveLongReview(project)
    if (balance === null) return false
    postOperating(s, 'contracts', balance)
    this.record('contract', 'milestone', { projectId: id, amount: balance })
    this.pushToast(project.title + ' · 중간 검수 완료 · 중도금 +' + balance)
    return true
  }

  private releaseProject(project: Project): void {
    for (const employee of this.state.employees) {
      if (employee.assignedProjectId !== project.id) continue
      if (project.state === 'done' && !project.isProduct) employee.contractAvailableWeek = this.state.weekIndex
      employee.assignedProjectId = null
      employee.handover = null
    }
    project.assigneeIds = []
  }

  cancelProject(id: string): boolean {
    const project = this.project(id)
    if (!project || !isActive(project) || this.state.gameOver) return false
    const refund = project.paidAdvance ? project.advance : 0
    postOperating(this.state, 'contracts', -refund)
    project.paidAdvance = false
    project.state = 'canceled'
    project.scopePending = false
    this.releaseProject(project)
    this.record('contract', 'canceled', { projectId: project.id, amount: refund })
    this.pushToast('계약 취소 · 착수금 ' + refund + ' 전액 반환 · 개인 노하우 유지')
    return true
  }

  hireEmployee(role: BaseRole): boolean {
    const s = this.state
    if (s.gameOver || s.company.cash < HIRE_COST || s.employees.length >= companyCapacity(s).hires) return false
    const count = s.employees.filter((employee) => employee.role === role && !employee.isPlayer).length + 1
    const employee = createEmployee(s.weekIndex, role, count)
    postOperating(s, 'other', -HIRE_COST)
    s.employees.push(employee)
    this.record('staff', 'hired', { employeeId: employee.id, mode: role, amount: HIRE_COST })
    this.pushToast(employee.name + ' 입사 · ' + ROLES[role])
    return true
  }

  departEmployee(id: string): boolean {
    const employee = this.employee(id)
    if (!employee || employee.isPlayer) return false
    for (const project of this.state.projects) {
      project.assigneeIds = project.assigneeIds.filter((assigneeId) => assigneeId !== id)
    }
    this.clearActivity(employee)
    this.state.employees = this.state.employees.filter((member) => member.id !== id)
    this.record('staff', 'departed', { employeeId: employee.id })
    this.pushToast(employee.name + ' 퇴사 · 프로젝트 배정을 확인하세요.')
    return true
  }

  levelUpRole(id: string): boolean {
    const employee = this.employee(id)
    if (this.state.gameOver || !employee || !canLevelUpRole(employee)) return false
    const level = (roleLevel(employee) + 1) as RoleLevel
    employee.roleLevels[employee.role] = level
    this.pushToast(employee.name + ' · ' + ROLES[employee.role] + ' Lv.' + level)
    return true
  }

  changeRole(id: string, role: Role): boolean {
    const employee = this.employee(id)
    if (this.state.gameOver || !employee || !canChangeRole(employee, role)) return false
    employee.role = role
    employee.roleLevels[role] ??= 1
    if (!employee.isPlayer) employee.desiredSalary = Math.max(employee.desiredSalary, employee.salary + 5)
    this.record('staff', 'promoted', { employeeId: employee.id, mode: role })
    this.pushToast(employee.name + ' 전직 · ' + ROLES[role])
    return true
  }

  negotiateSalary(id: string, proposed: number): boolean {
    const employee = this.employee(id)
    if (this.state.gameOver || !employee || !salaryReviewDue(employee, this.state.weekIndex) ||
      !Number.isSafeInteger(proposed) || proposed < employee.salary) return false
    employee.salary = proposed
    employee.salaryReviewYear = reviewYear(employee, this.state.weekIndex)
    if (proposed >= employee.desiredSalary) employee.complaints.salary = 0
    this.record('staff', 'salary', { employeeId: employee.id, amount: proposed })
    this.pushToast(employee.name + ' 연봉협상 · 주급 ' + proposed)
    return true
  }

  startTraining(id: string, technology: string, pilot = false): boolean {
    const employee = this.employee(id)
    const s = this.state
    if (!employee || trainingBlock(s, employee, technology, pilot)) return false
    employee.activity = { kind: pilot ? 'pilot' : 'training', target: technology,
      progress: 0, duration: (pilot ? PILOT_DAYS : TRAINING_DAYS) * BALANCE.TICKS_PER_DAY, voucher: false }
    this.record('training', 'started', { employeeId: employee.id, technology, mode: pilot ? 'pilot' : 'training' })
    return true
  }

  buyItem(item: Item): boolean {
    const c = this.state.company
    const offer = SHOP[item]
    if (this.state.gameOver || !offer || c.cash < offer.price || (item === 'voucher' && c.shopStock.voucher < 1)) return false
    postOperating(this.state, 'other', -offer.price)
    if (item === 'voucher') c.shopStock.voucher--
    c.inventory[item]++
    this.record('shop', 'bought', { mode: item, amount: offer.price })
    return true
  }

  useItem(id: string, item: Item): boolean {
    const employee = this.employee(id)
    const s = this.state
    if (!employee || s.gameOver || !SHOP[item] || s.company.inventory[item] < 1 ||
      employee.itemWeek[item] === s.weekIndex) return false
    if (item === 'voucher' && (employee.activity?.kind !== 'training' || !tech(employee.activity.target))) return false
    if (item === 'meal') employee.stress = Math.max(0, employee.stress - 18)
    if (item === 'book') employee.stats.communication = Math.min(100, employee.stats.communication + 3)
    if (item === 'voucher' && employee.activity?.kind === 'training') employee.activity.voucher = true
    s.company.inventory[item]--
    employee.itemWeek[item] = s.weekIndex
    this.record('shop', 'used', { employeeId: employee.id, mode: item })
    this.pushToast(employee.name + ' · ' + SHOP[item].label + ' 사용')
    return true
  }

  startProduct(domain: Domain, employeeId: string): boolean {
    const s = this.state
    const employee = this.employee(employeeId)
    const prior = [...s.projects].reverse().find((project) => project.state === 'done' && !project.isProduct && project.domain === domain)
    if (s.gameOver || !employee || !prior || !freeForActivity(employee, s.weekIndex) ||
      s.company.cash < 100 || this.activeCount >= s.company.projectSlots || !productDomains(s.projects).includes(domain) ||
      s.projects.some((project) => project.isProduct && (isActive(project) || project.state === 'done')) ||
      !s.employees.some((member) => (member.domainXp[domain] ?? 0) >= 8)) return false
    this.beginProject({
      id: uid('product'), title: DOMAINS[domain] + ' 자사 솔루션', client: '자사 제품',
      budget: 0, difficulty: 2, durationTicks: 75, bugTolerance: 22, requirements: prior.requirements,
      technology: prior.technology, alternatives: [], domain, style: 'stable',
    }, employee, true)
    postOperating(s, 'other', -100)
    this.record('product', 'started', { employeeId, domain, amount: 100 })
    this.pushToast('자사 제품 시작 · 개발비 100')
    return true
  }

  setProjectMode(id: string, mode: WorkMode): void {
    const project = this.project(id)
    if (project && !this.state.gameOver) setMode(project, mode)
  }

  startRepair(employeeId: string, projectId: string): boolean {
    const employee = this.employee(employeeId)
    const issue = this.project(projectId)?.issue
    if (this.state.gameOver || !employee || !issue || issue.assignedId || issue.outsourcedUntil !== null ||
      !freeForActivity(employee, this.state.weekIndex)) return false
    employee.activity = { kind: 'repair', target: projectId }
    issue.assignedId = employee.id
    this.record('maintenance', 'internal', { projectId, employeeId, remaining: issue.remaining })
    return true
  }

  outsourceRepair(id: string): boolean {
    const project = this.project(id)
    const issue = project?.issue
    if (this.state.gameOver || !project || !issue || issue.assignedId || issue.outsourcedUntil !== null) return false
    const price = outsourcePrice(project)
    if (this.state.company.cash < price) return false
    postOperating(this.state, 'other', -price)
    issue.outsourcedUntil = this.state.tick + OUTSOURCE_TIME + Math.ceil(issue.remaining)
    this.record('maintenance', 'outsourced', { projectId: project.id, amount: price, remaining: issue.remaining })
    this.pushToast('외주 보수 의뢰 · 비용 ' + price)
    return true
  }

  requestRepair(id: string): boolean {
    const project = this.project(id)
    if (this.state.gameOver || !project || isActive(project) || project.issue || project.debt < 1) return false
    this.openIssue(project, '예방 리팩토링')
    return true
  }

  private openIssue(project: Project, source: string): void {
    project.issue = {
      remaining: 8 + Math.ceil(project.debt * 0.3) + Math.ceil(project.bugs * 0.12),
      source, assignedId: null, outsourcedUntil: null,
    }
    this.record('maintenance', 'opened', { projectId: project.id, debt: project.debt, remaining: project.issue.remaining })
    this.pushToast(project.title + ' · 보수 요청 ' + source)
  }

  private reduceDebt(project: Project, amount: number): void {
    const reduction = Math.min(project.debt, amount)
    project.debt -= reduction
    this.state.company.dp = Math.max(0, this.state.company.dp - reduction)
  }

  private finishRepair(project: Project, employee?: Employee): void {
    this.reduceDebt(project, 12 + project.debt * 0.28)
    project.bugs = Math.max(0, project.bugs - 10)
    project.issue = null
    if (employee) {
      employee.activity = null
      this.state.company.research += 2
    }
    this.record('maintenance', 'repaired', { projectId: project.id, employeeId: employee?.id,
      mode: employee ? 'internal' : 'outsourced', debt: project.debt })
    this.pushToast(project.title + ' · ' + (employee ? '사내' : '외주') + ' 보수 완료')
  }

  reviewProject(id: string, findCause: boolean): boolean {
    const project = this.project(id)
    if (this.state.gameOver || !project || !canReview(project) || project.assigneeIds.length === 0) return false
    project.reviewUsed = true
    if (findCause) {
      project.bugs = Math.max(0, project.bugs - 9)
      this.reduceDebt(project, 5)
    }
    this.record('review', findCause ? 'success' : 'fail', { projectId: project.id, debt: project.debt })
    this.pushToast(findCause ? '리뷰 성공 · 회귀 테스트로 위험 감소' : '기본 테스트를 계속합니다.')
    return true
  }

  resolveScope(id: string, accept: boolean): boolean {
    const project = this.project(id)
    if (this.state.gameOver || !project?.scopePending || !isActive(project)) return false
    project.scopePending = false
    if (accept) {
      project.budget += Math.round(project.budget * 0.15)
      if (project.longContract) {
        const advance = longPayments(project.budget).advance
        postOperating(this.state, 'contracts', advance - project.advance)
        project.advance = advance
      } else project.durationTicks += BALANCE.TICKS_PER_DAY
      project.progress = Math.max(0, project.progress - 14)
      project.bugs += 4
      project.reviewRisk = true
    }
    this.record('scope', accept ? 'accepted' : 'declined', { projectId: project.id, duration: project.durationTicks })
    this.pushToast(accept ? '변경 수락 · 추가 보상과 공수 반영' : '원래 계약 범위를 유지합니다.')
    return true
  }

  negotiateProject(id: string, employeeId: string, goal: 'time' | 'scope', useResearch = false): boolean {
    const p = this.project(id)
    const e = this.employee(employeeId)
    const s = this.state
    if (s.gameOver || !p || !isActive(p) || p.isProduct || p.scopePending || p.negotiationWeek === s.weekIndex ||
      (p.longContract && p.negotiationWeek > 0) ||
      !e || e.role !== 'pm' || (e.assignedProjectId !== id && !freeForActivity(e, s.weekIndex)) ||
      (useResearch && s.company.research < 3)) return false

    p.negotiationWeek = s.weekIndex
    e.workedWeek = s.weekIndex
    gainRoleXp(e, 'coordinator', 6)
    if (useResearch) s.company.research -= 3
    const odds = negotiationOdds(e, s.company.trust, p, useResearch)
    const roll = this.random() * 100
    this.record('negotiation', roll < odds.success ? 'success' : roll >= 100 - odds.critical ? 'critical' : 'fail',
      { projectId: id, employeeId, mode: goal, amount: useResearch ? 3 : 0 })
    if (roll < odds.success) {
      if (goal === 'time' && !p.longContract) p.durationTicks += WEEK_TICKS
      else p.progress = Math.min(p.longContract && !p.longContract.middlePaid ? 45 : 99, p.progress + (goal === 'time' ? 8 : 16))
      p.scopePending = false
      this.pushToast(goal === 'time' && !p.longContract ? '조율 성공 · 납기 한 주 연장' : '조율 성공 · 단계별 납품 공수 완화')
    } else if (roll >= 100 - odds.critical) {
      if (p.style === 'urgent' && !p.longContract) p.durationTicks = Math.max(p.elapsedTicks + 1, p.durationTicks - BALANCE.TICKS_PER_DAY)
      else p.progress = Math.max(0, p.progress - 10)
      p.scopePending = false
      this.pushToast(p.style === 'urgent' && !p.longContract ? '조율 대실패 · 납기 단축' : '조율 대실패 · 추가 검수 공수 발생')
    } else {
      this.pushToast('조율 실패 · 현재 조건 유지')
    }
    return true
  }

  private finishProject(project: Project, vacancy = false): void {
    const s = this.state
    const overdue = vacancy && Boolean(project.longContract) && project.assigneeIds.length > 0
    if (vacancy) {
      project.result = 'fail'
      project.state = 'failed'
      project.payout = 0
      s.company.trust = Math.max(0, s.company.trust - 8)
    } else {
      const result = settleProject(project)
      postOperating(s, 'contracts', result.cash)
      rewardOfferNegotiationDelivery(project, s.employees)
      s.company.trust = clamp(s.company.trust + result.trust, 0, 100)
      const debt = result.dp * (project.acceptedOfferNegotiation?.debtMultiplier ?? 1)
      s.company.dp += debt
      project.debt += debt
      s.company.heat = clamp(s.company.heat + debt * BALANCE.HEAT_FROM_DP_RATIO, 0, 100)
    }
    project.scopePending = false
    this.releaseProject(project)
    this.refreshGrowth()
    s.lastResult = { ...project }
    s.tutorialStep = Math.max(3, s.tutorialStep)
    const customer = recordCustomerOutcome(s, project)
    this.record('delivery', vacancy && !overdue ? 'vacant' : project.result ?? 'fail', { projectId: project.id,
      customerId: customer?.id, trust: customer?.trust,
      technology: project.technology, domain: project.domain, mode: project.mode, amount: project.payout,
      duration: project.elapsedTicks, debt: project.debt })
    if (overdue) this.pushToast(formatContractDuration(project.durationTicks) + ' 납기 초과 · 계약 실패')
    else if (vacancy) this.pushToast('기한까지 후임 미배정 · 계약 실패')
    else if (project.isProduct && project.state === 'done') this.pushToast(project.title + ' 출시 · 자사 솔루션에서 시범 도입 및 판매 가능')
    else this.pushToast(project.title + ' 정산 · 잔금 ' + project.payout)
  }

  private learn(employee: Employee, technology: string, gain: number): void {
    employee.stackXp[technology] = (employee.stackXp[technology] ?? 0) + gain
  }

  private workOnProject(employee: Employee, project: Project): void {
    const count = (project.workTicks[employee.id] ?? 0) + 1
    project.workTicks[employee.id] = count
    employee.workedWeek = this.state.weekIndex
    const handover = employee.handover
    if (handover) {
      handover.remaining--
      if (handover.remaining <= 0) {
        const source = this.employee(handover.sourceId)
        if (source && source.assignedProjectId === project.id) {
          const specialty = tech(project.technology)
          const aptitude = specialty ? employee.stats[specialty.skill] : employee.stats.coding
          const rate = clamp(0.30 - aptitude / 220, 0.06, 0.25)
          const gap = (source.stackXp[project.technology] ?? 0) - (employee.stackXp[project.technology] ?? 0)
          this.learn(employee, project.technology, Math.max(0, gap * rate))
          const domainGap = (source.domainXp[project.domain] ?? 0) - (employee.domainXp[project.domain] ?? 0)
          employee.domainXp[project.domain] = (employee.domainXp[project.domain] ?? 0) + Math.max(0, domainGap * rate)
        }
        employee.handover = null
        this.pushToast(employee.name + ' 인수인계 완료')
      }
      return
    }

    const gain = count <= BALANCE.TICKS_PER_DAY ? 0.17 : 0.44
    this.learn(employee, project.technology, gain)
    employee.domainXp[project.domain] = (employee.domainXp[project.domain] ?? 0) + gain * 0.65
    const role = skillRole(tech(project.technology)?.skill ?? 'coding')
    gainRoleXp(employee, role, longRoleXpGain(project, count, gain))
    employee.stress = Math.min(100, employee.stress + (project.mode === 'speed' ? 1.4 : 0.4))
  }

  private tickActivity(employee: Employee): void {
    const activity = employee.activity
    if (!activity) return
    employee.workedWeek = this.state.weekIndex
    if (activity.kind === 'repair') {
      const project = this.project(activity.target)
      if (!project?.issue || project.issue.assignedId !== employee.id) {
        employee.activity = null
        return
      }
      project.issue.remaining -= employee.role === 'platform' ? 1.5 : 1
      this.learn(employee, project.technology, 0.30)
      employee.domainXp[project.domain] = (employee.domainXp[project.domain] ?? 0) + 0.18
      if (project.issue.remaining <= 0) this.finishRepair(project, employee)
      return
    }

    activity.progress++
    const entry = trainingCourse(activity.target)
    const gain = activity.progress <= BALANCE.TICKS_PER_DAY ? 0.20 : 0.45
    if (tech(activity.target)) this.learn(employee, activity.target, gain)
    if (entry) {
      employee.stats[entry.skill] = Math.min(100, employee.stats[entry.skill] + gain * (entry.skill === 'communication' ? 0.35 : 0.12))
      const role = skillRole(entry.skill)
      gainRoleXp(employee, role, gain * 0.35)
    }
    if (activity.progress < activity.duration) return
    if (activity.voucher && tech(activity.target)) this.learn(employee, activity.target, 8)
    if (activity.kind === 'pilot') {
      this.state.company.validated.push(activity.target)
      this.state.company.research += 3
    }
    employee.activity = null
    this.record('training', activity.kind === 'pilot' ? 'pilot' : 'trained', { employeeId: employee.id, technology: activity.target })
    this.pushToast(employee.name + ' · ' + techName(activity.target) +
      (activity.kind === 'pilot' ? ' 파일럿 검증 완료' : ' 교육 수료'))
  }

  private reviewStaff(): void {
    const s = this.state
    for (const employee of [...s.employees]) {
      if (employee.isPlayer) continue
      if (salaryReviewDue(employee, s.weekIndex) &&
        (s.weekIndex - employee.hiredWeek) % (12 * WEEKS_PER_MONTH) === 0) {
        employee.desiredSalary = Math.max(employee.desiredSalary, employee.salary + (employee.role === 'pm' ? 9 : 5))
        this.pushToast(employee.name + ' · 정기 연봉협상')
      }
      for (const [reason, harmful] of [
        ['salary', salaryReviewDue(employee, s.weekIndex) && employee.salary < employee.desiredSalary],
        ['balance', employee.stress > employee.workloadLimit],
      ] as const) {
        const prior = employee.complaints[reason]
        employee.complaints[reason] = harmful ? prior + 1 : Math.max(0, prior - 1)
        const current = employee.complaints[reason]
        if (harmful && [2, 4, 6].includes(current)) {
          const label = reason === 'salary' ? '급여' : '워라밸'
          this.pushToast(employee.name + ' · ' + label + ' ' + (current === 2 ? '불만' : current === 4 ? '면담 요청' : '퇴사 의사'))
        }
        if (harmful && current >= 7) {
          this.departEmployee(employee.id)
          break
        }
      }
    }
  }

  private weeklySettlement(): void {
    const s = this.state
    const c = s.company
    const payroll = s.employees.reduce((sum, employee) => sum + employee.salary, 0)
    const rent = weeklyRent(s)
    const expenses = payroll + rent + BALANCE.WEEKLY_SERVER
    const interest = Math.floor(c.dp * BALANCE.INTEREST_BASE)
    if (interest > 0 && c.dp > 0) {
      for (const project of s.projects) project.debt += interest * project.debt / c.dp
    }
    c.dp += interest
    c.heat = clamp(c.heat + interest * 0.4, 0, 100)
    const oldProducts = legacyProductProjects(s)
    const oldSupportIncome = oldProducts.reduce((sum, project) => sum + (project.issue ? 12 : 32), 0)
    const oldSupportCost = oldProducts.length * 18
    postOperating(s, 'solutions', oldSupportIncome)
    postOperating(s, 'support', -oldSupportCost)
    postOperating(s, 'payroll', -payroll)
    postOperating(s, 'rent', -rent)
    postOperating(s, 'hosting', -BALANCE.WEEKLY_SERVER)
    const solution = settleEnterpriseWeek(s, this.random)
    this.applyEnterpriseResult(solution, 'hosting')
    c.supportNet = oldSupportIncome - oldSupportCost + solution.income - solution.expense
    this.record('settlement', 'settled', { amount: expenses, cash: c.cash, debt: c.dp, heat: c.heat, research: c.research })
    this.pushToast('주간 정산 · 비용 ' + expenses + ' · 기술부채 이자 +' + interest +
      (c.supportNet ? ' · 제품 지원 순수입 ' + c.supportNet : ''))
    if (c.heat >= BALANCE.MELTDOWN_HEAT) {
      const recovery = Math.round(80 + c.dp * 0.5)
      postOperating(s, 'other', -recovery)
      c.heat = 35
      this.record('incident', 'repaired', { amount: recovery, cash: c.cash, debt: c.dp, heat: c.heat })
      this.pushToast('장애 복구비 ' + recovery + ' · 서비스 재개 · 기술부채 유지')
    }
  }

  private endDay(): void {
    const s = this.state
    s.dayIndex++
    s.dayOfWeek++
    if (s.dayOfWeek > BALANCE.DAYS_PER_WEEK) {
      this.weeklySettlement()
      if (s.weekIndex % WEEKS_PER_MONTH === 0) closeOperatingMonth(s)
      s.dayOfWeek = 1
      s.weekIndex++
      this.reviewStaff()
      if ((s.weekIndex - 1) % WEEKS_PER_MONTH === 0) {
        const activeClients = s.projects.filter(isActive).map((project) => project.client)
        s.market = refreshMarket(s.company.trust, false, activeClients).map((offer) => linkOffer(s, offer))
        s.company.shopStock = { ...INITIAL_STOCK }
        this.record('market', 'refreshed', { remaining: s.market.length, cash: s.company.cash })
        this.pushToast('월초 · 미수락 의뢰 및 상점 재고 갱신')
      }
    }

    this.applyEnterpriseResult(advanceEnterpriseDay(s, this.random))
    const campaignEnded = s.sales.campaignDueTick !== null && s.tick >= s.sales.campaignDueTick
    const longOffer = createLongContractOffer(s)
    const offers = advanceSales(s, this.random)
    if (campaignEnded && !offers.some(({ offer }) => offer.source === 'promotion')) {
      this.pushToast('외주 홍보 종료 · 신규 의뢰 없음')
      this.record('sales', 'fail')
    }
    if (longOffer) offers.push(longOffer)
    for (const { offer, customer } of offers) {
      this.record('customer', offer.source === 'promotion' ? 'acquired' : 'followup', {
        customerId: customer.id, trust: customer.trust, amount: offer.budget,
        technology: offer.technology, domain: offer.domain,
      })
      this.pushToast(customer.name + (offer.longContract ? ' · ' + formatContractDuration(offer.durationTicks) + ' 장기 의뢰 제안' : offer.source === 'promotion' ? ' · 홍보 신규 의뢰' : ' · 후속 의뢰'))
    }

    const idle = s.employees.some((employee) => freeForActivity(employee, s.weekIndex))
    const inspecting = s.employees.some((employee) => employee.activity?.kind === 'repair')
    if (s.dayOfWeek === 1 || (s.dayIndex % 3 === 0 && (idle || inspecting))) {
      const candidate = s.projects.find((project) => project.state === 'done' && !project.issue &&
        (project.debt >= 12 || project.bugs >= 18 || project.isProduct))
      if (candidate && (candidate.debt >= 12 || this.random() < 0.38)) {
        this.openIssue(candidate, s.dayOfWeek === 1 ? '정기 점검' : inspecting ? '유지보수 중 발견' : '대기 인력 점검')
      }
    }

    for (const employee of s.employees) {
      const project = employee.assignedProjectId && this.project(employee.assignedProjectId)
      const support = s.enterprise.support
      const busy = project || employee.activity || (support.week === s.weekIndex && support.employeeIds.includes(employee.id))
      employee.stamina = clamp(employee.stamina + (busy ? -1 : 8), 0, 100)
      employee.stress = clamp(employee.stress - (project && project.mode === 'speed' ? 0 : busy ? 2 : 8), 0, 100)
    }

    this.refreshGrowth()
    if (s.company.cash >= 0) s.bankruptGraceDays = 0
    else if (++s.bankruptGraceDays > 3) {
      s.gameOver = true
      s.speed = 0
      this.pushToast('현금 부족으로 회사 운영 종료')
    }
  }

  advance(period: 'day' | 'week'): void {
    if (this.state.gameOver || pendingScopeProject(this.state)) return
    const length = period === 'week' ? WEEK_TICKS : BALANCE.TICKS_PER_DAY
    const remaining = length - this.state.tick % length
    this.setSpeed(1)
    for (let step = 0; step < remaining && !this.state.gameOver && this.state.speed !== 0; step++) this.tick()
    this.state.speed = 0
  }

  tick(): void {
    const s = this.state
    if (s.speed === 0 || s.gameOver) return
    if (pendingScopeProject(s)) {
      s.speed = 0
      return
    }
    s.tick++
    for (const employee of s.employees) this.tickActivity(employee)
    for (const project of s.projects) {
      const issue = project.issue
      if (issue && issue.outsourcedUntil !== null && s.tick >= issue.outsourcedUntil) this.finishRepair(project)
      if (!isActive(project)) continue

      const assigned = s.employees.filter((employee) => project.assigneeIds.includes(employee.id))
      if (assigned.length === 0 || waitingForLongReview(project)) {
        project.elapsedTicks++
        if (project.elapsedTicks >= project.durationTicks) this.finishProject(project, true)
        continue
      }
      const reviewing = canReview(project)
      const { dpGain, heatGain, finished } = tickProject(project, assigned)
      if (waitingForLongReview(project)) this.pushToast(project.title + ' · 중간 검수 단계 도달')
      if (!reviewing && canReview(project)) {
        s.speed = 0
        this.pushToast(project.title + ' · 배포 전 코드 리뷰 가능')
      }
      const risk = project.acceptedOfferNegotiation?.debtMultiplier ?? 1
      const debt = dpGain * risk * (assigned.some((employee) => employee.role === 'platform') ? 0.8 : 1)
      project.debt += debt
      s.company.dp += debt
      s.company.heat = clamp(s.company.heat + heatGain * risk, 0, 100)
      for (const employee of assigned) this.workOnProject(employee, project)
      if (finished) this.finishProject(project)
      else if (project.longContract && project.elapsedTicks >= project.durationTicks) this.finishProject(project, true)
      else if (!project.isProduct && !project.scopeChecked && project.progress >= 42) {
        project.scopeChecked = true
        project.scopePending = this.random() < CLIENT_STYLES[project.style].scopeChance && project.difficulty > 1
        if (project.scopePending) {
          s.speed = 0
          this.record('scope', 'requested', { projectId: project.id })
          this.pushToast(project.title + ' · 고객 범위 변경 요청')
        }
      }
    }
    if (s.tick % BALANCE.TICKS_PER_DAY === 0) this.endDay()
  }
}

export type { Company, Employee, MarketOffer, Project, Toast }
