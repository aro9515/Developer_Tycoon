<script setup lang="ts">
import { useGameStore, type TabId } from '@/stores/gameStore'

const store = useGameStore()

const tabs: { id: TabId; label: string }[] = [
  { id: 'office', label: '사무실' },
  { id: 'market', label: '시장' },
  { id: 'projects', label: '프로젝트' },
  { id: 'staff', label: '직원' },
]
</script>

<template>
  <nav class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="{ active: store.activeTab === tab.id }"
      @click="store.activeTab = tab.id"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid var(--line);
  z-index: 15;
}

button {
  min-height: 52px;
  border-radius: 14px;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
}

button.active {
  background: var(--accent-soft);
  color: var(--accent);
}
</style>
