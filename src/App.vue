<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import HudBar from '@/components/HudBar.vue'
import TabBar from '@/components/TabBar.vue'
import OfficeView from '@/components/OfficeView.vue'
import MarketPanel from '@/components/MarketPanel.vue'
import ProjectPanel from '@/components/ProjectPanel.vue'
import StaffPanel from '@/components/StaffPanel.vue'
import ResultModal from '@/components/ResultModal.vue'
import GameOverModal from '@/components/GameOverModal.vue'

const store = useGameStore()

const view = computed(() => store.activeTab)

onMounted(() => store.startLoop())
onUnmounted(() => store.stopLoop())
</script>

<template>
  <div class="app-shell">
    <HudBar />
    <main class="main">
      <OfficeView v-if="view === 'office'" />
      <MarketPanel v-else-if="view === 'market'" />
      <ProjectPanel v-else-if="view === 'projects'" />
      <StaffPanel v-else />
    </main>
    <div v-if="store.snapshot.toasts.length" class="toasts">
      <div v-for="t in store.snapshot.toasts.slice(0, 2)" :key="t.id" class="toast">
        {{ t.text }}
      </div>
    </div>
    <TabBar />
    <ResultModal />
    <GameOverModal />
  </div>
</template>

<style scoped>
.main {
  flex: 1;
  overflow: auto;
  padding: 12px 12px 88px;
}

.toasts {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 84px;
  display: grid;
  gap: 8px;
  pointer-events: none;
  z-index: 20;
}

.toast {
  background: rgba(26, 35, 50, 0.92);
  color: #fff;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  box-shadow: var(--shadow);
}
</style>
