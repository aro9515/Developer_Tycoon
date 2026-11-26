<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { BALANCE } from '@/data/balance'
import { CLIENT_STYLES, DOMAINS, SKILLS, techName } from '@/data/rules'
import { longPayments } from '@/core/longContracts'
import {
  effectiveOffer, isOfferNegotiationGoal, isOfferNegotiationPending, offerNegotiationOdds, OFFER_NEGOTIATION_GOALS,
  originalOfferTerms, proposedOfferTerms, type OfferNegotiationGoal, type OfferNegotiationTerms,
} from '@/core/offerNegotiation'
import { employeeMatch } from '@/core/project'
import type { MarketOffer } from '@/core/types'

const store = useGameStore()
const sourceLabels: Record<string, string> = { monthly: '월초 기본 의뢰', promotion: '홍보 신규 의뢰', followup: '기존 고객 후속 의뢰' }
const outcomeLabels = { success: '고객이 조정안을 제안했습니다.', fail: '협상 결렬 · 고객이 원안을 유지합니다.', critical: '대실패 · 고객이 더 불리한 조건을 역제안했습니다.' }
const decisionLabels = { pending: '', accepted: '협상안 선택됨 · 아래에서 계약을 수락하세요.', rejected: '협상안 거절 · 원안으로 수락할 수 있습니다.', original: '' }
const customerTrust = (offer: MarketOffer) => store.snapshot.customers.find((customer) => customer.id === offer.customerId)?.trust
const choice = ref<Record<string, { employee?: string; tech?: string; negotiator?: string; goal?: OfferNegotiationGoal }>>({})
function selection(offer: MarketOffer) {
  return choice.value[offer.id] ??= {}
}

function assignee(offer: MarketOffer): string {
  const id = selection(offer).employee
  return store.contractCandidates.find((employee) => employee.id === id)?.id ?? store.contractCandidates[0]?.id ?? ''
}

function negotiator(offer: MarketOffer) {
  const id = selection(offer).negotiator ?? assignee(offer)
  return store.contractCandidates.find((employee) => employee.id === id) ?? store.contractCandidates[0]
}

function selectedTech(offer: MarketOffer): string {
  const negotiation = offer.offerNegotiation
  if (negotiation?.decision === 'pending' || negotiation?.decision === 'accepted') return negotiation.technology
  const alternative = selection(offer).tech
  return alternative && offer.alternatives.includes(alternative) && store.snapshot.company.validated.includes(alternative)
    ? alternative : offer.technology
}

function match(offer: MarketOffer): string {
  const employee = store.contractCandidates.find((member) => member.id === assignee(offer))
  return employee ? Math.round(employeeMatch(employee, { ...effectiveOffer(offer), technology: selectedTech(offer) }) * 100) + '%' : '—'
}

function goal(offer: MarketOffer): OfferNegotiationGoal {
  return selection(offer).goal ?? 'schedule'
}

function changeGoal(offer: MarketOffer, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (isOfferNegotiationGoal(value)) selection(offer).goal = value
}

function odds(offer: MarketOffer) {
  const employee = negotiator(offer)
  return employee ? offerNegotiationOdds(offer, employee, store.snapshot.company.trust, goal(offer), selectedTech(offer)) : null
}

function negotiate(offer: MarketOffer): void {
  const employee = negotiator(offer)
  if (employee) store.play((game) => game.negotiateOffer(offer.id, employee.id, goal(offer), selectedTech(offer)))
}

function displayedDeadline(offer: MarketOffer, ticks: number, technology: string): string {
  if (offer.longContract) return '12주'
  const pilot = technology === offer.technology ? 0 : BALANCE.TICKS_PER_DAY
  return Math.ceil((ticks + pilot) / BALANCE.TICKS_PER_DAY) + '일'
}

function workload(offer: MarketOffer, terms: OfferNegotiationTerms): string {
  return offer.longContract
    ? '약 ' + Math.ceil(offer.longContract.workDays * terms.workMultiplier) + '인일'
    : Math.round(terms.workMultiplier * 100) + '%'
}

function compareTerms(offer: MarketOffer) {
  const negotiation = offer.offerNegotiation
  return [
    { label: '원안', terms: originalOfferTerms(offer) },
    { label: negotiation?.outcome === 'critical' ? '고객 역제안' : negotiation ? '협상안' : '성공 시 제안', terms: negotiation?.proposal ?? proposedOfferTerms(offer, goal(offer)) },
  ]
}

function advance(offer: MarketOffer): number {
  const budget = effectiveOffer(offer).budget
  return offer.longContract ? longPayments(budget).advance : Math.round(budget * BALANCE.ADVANCE_RATIO)
}
</script>

<template>
  <section class="stack">
    <div class="split">
      <h1>이달의 의뢰</h1>
      <span class="muted">계약 {{ store.activeProjects.length }}/{{ store.snapshot.company.projectSlots }}</span>
    </div>
    <p class="muted">미수락 의뢰는 다음 달 1주차에 교체됩니다.</p>
    <p v-if="!store.snapshot.market.length" class="panel muted">이달의 의뢰를 모두 받았습니다. 다음 달에 새 의뢰가 들어옵니다.</p>
    <p v-else-if="!store.contractCandidates.length" class="notice">이번 주에 바로 맡길 직원이 없습니다.</p>
    <article v-for="offer in store.snapshot.market" :key="offer.id" class="panel stack">
      <div class="split"><h2>{{ offer.title }}</h2><strong>₩{{ effectiveOffer(offer).budget.toLocaleString() }}</strong></div>
      <p class="muted">{{ offer.client }} · {{ CLIENT_STYLES[offer.style].name }} · {{ DOMAINS[offer.domain] }} · 납기 {{ displayedDeadline(offer, effectiveOffer(offer).durationTicks, selectedTech(offer)) }}</p>
      <div class="controls">
        <span v-for="r in effectiveOffer(offer).requirements" :key="r.skill" class="tag">{{ SKILLS[r.skill] }} {{ r.amount }}</span>
        <span class="tag">{{ offer.alternatives.length ? '기술 선택 가능' : '기술 지정' }}</span>
        <span class="tag" :class="{ warn: offer.source && offer.source !== 'monthly' }">{{ sourceLabels[offer.source ?? 'monthly'] ?? '기존 고객 후속 의뢰' }}</span>
        <span v-if="customerTrust(offer) !== undefined" class="tag">고객 신뢰 {{ customerTrust(offer) }}/100</span>
        <span v-if="offer.longContract" class="tag warn">3개월 계약</span>
      </div>
      <p v-if="offer.longContract" class="muted">
        예상 공수 {{ workload(offer, offer.offerNegotiation?.decision === 'accepted' && offer.offerNegotiation.proposal ? offer.offerNegotiation.proposal : originalOfferTerms(offer)) }} · 인원과 숙련도에 따라 달라짐.
        착수 {{ longPayments(effectiveOffer(offer).budget).advance }} / 중간 검수 {{ longPayments(effectiveOffer(offer).budget).middle }} / 최종 납품 기준 {{ longPayments(effectiveOffer(offer).budget).final }}pt
      </p>
      <div class="fields">
        <label>기술
          <select :value="selectedTech(offer)" :disabled="isOfferNegotiationPending(offer) || offer.offerNegotiation?.decision === 'accepted'" @change="selection(offer).tech = ($event.target as HTMLSelectElement).value">
            <option :value="offer.technology">{{ techName(offer.technology) }}</option>
            <option v-for="id in offer.alternatives" :key="id" :value="id" :disabled="!store.snapshot.company.validated.includes(id)">
              {{ techName(id) }}{{ store.snapshot.company.validated.includes(id) ? ' · 첫 실전 검증' : ' · 파일럿 필요' }}
            </option>
          </select>
        </label>
        <label>담당자
          <select :value="assignee(offer)" @change="selection(offer).employee = ($event.target as HTMLSelectElement).value">
            <option v-if="!store.contractCandidates.length" value="">배정 가능 인원 없음</option>
            <option v-for="e in store.contractCandidates" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </label>
      </div>
      <p class="muted">업무 적합도 {{ match(offer) }}</p>
      <details class="negotiation">
        <summary>수주 전 협상{{ isOfferNegotiationPending(offer) ? ' · 결정 대기' : '' }}</summary>
        <div class="stack">
          <template v-if="!offer.offerNegotiation">
            <p class="muted">의뢰당 1회입니다. 협상 후 조건을 확인하고 계약을 따로 수락하세요.</p>
            <div class="fields">
              <label>협상 담당자
                <select :value="negotiator(offer)?.id" @change="selection(offer).negotiator = ($event.target as HTMLSelectElement).value">
                  <option v-if="!store.contractCandidates.length" value="">협상 가능 인원 없음</option>
                  <option v-for="employee in store.contractCandidates" :key="employee.id" :value="employee.id">{{ employee.name }}</option>
                </select>
              </label>
              <label>제안 방향
                <select :value="goal(offer)" @change="changeGoal(offer, $event)">
                  <option v-for="(label, value) in OFFER_NEGOTIATION_GOALS" :key="value" :value="value">{{ label }}</option>
                </select>
              </label>
            </div>
            <p v-if="odds(offer)" class="muted">
              {{ SKILLS[odds(offer)!.skill] }} 기준 · 성공 {{ odds(offer)!.success }}% · 실패 {{ odds(offer)!.fail }}% · 대실패 {{ odds(offer)!.critical }}%
            </p>
          </template>
          <div v-else class="notice" role="status">
            <p>{{ outcomeLabels[offer.offerNegotiation.outcome] }}</p>
            <p v-if="decisionLabels[offer.offerNegotiation.decision]">{{ decisionLabels[offer.offerNegotiation.decision] }}</p>
          </div>
          <div v-if="!offer.offerNegotiation || offer.offerNegotiation.proposal" class="term-columns">
            <div v-for="item in compareTerms(offer)" :key="item.label" class="notice">
              <strong>{{ item.label }}</strong>
              <p>단가 ₩{{ item.terms.budget.toLocaleString() }}</p>
              <p>납기 {{ displayedDeadline(offer, item.terms.durationTicks, offer.offerNegotiation?.technology ?? selectedTech(offer)) }}</p>
              <p>{{ item.terms.scope }}</p>
              <p v-for="requirement in item.terms.requirements" :key="requirement.skill" class="muted">{{ SKILLS[requirement.skill] }} {{ requirement.amount }}</p>
              <p>예상 공수 {{ workload(offer, item.terms) }}</p>
              <p>기술부채 위험 {{ Math.round(item.terms.debtMultiplier * 100) }}%</p>
            </div>
          </div>
          <p v-if="offer.offerNegotiation?.outcome === 'success' && offer.offerNegotiation.decision !== 'rejected'" class="muted">
            조정안으로 수주하면 협상 담당자가 노하우와 직위 XP를 얻습니다. 성공적으로 납품하면 {{ SKILLS[offer.offerNegotiation.skill] }} 능력치도 오릅니다.
          </p>
          <button v-if="!offer.offerNegotiation" class="btn ghost" type="button" :disabled="!negotiator(offer)"
            @click="negotiate(offer)">협상 제안 보내기</button>
          <div v-else-if="isOfferNegotiationPending(offer)" class="controls">
            <button type="button" class="btn compact" @click="store.play(game => game.resolveOfferNegotiation(offer.id, true))">협상안 선택</button>
            <button type="button" class="btn ghost compact" @click="store.play(game => game.resolveOfferNegotiation(offer.id, false))">거절하고 원안 유지</button>
          </div>
        </div>
      </details>
      <button class="btn" type="button" :disabled="!assignee(offer) || isOfferNegotiationPending(offer) || store.activeProjects.length >= store.snapshot.company.projectSlots"
        @click="store.acceptOffer(offer.id, assignee(offer), selectedTech(offer))">
        수락 · 착수금 ₩{{ advance(offer).toLocaleString() }}
      </button>
    </article>
  </section>
</template>

<style scoped>
.term-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.term-columns .notice {
  min-width: 0;
  overflow-wrap: anywhere;
}
.negotiation > .stack {
  padding-top: 0.5rem;
}
</style>
