<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { Project } from '@/core/types'

const store = useGameStore()
const s = computed(() => store.snapshot)
const player = computed(() => s.value.employees.find((e) => e.isPlayer))

const active = computed(() =>
  s.value.projects.filter((p) => !['done', 'failed'].includes(p.state)),
)
const history = computed(() =>
  s.value.projects.filter((p) => ['done', 'failed'].includes(p.state)).slice(-5).reverse(),
)

const stateLabel: Record<string, string> = {
  contracted: '대기',
  inDev: '개발',
  inTest: '테스트',
  deploying: '배포',
  done: '완료',
  failed: '실패',
}

function toggleAssign(project: Project): void {
  if (!player.value) return
  if (player.value.assignedProjectId === project.id) {
    store.assignToProject(player.value.id, null)
  } else {
    store.assignToProject(player.value.id, project.id)
  }
}

function isAssigned(project: Project): boolean {
  return player.value?.assignedProjectId === project.id
}
</script>

<template>
  <section class="projects">
    <h2>진행 프로젝트</h2>

    <p v-if="!active.length" class="muted empty">진행 중인 프로젝트가 없습니다. 시장에서 수주하세요.</p>

    <article v-for="p in active" :key="p.id" class="card panel">
      <div class="top">
        <h3>{{ p.title }}</h3>
        <span class="tag">{{ stateLabel[p.state] }}</span>
      </div>
      <p class="muted">{{ p.client }} · 버그 {{ p.bugs.toFixed(1) }}/{{ p.bugTolerance }} · {{ p.elapsedTicks }}/{{ p.durationTicks }}틱</p>
      <div class="progress"><span :style="{ width: `${Math.min(100, p.progress)}%` }" /></div>

      <div class="modes">
        <button
          class="btn ghost"
          type="button"
          :class="{ on: p.mode === 'normal' }"
          @click="store.setMode(p.id, 'normal')"
        >
          정상
        </button>
        <button
          class="btn ghost"
          type="button"
          :class="{ on: p.mode === 'speed' }"
          @click="store.setMode(p.id, 'speed')"
        >
          스피드
        </button>
      </div>

      <button class="btn" type="button" @click="toggleAssign(p)">
        {{ isAssigned(p) ? '배치 해제' : '나 배치하기' }}
      </button>
    </article>

    <h2 v-if="history.length" class="sub">최근 완료</h2>
    <article v-for="p in history" :key="p.id" class="card panel dim">
      <div class="top">
        <h3>{{ p.title }}</h3>
        <span class="tag" :class="{ danger: p.result === 'fail' }">{{ stateLabel[p.state] }}</span>
      </div>
      <p class="muted">잔금 ₩{{ p.payout.toLocaleString() }}</p>
    </article>
  </section>
</template>

<style scoped>
.projects {
  display: grid;
  gap: 12px;
}

h2,
h3 {
  margin: 0;
}

.sub {
  margin-top: 8px;
  font-size: 16px;
}

.empty {
  padding: 12px;
}

.card {
  display: grid;
  gap: 10px;
}

.card.dim {
  opacity: 0.75;
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: start;
}

.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.modes .on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
</style>
