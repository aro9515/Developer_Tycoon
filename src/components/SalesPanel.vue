<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { gameMonth } from '@/core/customers'
import { adChannels, customerProfile, quoteOutsourceCampaign, solutionMarkets, type AdChannel } from '@/core/enterprise'
import { BALANCE } from '@/data/balance'
import { SALES_RULES } from '@/data/rules'

const store = useGameStore()
const snapshot = computed(() => store.snapshot)
const selected = ref<AdChannel>('online')
const quote = computed(() => quoteOutsourceCampaign(snapshot.value, selected.value))
const usedThisMonth = computed(() => snapshot.value.sales.startedMonth === gameMonth(snapshot.value.weekIndex))
const pending = computed(() => snapshot.value.sales.campaignDueTick !== null)
const daysUntil = (tick: number) => Math.max(0, Math.ceil((tick - snapshot.value.tick) / BALANCE.TICKS_PER_DAY))
const resultLabels = { great: '대성공', success: '성공', ok: '보통', fail: '실패' } as const
const marketName = (id: string) => solutionMarkets[customerProfile(snapshot.value, id).market].label
</script>

<template>
  <section class="panel stack" aria-label="영업과 고객">
    <div class="split">
      <h2>영업·고객</h2><span class="tag">고객 {{ snapshot.customers.length }}곳</span>
    </div>
    <label>외주 홍보 채널
      <select v-model="selected" aria-label="외주 홍보 채널">
        <option v-for="entry in adChannels" :key="entry.id" :value="entry.id" :disabled="!quoteOutsourceCampaign(snapshot, entry.id)">
          {{ entry.label }} {{ entry.cost }}pt{{ quoteOutsourceCampaign(snapshot, entry.id) ? '' : ' · 납품 ' + entry.deliveries + '건 필요' }}
        </option>
      </select>
    </label>
    <p v-if="quote" class="muted">월 1회 · {{ quote.days }}일 뒤 신규 의뢰 1건을 얻을 확률 {{ Math.round(quote.chance * 100) }}%</p>
    <p v-if="pending" role="status">외주 홍보 진행 중 · 약 {{ daysUntil(snapshot.sales.campaignDueTick!) }}일 남음</p>
    <p v-else-if="usedThisMonth" class="muted">이번 달 외주 홍보를 사용했습니다.</p>
    <p v-else-if="quote && snapshot.company.cash < quote.cost" class="muted">홍보비가 부족합니다.</p>
    <button class="btn" type="button" :disabled="pending || usedThisMonth || !quote || snapshot.company.cash < quote.cost || snapshot.gameOver"
      @click="store.play(game => game.startPromotion(selected))">외주 홍보 시작</button>
    <details>
      <summary>고객별 신뢰와 후속 일정</summary>
      <p class="muted">성공 이상 납품과 고객 신뢰 {{ SALES_RULES.followUpTrust }} 이상이면 후속 의뢰가 예약됩니다. 같은 고객의 열린 의뢰가 있으면 그 의뢰를 먼저 처리합니다.</p>
      <article v-for="customer in snapshot.customers" :key="customer.id" class="customer">
        <div class="split"><strong>{{ customer.name }}</strong><span class="tag">신뢰 {{ customer.trust }}/100</span></div>
        <p class="muted">{{ marketName(customer.id) }} · 외주 거래 결과 {{ customer.closedContracts }}건<span v-if="customer.lastResult"> · 최근 {{ resultLabels[customer.lastResult] }}</span></p>
        <p v-if="customer.nextFollowUp" class="muted">{{ daysUntil(customer.nextFollowUp.dueTick) ? '후속 의뢰까지 약 ' + daysUntil(customer.nextFollowUp.dueTick) + '일' : '후속 가능 · 열린 의뢰가 있으면 대기' }}</p>
      </article>
    </details>
  </section>
</template>

<style scoped>
.customer { display: grid; gap: 3px; padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--line); }
</style>
