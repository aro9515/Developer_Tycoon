import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { BALANCE, type WorkMode } from '@/data/balance'
import { Game } from '@/core/Game'
import { clearSave, loadFromLocal, newGame, saveToLocal } from '@/core/save'
import type { GameSnapshot, SpeedSetting } from '@/core/types'

export type TabId = 'office' | 'market' | 'projects' | 'staff'

export const useGameStore = defineStore('game', () => {
  const game = shallowRef<Game>(loadFromLocal() ?? newGame())
  const snapshot = ref<GameSnapshot>(structuredClone(game.value.getSnapshot()))
  const activeTab = ref<TabId>('market')
  let raf = 0
  let acc = 0
  let last = 0
  let saveAcc = 0

  function sync(): void {
    snapshot.value = structuredClone(game.value.getSnapshot())
  }

  function persist(): void {
    saveToLocal(game.value)
  }

  function dispatchSync(fn: () => void): void {
    fn()
    sync()
    persist()
  }

  function startLoop(): void {
    stopLoop()
    last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      const speed = snapshot.value.speed
      if (speed > 0 && !snapshot.value.gameOver) {
        acc += dt * speed
        const step = BALANCE.MS_PER_TICK_1X
        while (acc >= step) {
          acc -= step
          game.value.tick()
        }
        sync()
        saveAcc += dt
        if (saveAcc > 15000) {
          saveAcc = 0
          persist()
        }
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
    dispatchSync(() => game.value.setSpeed(speed))
  }

  function acceptOffer(id: string): void {
    dispatchSync(() => {
      if (game.value.acceptOffer(id)) activeTab.value = 'projects'
    })
  }

  function assignToProject(employeeId: string, projectId: string | null): void {
    dispatchSync(() => game.value.assignEmployee(employeeId, projectId))
  }

  function setMode(projectId: string, mode: WorkMode): void {
    dispatchSync(() => game.value.setProjectMode(projectId, mode))
  }

  function dismissResult(): void {
    dispatchSync(() => game.value.dismissResult())
  }

  function restart(): void {
    clearSave()
    game.value = newGame()
    sync()
    activeTab.value = 'market'
  }

  const cash = computed(() => snapshot.value.company.cash)
  const activeProjects = computed(() =>
    snapshot.value.projects.filter((p) => !['done', 'failed'].includes(p.state)),
  )

  return {
    snapshot,
    activeTab,
    cash,
    activeProjects,
    startLoop,
    stopLoop,
    setSpeed,
    acceptOffer,
    assignToProject,
    setMode,
    dismissResult,
    restart,
    persist,
    sync,
  }
})
