import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { BALANCE } from '@/data/balance'
import { companyCapacity, freeForActivity, freeForContract, pendingScopeProject, productDomains, type Game } from '@/core/Game'
import { isActive } from '@/core/project'
import { newGame } from '@/core/save'
import { createPlaytestSync } from '@/core/playtestSync'
import type { GameSnapshot, SpeedSetting } from '@/core/types'

export type TabId = 'office' | 'market' | 'projects' | 'staff'

export const useGameStore = defineStore('game', () => {
  const saving = createPlaytestSync((next) => {
    game = next
    game.setSpeed(0)
    acc = 0
    sync()
  })
  let game = saving.initial ?? newGame()
  game.setSpeed(0)
  const snapshot = ref<GameSnapshot>(structuredClone(game.getSnapshot()))
  const activeTab = ref<TabId>(pendingScopeProject(snapshot.value) ? 'projects' : 'office')
  let raf = 0
  let acc = 0
  let last = 0

  function sync(): void {
    snapshot.value = structuredClone(game.getSnapshot())
    if (pendingScopeProject(snapshot.value)) activeTab.value = 'projects'
  }

  function commit(): void {
    sync()
    saving.capture(game, game.drainEvents())
  }

  function play<T>(action: (current: Game) => T): T {
    const result = action(game)
    commit()
    return result
  }

  function startLoop(): void {
    stopLoop()
    last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(now - last, 200)
      last = now
      const speed = snapshot.value.speed
      if (speed > 0 && !snapshot.value.gameOver) {
        acc += dt * speed
        let ticked = false
        while (acc >= BALANCE.MS_PER_TICK_1X && game.state.speed > 0) {
          acc -= BALANCE.MS_PER_TICK_1X
          game.tick()
          ticked = true
        }
        if (ticked) commit()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  }

  function stopLoop(): void {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function setSpeed(speed: SpeedSetting): void {
    acc = 0
    play((current) => current.setSpeed(speed))
  }

  function advance(period: 'day' | 'week'): void {
    acc = 0
    play((current) => current.advance(period))
  }

  function acceptOffer(id: string, employeeId: string, technology: string): void {
    if (play((current) => current.acceptOffer(id, employeeId, technology))) activeTab.value = 'projects'
  }

  function dismissResult(): void { play((current) => current.dismissResult()) }

  function restart(): void {
    game = newGame()
    acc = 0
    activeTab.value = 'office'
    sync()
    saving.capture(game, [{ action: 'reset', result: 'started', tick: 0, day: 1, week: 1 }], true)
  }

  const pendingScopeId = computed(() => pendingScopeProject(snapshot.value)?.id)
  const activeProjects = computed(() => snapshot.value.projects.filter(isActive))
  const freeEmployees = computed(() => snapshot.value.employees.filter((employee) => freeForActivity(employee, snapshot.value.weekIndex)))
  const contractCandidates = computed(() => snapshot.value.employees.filter((employee) => freeForContract(employee, snapshot.value.weekIndex)))
  const stage = computed(() => companyCapacity(snapshot.value))
  const products = computed(() => productDomains(snapshot.value.projects))

  return {
    snapshot, activeTab, activeProjects, pendingScopeId, freeEmployees, contractCandidates, stage, products,
    saveStatus: saving.status, saveReady: saving.ready, saveRevision: saving.revision,
    savedAt: saving.savedAt, storageAvailable: saving.storageAvailable, hasOriginal: saving.hasOriginal,
    hasDraft: saving.hasDraft, serverConflict: saving.latest, recoveryBackups: saving.backups,
    startLoop, stopLoop, setSpeed, advance, acceptOffer, dismissResult, restart, play,
    connectSave: saving.connect, persist: saving.persistLocal, useServerSave: saving.useServer, downloadSave: saving.download,
    migrateSave: () => saving.migrate(game), restoreLocalSave: () => saving.restoreLocal(game),
  }
})
