<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const s = computed(() => store.snapshot)

function projectTitle(id: string | null): string {
  if (!id) return '대기 중'
  return s.value.projects.find((p) => p.id === id)?.title ?? '배치됨'
}
</script>

<template>
  <section class="staff">
    <h2>직원</h2>
    <article v-for="e in s.employees" :key="e.id" class="card panel">
      <div class="top">
        <div>
          <h3>{{ e.name }} <span v-if="e.isPlayer" class="tag">플레이어</span></h3>
          <p class="muted">{{ projectTitle(e.assignedProjectId) }}</p>
        </div>
        <div class="avatar">{{ e.name.slice(0, 1) }}</div>
      </div>

      <div class="bars">
        <div>
          <span class="muted">체력 {{ e.stamina }}</span>
          <div class="progress"><span :style="{ width: `${e.stamina}%` }" /></div>
        </div>
        <div>
          <span class="muted">스트레스 {{ e.stress }}</span>
          <div class="progress stress"><span :style="{ width: `${e.stress}%` }" /></div>
        </div>
      </div>

      <div class="stats">
        <span>코딩 {{ e.stats.coding }}</span>
        <span>FE {{ e.stats.frontend }}</span>
        <span>BE {{ e.stats.backend }}</span>
        <span>DB {{ e.stats.database }}</span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.staff {
  display: grid;
  gap: 12px;
}

h2,
h3 {
  margin: 0;
}

.card {
  display: grid;
  gap: 12px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #ffe8c7;
  border: 2px solid #e0b57a;
  font-weight: 800;
}

.bars {
  display: grid;
  gap: 8px;
}

.progress.stress > span {
  background: linear-gradient(90deg, #f0a202, #b42318);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
</style>
