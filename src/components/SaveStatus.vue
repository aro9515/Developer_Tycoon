<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const confirmingRestore = ref(false)
const summary = computed(() => {
  if (store.saveStatus === 'checking') return '서버 저장 확인 중'
  if (store.saveStatus === 'saving') return '홈서버에 저장 중'
  if (store.saveStatus === 'saved') return '홈서버 저장 완료 · 버전 ' + store.saveRevision
  if (store.saveStatus === 'offline') return '서버에 연결할 수 없음'
  if (store.saveStatus === 'migration') return '이 브라우저의 진행 이전'
  if (store.saveStatus === 'conflict') return '새 서버 저장과 현재 진행이 다릅니다'
  return '홈서버 저장 준비'
})
</script>

<template>
  <section class="save-state" aria-label="저장과 복구">
    <strong role="status">{{ summary }}</strong>
    <template v-if="store.saveStatus === 'migration'">
      <p>서버에 저장이 비어 있습니다. 이 브라우저의 진행을 복사합니다. 브라우저 원본은 보관합니다.</p>
      <button class="btn compact" type="button" @click="store.migrateSave()">이 브라우저 저장 이전</button>
    </template>

    <template v-if="store.saveStatus === 'offline'">
      <p>{{ store.storageAvailable ? '이 탭의 진행은 브라우저에 남습니다. 연결이 돌아오면 저장을 다시 시도할 수 있습니다.' : '브라우저 저장도 사용할 수 없습니다. 이 탭의 진행을 JSON으로 내려받으세요.' }}</p>
      <button class="btn ghost compact" type="button" @click="store.connectSave()">서버 저장 다시 확인</button>
    </template>

    <template v-if="store.saveStatus === 'conflict'">
      <p>다른 탭이나 기기에 저장된 버전 {{ store.serverConflict?.revision }}이 있습니다. 이 탭의 진행은 자동으로 덮어쓰지 않습니다.</p>
      <div class="controls">
        <button v-if="store.serverConflict?.state" class="btn compact" type="button" :disabled="!store.storageAvailable" @click="store.useServerSave(); confirmingRestore = false">이 탭 백업 후 서버 저장 불러오기</button>
        <button class="btn ghost compact" type="button" @click="confirmingRestore = !confirmingRestore">이 탭의 진행으로 복구</button>
      </div>
      <template v-if="confirmingRestore">
        <p>이 탭의 진행을 서버에 저장합니다. 서버의 현재 저장은 별도 복구 파일로 보관합니다.</p>
        <button class="btn danger compact" type="button" @click="store.restoreLocalSave(); confirmingRestore = false">서버 저장 교체 확인</button>
      </template>
    </template>

    <p v-if="!store.storageAvailable && store.saveStatus !== 'offline'" class="muted">브라우저에 임시 저장할 수 없습니다. 저장이 완료될 때까지 탭을 열어 두세요.</p>
    <details v-if="store.hasOriginal || store.hasDraft || store.serverConflict?.state || store.recoveryBackups.length">
      <summary>저장 백업</summary>
      <div class="controls">
        <button v-if="store.hasOriginal" class="btn ghost compact" type="button" @click="store.downloadSave('original')">기존 브라우저 원본 다운로드</button>
        <button v-if="store.hasDraft" class="btn ghost compact" type="button" @click="store.downloadSave('draft')">이 탭의 진행 다운로드</button>
        <button v-if="store.serverConflict?.state" class="btn ghost compact" type="button" @click="store.downloadSave('server')">서버 저장 다운로드</button>
        <button v-for="(item, index) in store.recoveryBackups" :key="item.key" class="btn ghost compact" type="button" @click="store.downloadSave('backup', item.key)">복구 백업 {{ index + 1 }} 다운로드</button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.save-state {
  display: grid;
  gap: 6px;
  padding: 10px 14px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.save-state > button { justify-self: start; }
.save-state p { max-width: 54ch; }
</style>
