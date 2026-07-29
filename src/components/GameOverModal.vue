<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const show = computed(() => store.snapshot.gameOver)
</script>

<template>
  <div v-if="show" class="overlay">
    <div class="modal panel">
      <h2>파산</h2>
      <p class="muted">자금이 바닥났습니다. 다시 시작해 보세요.</p>
      <button class="btn" type="button" @click="store.restart()">새 게임</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(16, 24, 36, 0.55);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 50;
}

.modal {
  width: min(360px, 100%);
  display: grid;
  gap: 10px;
  text-align: center;
}

h2 {
  margin: 0;
  color: var(--danger);
}
</style>
