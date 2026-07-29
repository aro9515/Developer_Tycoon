<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const result = computed(() => store.snapshot.lastResult)

const label = computed(() => {
  const r = result.value?.result
  if (r === 'great') return '대성공'
  if (r === 'success') return '성공'
  if (r === 'ok') return '보통'
  if (r === 'fail') return '실패'
  return ''
})
</script>

<template>
  <div v-if="result" class="overlay" @click.self="store.dismissResult()">
    <div class="modal panel">
      <p class="eyebrow">프로젝트 결과</p>
      <h2 :class="result.result">{{ label }}</h2>
      <p>{{ result.title }}</p>
      <p class="muted">고객 {{ result.client }}</p>
      <div class="pay">잔금 +₩{{ result.payout.toLocaleString() }}</div>
      <button class="btn" type="button" @click="store.dismissResult()">확인</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(16, 24, 36, 0.45);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 40;
}

.modal {
  width: min(360px, 100%);
  display: grid;
  gap: 8px;
  text-align: center;
}

.eyebrow {
  margin: 0;
  color: var(--accent);
  font-weight: 800;
  font-size: 12px;
}

h2 {
  margin: 0;
  font-size: 32px;
}

h2.great,
h2.success {
  color: var(--ok);
}

h2.ok {
  color: var(--warn);
}

h2.fail {
  color: var(--danger);
}

.pay {
  margin: 8px 0 4px;
  font-size: 22px;
  font-weight: 800;
}
</style>
