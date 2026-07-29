import { Game, SAVE_VERSION, createNewGame } from './Game'
import type { GameSnapshot } from './types'

const SAVE_KEY = 'developer_tycoon_save_v1'

export function serializeGame(game: Game): string {
  return JSON.stringify(game.getSnapshot())
}

export function deserializeGame(raw: string): Game | null {
  try {
    const data = JSON.parse(raw) as GameSnapshot
    if (!data || data.version !== SAVE_VERSION) return null
    return new Game(data)
  } catch {
    return null
  }
}

export function saveToLocal(game: Game): void {
  localStorage.setItem(SAVE_KEY, serializeGame(game))
}

export function loadFromLocal(): Game | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  return deserializeGame(raw)
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}

export function newGame(name?: string): Game {
  clearSave()
  return new Game(createNewGame(name))
}
