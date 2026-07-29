<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { MarketOffer } from '@/core/types'
import { calcMatchScore } from '@/core/project'

const store = useGameStore()
const s = computed(() => store.snapshot)
const player = computed(() => s.value.employees.find((e) => e.isPlayer))

function matchLabel(offer: MarketOffer): string {
  if (!player.value) return '-'
  const m = calcMatchScore(player.value.stats, offer.requirements)
  return `${Math.round(m * 100)}%`
}

function skillName(skill: string): string {
  const map: Record<string, string> = {
    coding: '코딩',
    frontend: 'FE',
    backend: 'BE',
    database: 'DB',
    infra: '인프라',
    ai: 'AI',
    communication: '소통',
  }
  return map[skill] ?? skill
}
</script>

<template>
  <section class="market">
    <div class="head">
      <h2>시장 의뢰</h2>
      <p class="muted">슬롯 {{ store.activeProjects.length }}/{{ s.company.projectSlots }}</p>
    </div>

    <article v-for="offer in s.market" :key="offer.id" class="card panel">
      <div class="top">
        <div>
          <span v-if="offer.forced" class="tag">튜토리얼</span>
          <span class="tag warn">난이도 {{ offer.difficulty }}</span>
        </div>
        <strong>₩{{ offer.budget.toLocaleString() }}</strong>
      </div>
      <h3>{{ offer.title }}</h3>
      <p class="muted">고객 {{ offer.client }} · {{ offer.durationTicks }}틱 · 매칭 {{ matchLabel(offer) }}</p>
      <div class="reqs">
        <span v-for="r in offer.requirements" :key="r.skill" class="tag">
          {{ skillName(r.skill) }} {{ r.amount }}
        </span>
      </div>
      <button
        class="btn"
        type="button"
        :disabled="store.activeProjects.length >= s.company.projectSlots"
        @click="store.acceptOffer(offer.id)"
      >
        수락 (착수금 30%)
      </button>
    </article>
  </section>
</template>

<style scoped>
.market {
  display: grid;
  gap: 12px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: end;
}

h2,
h3 {
  margin: 0;
}

.card {
  display: grid;
  gap: 8px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.top > div {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.reqs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
