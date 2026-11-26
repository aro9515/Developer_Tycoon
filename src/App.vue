<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import HudBar from '@/components/HudBar.vue'
import TabBar from '@/components/TabBar.vue'
import OfficeView from '@/components/OfficeView.vue'
import MarketPanel from '@/components/MarketPanel.vue'
import ProjectPanel from '@/components/ProjectPanel.vue'
import StaffPanel from '@/components/StaffPanel.vue'
import ResultModal from '@/components/ResultModal.vue'
import GameOverModal from '@/components/GameOverModal.vue'
import SaveStatus from '@/components/SaveStatus.vue'

const store = useGameStore()

onMounted(() => {
  void store.connectSave()
  store.startLoop()
  window.addEventListener('online', store.connectSave)
  window.addEventListener('pagehide', store.persist)
})
onUnmounted(() => {
  store.stopLoop()
  window.removeEventListener('online', store.connectSave)
  window.removeEventListener('pagehide', store.persist)
})
</script>

<template>
  <div class="app-shell">
    <SaveStatus />
    <template v-if="store.saveReady">
      <HudBar />
      <TabBar />
      <main class="main" :key="store.activeTab">
        <OfficeView v-if="store.activeTab === 'office'" />
        <MarketPanel v-else-if="store.activeTab === 'market'" />
        <ProjectPanel v-else-if="store.activeTab === 'projects'" />
        <StaffPanel v-else />
      </main>
      <ResultModal v-if="!store.pendingScopeId" />
      <GameOverModal />
    </template>
  </div>
</template>
