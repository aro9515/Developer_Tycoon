import { ADVANCED_ROLES, BASE_ROLES, MAX_ROLE_LEVEL, ROLE_LEVEL_XP, ROLE_REQUIREMENTS, WEEKS_PER_YEAR, type BaseRole, type Role, type RoleLevel } from '@/data/rules'
import type { Employee, SkillKey, SkillStats } from './types'
import { uid } from './utils'
import { BASE_WEEKLY_WAGES } from './weeklyContracts'

const START_STATS: SkillStats = { coding: 25, frontend: 15, backend: 15, database: 10, infra: 5, ai: 5, communication: 20 }
export const HIRE_COST = 90
const JOB_OFFERS: Record<BaseRole, { name: string; salary: number; stats: Partial<SkillStats>; stack: Record<string, number> }> = {
  frontend: { name: '수현', salary: BASE_WEEKLY_WAGES.frontend, stats: { frontend: 26 }, stack: { javascript: 30, vue: 18 } },
  backend: { name: '지민', salary: BASE_WEEKLY_WAGES.backend, stats: { backend: 28, database: 18 }, stack: { java: 22, spring: 10, csharp: 12 } },
  server: { name: '민준', salary: BASE_WEEKLY_WAGES.server, stats: { infra: 28, database: 14 }, stack: { linux: 25, docker: 15 } },
  coordinator: { name: '서연', salary: BASE_WEEKLY_WAGES.coordinator, stats: { communication: 36 }, stack: {} },
}

export function createEmployee(week: number, role: BaseRole, count: number, isPlayer = false): Employee {
  const offer = JOB_OFFERS[role]
  const salary = isPlayer ? 0 : offer.salary
  return {
    id: uid('emp'), isPlayer, name: isPlayer ? '나' : offer.name + (count > 1 ? ' ' + count : ''),
    salary, stats: isPlayer ? { ...START_STATS } : { ...START_STATS, ...offer.stats },
    stamina: 100, stress: 10, morale: 70, assignedProjectId: null,
    stackXp: isPlayer ? { javascript: 20 } : { ...offer.stack },
    domainXp: {}, role, roleXp: {}, roleLevels: { [role]: 1 }, activity: null, workedWeek: 0,
    hiredWeek: week, salaryReviewYear: 0, desiredSalary: salary, workloadLimit: role === 'server' ? 60 : 50,
    complaints: { salary: 0, balance: 0 }, handover: null, itemWeek: {},
  }
}

export function roleLevel(employee: Employee, role = employee.role): RoleLevel {
  return employee.roleLevels[role] ?? 1
}

export function nextRoleTarget(employee: Employee): number | undefined {
  return ROLE_LEVEL_XP[roleLevel(employee) + 1]
}

export function canLevelUpRole(employee: Employee): boolean {
  const target = nextRoleTarget(employee)
  return target !== undefined && (employee.roleXp[employee.role] ?? 0) >= target
}

export function gainRoleXp(employee: Employee, relatedRole: BaseRole, gain: number): void {
  const role = (BASE_ROLES as readonly Role[]).includes(employee.role) ? relatedRole : employee.role
  employee.roleXp[role] = (employee.roleXp[role] ?? 0) + gain
}

export function canChangeRole(employee: Employee, role: Role): boolean {
  if (role === employee.role) return false
  if ((BASE_ROLES as readonly Role[]).includes(role) || employee.roleLevels[role] !== undefined) return true
  const advanced = ADVANCED_ROLES.find((candidate) => candidate === role)
  return Boolean(advanced && ROLE_REQUIREMENTS[advanced].some((pair) =>
    pair.every((baseRole) => roleLevel(employee, baseRole) === MAX_ROLE_LEVEL),
  ))
}

export function skillRole(skill: SkillKey): BaseRole {
  if (skill === 'frontend') return 'frontend'
  if (skill === 'infra') return 'server'
  if (skill === 'communication') return 'coordinator'
  return 'backend'
}

export function reviewYear(employee: Employee, week: number): number {
  return Math.floor((week - employee.hiredWeek) / WEEKS_PER_YEAR)
}

export function salaryReviewDue(employee: Employee, week: number): boolean {
  return !employee.isPlayer && reviewYear(employee, week) > employee.salaryReviewYear
}
