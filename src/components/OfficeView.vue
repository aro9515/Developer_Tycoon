<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const s = computed(() => store.snapshot)
const player = computed(() => s.value.employees.find((e) => e.isPlayer))
const active = computed(() => store.activeProjects)
</script>

<template>
  <section class="office">
    <div class="hero panel">
      <p class="eyebrow">{{ s.company.name }}</p>
      <h1>작은 책상 하나에서 시작</h1>
      <p class="muted">
        의뢰를 받고, 나를 배치하고, 시간이 흐르면 돈이 들어옵니다.
      </p>
    </div>

    <div class="room panel">
      <div class="desk">
        <div class="monitor" />
        <div class="person">{{ player?.name ?? '나' }}</div>
        <p class="muted">
          {{
            player?.assignedProjectId
              ? '코딩 중…'
              : active.length
                ? '배치 대기'
                : '한가함'
          }}
        </p>
      </div>
      <div class="stats">
        <div>
          <strong>{{ active.length }}</strong>
          <span class="muted">진행 중</span>
        </div>
        <div>
          <strong>{{ s.market.length }}</strong>
          <span class="muted">시장 의뢰</span>
        </div>
        <div>
          <strong>{{ Math.floor(s.company.dp) }}</strong>
          <span class="muted">기술부채</span>
        </div>
      </div>
    </div>

    <div v-if="s.tutorialStep < 3" class="hint panel">
      <strong>튜토리얼</strong>
      <p v-if="s.tutorialStep === 0" class="muted">1) 시장에서 첫 외주를 수락하세요.</p>
      <p v-else-if="s.tutorialStep === 1" class="muted">2) 프로젝트에 나를 배치하세요.</p>
      <p v-else class="muted">3) 완료될 때까지 배속으로 기다려 보세요.</p>
    </div>
  </section>
</template>

<style scoped>
.office {
  display: grid;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  line-height: 1.25;
}

.room {
  min-height: 220px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent 40%),
    repeating-linear-gradient(
      90deg,
      #f3f7fb 0 18px,
      #eaf1f7 18px 36px
    );
}

.desk {
  margin: 24px auto 16px;
  width: 180px;
  text-align: center;
}

.monitor {
  height: 72px;
  border-radius: 10px 10px 4px 4px;
  background: linear-gradient(180deg, #243246, #1a2332);
  box-shadow: inset 0 0 0 3px #4b5b70;
  margin-bottom: 10px;
}

.person {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #ffe8c7;
  border: 3px solid #e0b57a;
  font-weight: 800;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}

.stats strong {
  display: block;
  font-size: 20px;
}

.hint strong {
  display: block;
  margin-bottom: 4px;
}
</style>
