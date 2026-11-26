<script setup lang="ts">
import { useGameStore, type TabId } from '@/stores/gameStore'
const store = useGameStore()
const tabs: { id: TabId; label: string }[] = [
  { id: 'office', label: '사무실' }, { id: 'market', label: '의뢰' },
  { id: 'projects', label: '프로젝트' }, { id: 'staff', label: '직원' },
]
</script>

<template>
  <nav class="tabs" aria-label="게임 메뉴">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :aria-current="store.activeTab === tab.id ? 'page' : undefined"
      @click="store.activeTab = tab.id"
    >{{ tab.label }}</button>
  </nav>
</template>
