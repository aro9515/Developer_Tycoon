import { BALANCE } from '@/data/balance'
import { Game, SAVE_VERSION, createNewGame } from './Game'
import { offerToProject } from './project'
import { createEmployee } from './staff'
import type { GameSnapshot, MarketOffer, Project } from './types'

const SAVE_KEY = 'developer_tycoon_save_v1'

export function serializeGame(game: Game): string {
  return JSON.stringify(game.getSnapshot())
}

function migrateProject(previous: Project): Project {
  return {
    ...offerToProject({
      ...previous, technology: 'javascript', alternatives: [], domain: 'operations', style: 'stable',
    }),
    ...previous,
    advance: previous.paidAdvance ? Math.round(previous.budget * BALANCE.ADVANCE_RATIO) : 0,
  }
}

function migrateSave(previous: GameSnapshot): GameSnapshot {
  const defaults = createNewGame(previous.company.name)
  const projects = previous.projects.map(migrateProject)
  const latest = projects.at(-1)
  if (latest) latest.debt = previous.company.dp
  return {
    ...previous, version: SAVE_VERSION,
    company: { ...defaults.company, ...previous.company },
    employees: previous.employees.map((employee) => ({
      ...createEmployee(previous.weekIndex, 'frontend', 1, employee.isPlayer), ...employee, roleLevels: employee.roleLevels ?? {},
    })),
    projects,
    lastResult: previous.lastResult ? migrateProject(previous.lastResult) : null,
    market: previous.market.map((offer): MarketOffer => ({
      ...offer, technology: 'javascript', alternatives: [], domain: 'operations', style: 'stable',
    })),
    speed: 0,
  }
}

export function deserializeGame(raw: string): Game | null {
  try {
    const data = JSON.parse(raw) as GameSnapshot
    if (!data?.company || !Array.isArray(data.employees) || !data.employees.length ||
        !Array.isArray(data.projects) || !Array.isArray(data.market)) return null
    if (data.version === 1) return new Game(migrateSave(data))
    return data.version === SAVE_VERSION ? new Game(data) : null
  } catch {
    return null
  }
}

export function saveToLocal(game: Game): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(game))
    return true
  } catch {
    return false
  }
}

export function loadFromLocal(): Game | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? deserializeGame(raw) : null
  } catch {
    return null
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // The game still works when the browser blocks local storage.
  }
}

export function newGame(name?: string): Game {
  return new Game(createNewGame(name))
}
