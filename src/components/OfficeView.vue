<script setup lang="ts">
import { computed, ref } from 'vue'
import { freeForContract } from '@/core/Game'
import { useGameStore } from '@/stores/gameStore'
import SalesPanel from '@/components/SalesPanel.vue'
import EnterprisePanel from '@/components/EnterprisePanel.vue'
import GrowthPanel from '@/components/GrowthPanel.vue'
import { ITEMS, ROLES, SHOP, techName } from '@/data/rules'
import type { Employee } from '@/core/types'

const store = useGameStore()
const s = computed(() => store.snapshot)
const confirmReset = ref(false)

function activityLabel(employee: Employee): string {
  const support = s.value.enterprise.support
  if (support.week === s.value.weekIndex && support.employeeIds.includes(employee.id)) return '솔루션 고객 지원'
  if (employee.assignedProjectId) return s.value.projects.find((p) => p.id === employee.assignedProjectId)?.title ?? '계약 수행'
  const activity = employee.activity
  if (activity?.kind === 'repair') return '유지보수'
  if (activity) return techName(activity.target) + (activity.kind === 'pilot' ? ' 파일럿' : ' 교육')
  if (employee.workedWeek !== s.value.weekIndex) return '배정 가능'
  return freeForContract(employee, s.value.weekIndex) ? '다른 의뢰 배정 가능' : '이번 주 작업 종료'
}
</script>

<template>
  <section class="stack">
    <div class="split">
      <div>
        <p class="muted">{{ store.stage.name }}</p>
        <h1>{{ s.company.name }}</h1>
      </div>
      <p class="muted">직원 {{ s.employees.length }}/{{ store.stage.hires }} · 계약 {{ store.activeProjects.length }}/{{ s.company.projectSlots }}</p>
    </div>

    <p v-if="s.tutorialStep === 0" class="notice">
      의뢰 탭에서 첫 외주 담당자를 정하고 수락하세요. 1주 진행을 누르면 다음 주 시작까지 진행합니다. 결정이 필요한 고객 요청이 오면 그 시점에 멈춥니다.
    </p>
    <div class="panel stack">
      <div class="split">
        <h2>이번 주 계획</h2>
        <span class="muted">의뢰 배정 가능 {{ store.contractCandidates.length }}명 · 교육 가능 {{ store.freeEmployees.length }}명</span>
      </div>
      <p v-for="e in s.employees" :key="e.id" class="split">
        <span><b>{{ e.name }}</b> · {{ ROLES[e.role] }}</span>
        <span class="muted">{{ activityLabel(e) }}</span>
      </p>
    </div>

    <SalesPanel />
    <GrowthPanel />

    <div class="panel stack" aria-label="운영 기록">
      <h2>운영 기록</h2>
      <ol class="event-list">
        <li v-for="event in s.toasts" :key="event.id">{{ event.text }}</li>
      </ol>
    </div>

    <div class="panel stack">
      <h2>복지·교육 상점</h2>
      <div v-for="item in ITEMS" :key="item" class="split shop-item">
        <div><b>{{ SHOP[item].label }}</b><p class="muted">{{ SHOP[item].effect }} · 보유 {{ s.company.inventory[item] }}</p></div>
        <button class="btn ghost compact" type="button" :disabled="(item === 'voucher' && !s.company.shopStock.voucher) || s.company.cash < SHOP[item].price"
          @click="store.play(game => game.buyItem(item))">
          {{ item === 'voucher' && !s.company.shopStock.voucher ? '품절' : '구매 ₩' + SHOP[item].price }}
        </button>
      </div>
      <p class="muted">구매한 아이템은 직원 탭에서 사용합니다.</p>
    </div>

    <EnterprisePanel />

    <div class="controls">
      <button v-if="!confirmReset" type="button" class="btn ghost compact" @click="confirmReset = true">새 게임</button>
      <template v-else>
        <span class="muted">이 브라우저의 진행 상황을 초기화합니다.</span>
        <button type="button" class="btn danger compact" @click="store.restart(); confirmReset = false">초기화</button>
        <button type="button" class="btn ghost compact" @click="confirmReset = false">취소</button>
      </template>
    </div>
  </section>
</template>
