<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { SpeedSetting } from '@/core/types'

const store = useGameStore()
const s = computed(() => store.snapshot)
const dayNames = ['', '월', '화', '수', '목', '금', '토', '일']

function cycleSpeed(): void {
  const cur = s.value.speed
  const next = (cur === 0 ? 1 : cur === 1 ? 2 : 0) as SpeedSetting
  store.setSpeed(next)
}

const speedLabel = computed(() => {
  if (s.value.speed === 0) return '⏸'
  if (s.value.speed === 2) return '▶▶'
  return '▶'
})
</script>

<template>
  <header class="hud">
    <div class="row">
      <button class="speed" type="button" @click="cycleSpeed">{{ speedLabel }}</button>
      <div class="date">
        <strong>{{ s.weekIndex }}주차 {{ dayNames[s.dayOfWeek] }}</strong>
        <span class="muted">Day {{ s.dayIndex }}</span>
      </div>
      <div class="money">₩{{ s.company.cash.toLocaleString() }}</div>
    </div>
    <div class="meters">
      <div class="meter">
        <span>신뢰 {{ s.company.trust }}</span>
      </div>
      <div class="meter" :class="{ hot: s.company.heat >= 60 }">
        <span>부채 {{ Math.floor(s.company.dp) }}</span>
        <span class="heat">열 {{ Math.floor(s.company.heat) }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hud {
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.speed {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  font-size: 16px;
}

.date {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.money {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: 18px;
}

.meters {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.meter {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--bg);
  font-size: 12px;
  font-weight: 700;
}

.meter.hot {
  background: var(--danger-soft);
  color: var(--danger);
}

.heat {
  color: var(--warn);
}
</style>
