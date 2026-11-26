<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { WEEKS_PER_MONTH, WEEKS_PER_YEAR } from '@/data/rules'

const store = useGameStore()
const s = computed(() => store.snapshot)
const week = computed(() => (s.value.weekIndex - 1) % WEEKS_PER_MONTH + 1)
const month = computed(() => Math.floor((s.value.weekIndex - 1) / WEEKS_PER_MONTH) % 12 + 1)
const year = computed(() => Math.floor((s.value.weekIndex - 1) / WEEKS_PER_YEAR) + 1)
</script>

<template>
  <header class="hud">
    <div class="split">
      <div>
        <p class="brand">Developer Tycoon</p>
        <strong>{{ year }}년 {{ month }}월 {{ week }}주 · {{ s.dayOfWeek }}일</strong>
      </div>
      <strong class="cash">₩{{ s.company.cash.toLocaleString() }}</strong>
    </div>
    <div class="controls">
      <span>신뢰 <b>{{ s.company.trust }}</b></span>
      <span>기술부채 <b>{{ Math.floor(s.company.dp) }} DP</b></span>
      <span>Heat <b>{{ Math.floor(s.company.heat) }}</b></span>
      <span>연구 <b>{{ s.company.research }}</b></span>
    </div>
    <div class="controls">
      <button class="btn ghost compact" type="button"  :disabled="Boolean(store.pendingScopeId)" @click="store.advance('day')">하루 진행</button>
      <button class="btn ghost compact" type="button"  :disabled="Boolean(store.pendingScopeId)" @click="store.advance('week')">다음 주</button>
      <button class="btn ghost compact" type="button"  :disabled="Boolean(store.pendingScopeId)" @click="store.setSpeed(s.speed ? 0 : 2)">{{ s.speed ? '일시정지' : '자동 진행 ×2' }}</button>
    </div>
  </header>
</template>
