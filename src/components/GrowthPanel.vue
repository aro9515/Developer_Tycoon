<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  canRaiseInvestment, ENDING_MARKETS, ENDING_QUARTERS, GROWTH_PATHS, GROWTH_STAGES, growthEndingReady, growthStage,
  INVESTMENT_AMOUNT, IPO_AMOUNT, monthlyPayroll, OPERATING_LABELS, operatingProfit, operatingRunway, payingMarketCount,
  type GrowthPath, type OperatingCategory,
} from '@/core/growth'
import { enterpriseProgress } from '@/core/enterprise'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const s = computed(() => store.snapshot)
const growth = computed(() => s.value.growth)
const stage = computed(() => growthStage(s.value))
const progress = computed(() => enterpriseProgress(s.value))
const endingReady = computed(() => growthEndingReady(s.value, progress.value))
const markets = computed(() => payingMarketCount(progress.value))
const runway = computed(() => operatingRunway(s.value))
const payroll = computed(() => monthlyPayroll(s.value))
const recentMonths = computed(() => growth.value.months.slice(-3).reverse())
const chosenPath = ref<GrowthPath | null>(null)
const points = (amount: number) => amount.toLocaleString('ko-KR') + 'pt'
const categories = Object.entries(OPERATING_LABELS) as [OperatingCategory, string][]

const nextGoal = computed(() => {
  switch (stage.value.index) {
    case 0: return '첫 외주 의뢰 납품'
    case 1: return '첫 유료 솔루션 고객 확보'
    case 2: return '첫 갱신 및 솔루션 월 순수입으로 급여 충당'
    case 3: return '해외 유료 고객 확보 및 첫 해외 갱신'
    default: return '3개 시장에서 유료 고객 유지 및 4분기 연속 영업 흑자'
  }
})

function confirmEnding() {
  const path = chosenPath.value
  if (path && store.play((game) => game.finishGrowth(path))) chosenPath.value = null
}
</script>

<template>
  <section class="panel stack" aria-labelledby="growth-title">
    <header class="stack">
      <div class="split">
        <h2 id="growth-title">회사 성장</h2>
        <span class="tag">{{ stage.name }}</span>
      </div>
      <p v-if="!growth.ending">{{ nextGoal }}</p>
      <p v-if="stage.index === 2" class="muted">
        갱신 {{ progress.renewals }}건 · 월 제품 순수입 {{ points(progress.monthlyRecurringNet) }} / 월 급여 {{ points(payroll) }}
      </p>
      <p v-if="stage.index === 3" class="muted">해외 유료 고객 {{ progress.overseasCustomers }}곳 · 해외 갱신 {{ progress.overseasRenewals }}건</p>
    </header>

    <details>
      <summary>성장 단계와 엔딩 조건</summary>
      <ol class="growth-steps">
        <li v-for="step in GROWTH_STAGES" :key="step.index" :aria-current="stage.index === step.index ? 'step' : undefined">
          {{ step.name }}
          <span v-if="stage.index === step.index" class="muted">· 현재</span>
        </li>
      </ol>
      <p>유료 고객 유지 {{ markets }}/{{ ENDING_MARKETS }}개 시장 · 영업 흑자 {{ growth.profitableQuarters }}분기 연속 (목표 {{ ENDING_QUARTERS }})</p>
      <p v-if="growth.quarters.length" class="muted">
        최근 분기 영업손익
        {{ growth.quarters.at(-1)?.profit === null ? '기록 부족' : points(growth.quarters.at(-1)?.profit ?? 0) }}
      </p>
    </details>

    <div v-if="growth.ending" class="notice">
      <strong>{{ GROWTH_PATHS[growth.ending.path].label }} 엔딩</strong>
      <p>{{ GROWTH_PATHS[growth.ending.path].ending }}</p>
    </div>
    <div v-else-if="endingReady" class="notice stack" aria-label="엔딩 선택">
      <strong>경영 경로 선택</strong>
      <div class="controls">
        <button v-for="(route, key) in GROWTH_PATHS" :key="key" class="btn ghost compact" type="button"
          :aria-pressed="chosenPath === key" @click="chosenPath = key">{{ route.label }}</button>
      </div>
      <div v-if="chosenPath" class="stack">
        <p>{{ GROWTH_PATHS[chosenPath].ending }}</p>
        <p v-if="chosenPath === 'ipo'" class="muted">운영 손익과 별도로 자본 {{ points(IPO_AMOUNT) }} 조달</p>
        <div class="controls">
          <button class="btn compact" type="button" @click="confirmEnding">{{ GROWTH_PATHS[chosenPath].label }} 확정</button>
          <button class="btn ghost compact" type="button" @click="chosenPath = null">취소</button>
        </div>
      </div>
    </div>

    <details open>
      <summary>{{ growth.current.month }}개월차 운영 결산 <span v-if="!growth.current.complete" class="muted">· 일부 기간</span></summary>
      <dl class="growth-figures">
        <div><dt>운영 수입</dt><dd>{{ points(growth.current.income) }}</dd></div>
        <div><dt>운영 지출</dt><dd>{{ points(growth.current.expenses) }}</dd></div>
        <div><dt>영업손익</dt><dd>{{ points(operatingProfit(growth.current)) }}</dd></div>
        <div><dt>현금 잔액</dt><dd>{{ points(s.company.cash) }}</dd></div>
      </dl>
      <p v-if="growth.current.capital" class="muted">별도 자본 유입 {{ points(growth.current.capital) }}</p>
      <p v-if="runway.weeks === null" class="muted">최근 확정 월은 운영 수입으로 지출을 충당했습니다.</p>
      <p v-else class="muted">
        현재 잔액으로 약 {{ runway.weeks }}주 운영 · {{ runway.basis === 'recent' ? '최근 확정 월 순지출 기준' : '현재 급여·임대료·기본 서버비 기준' }}
      </p>
    </details>

    <details v-if="Object.keys(growth.current.categories).length || recentMonths.length">
      <summary>항목별 내역과 지난 결산</summary>
      <dl v-if="Object.keys(growth.current.categories).length" class="growth-figures">
        <div v-for="[key, label] in categories.filter(([key]) => key in growth.current.categories)" :key="key">
          <dt>{{ label }}</dt>
          <dd>{{ points(growth.current.categories[key] ?? 0) }}</dd>
        </div>
      </dl>
      <ul v-if="recentMonths.length" class="growth-months">
        <li v-for="month in recentMonths" :key="month.month">
          <strong>{{ month.month }}개월차<span v-if="!month.complete"> · 일부 기간</span></strong>
          <p>수입 {{ points(month.income) }} · 지출 {{ points(month.expenses) }} · 잔액 {{ points(month.balance ?? 0) }}</p>
          <p v-if="month.capital" class="muted">별도 자본 {{ points(month.capital) }}</p>
        </li>
      </ul>
    </details>

    <details v-if="canRaiseInvestment(s) || growth.investmentMonth !== null">
      <summary>외부 투자</summary>
      <p v-if="growth.investmentMonth !== null" class="muted">{{ growth.investmentMonth }}개월차에 {{ points(INVESTMENT_AMOUNT) }} 조달</p>
      <template v-else>
        <p class="muted">초기 투자로 운영 자금을 보강할 수 있습니다. 투자금은 영업손익 집계에서 분리됩니다.</p>
        <button type="button" class="btn ghost compact" @click="store.play((game) => game.raiseInvestment())">초기 투자 받기 {{ points(INVESTMENT_AMOUNT) }}</button>
      </template>
    </details>
  </section>
</template>

<style scoped>
.growth-figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 9px 0;
}
.growth-figures dt { color: var(--muted); font-size: .87rem; }
.growth-figures dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.growth-steps, .growth-months { padding-inline-start: 1.25rem; margin: .5rem 0; }
.growth-steps [aria-current="step"] { font-weight: 700; }
.growth-months li + li { margin-top: .4rem; }
</style>
