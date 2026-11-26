<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { freeForActivity, freeForContract, negotiationOdds, outsourcePrice } from '@/core/Game'
import { canReview, isActive } from '@/core/project'
import { LONG_CONTRACT, longPayments, longReviewReady, waitingForLongReview } from '@/core/longContracts'
import { BALANCE } from '@/data/balance'
import { techName } from '@/data/rules'
import type { Project } from '@/core/types'

const store = useGameStore()
const s = computed(() => store.snapshot)
const history = computed(() => s.value.projects.filter(p => !isActive(p)).slice(-8).reverse())
const repairs = computed(() => s.value.projects.filter(p => !isActive(p) && (p.issue || p.debt >= 1)))
const picks = ref<Record<string, string>>({})
const repairPicks = ref<Record<string, string>>({})
const emergency = ref<Record<string, boolean>>({})
const research = ref<Record<string, boolean>>({})
const cancelId = ref('')
watch(() => store.pendingScopeId, async (id) => {
  if (!id) return
  await nextTick()
  const panel = document.getElementById('scope-' + id)
  panel?.focus({ preventScroll: true })
  panel?.scrollIntoView({ block: 'nearest' })
}, { immediate: true, flush: 'post' })

const stateLabel = { contracted: '계약', inDev: '개발 중', inTest: '테스트', deploying: '배포 준비', done: '완료', failed: '실패', canceled: '취소' }

const trust = (p: Project) => s.value.customers.find((customer) => customer.id === p.customerId)?.trust
const name = (id: string) => s.value.employees.find(e => e.id === id)?.name ?? '미배정'
const days = (ticks: number) => Math.ceil(Math.max(0, ticks) / BALANCE.TICKS_PER_DAY)
const candidates = (p: Project) => s.value.employees.filter(e => !p.assigneeIds.includes(e.id))
const assignee = (p: Project) => candidates(p).find(e => e.id === picks.value[p.id])?.id ?? candidates(p)[0]?.id ?? ''
const repairer = (p: Project) => store.freeEmployees.find(e => e.id === repairPicks.value[p.id])?.id ?? store.freeEmployees[0]?.id ?? ''
const negotiator = (p: Project) => s.value.employees.filter(e => e.role === 'pm' &&
  (e.assignedProjectId === p.id || freeForActivity(e, s.value.weekIndex)))
  .sort((left, right) => right.stats.communication - left.stats.communication)[0]

function odds(p: Project): string {
  const employee = negotiator(p)
  if (!employee) return ''
  const result = negotiationOdds(employee, s.value.company.trust, p,
    Boolean(research.value[p.id] && s.value.company.research >= 3))
  return '성공 ' + result.success + '% · 실패 ' + result.fail + '% · 대실패 ' + result.critical + '%'
}
function negotiate(p: Project, goal: 'time' | 'scope'): void {
  const employee = negotiator(p)
  if (employee) store.play(game => game.negotiateProject(p.id, employee.id, goal, Boolean(research.value[p.id])))
}
</script>

<template>
  <section class="stack">
    <h1>프로젝트</h1>
    <p v-if="!store.activeProjects.length" class="panel muted">진행 중인 프로젝트가 없습니다. 의뢰 탭에서 담당자를 정하고 수락하세요.</p>

    <article v-for="p in store.activeProjects" :key="p.id" class="panel stack">
      <div class="split"><h2>{{ p.title }}</h2><span class="tag">{{ stateLabel[p.state] }}</span></div>
      <p class="muted">{{ p.client }} · {{ techName(p.technology) }} · 진행 {{ Math.min(100, Math.floor(p.progress)) }}%<span v-if="trust(p) !== undefined"> · 고객 신뢰 {{ trust(p) }}/100</span></p>
      <progress :value="Math.min(100, p.progress)" max="100" :aria-label="p.title + ' 진척도'" />
      <p>납기 {{ p.elapsedTicks > p.durationTicks ? days(p.elapsedTicks - p.durationTicks) + '일 지연' : '약 ' + days(p.durationTicks - p.elapsedTicks) + '일 남음' }} · 버그 {{ Math.floor(p.bugs) }} · 부채 {{ Math.floor(p.debt) }} DP</p>
      <p v-if="p.longContract" class="muted">
        3개월 계약 · 예상 공수 약 {{ p.longContract.workDays }}인일 · 착수 {{ p.advance }}pt / 중간 {{ longPayments(p.budget).middle }}pt / 납품 {{ longPayments(p.budget).final }}pt
      </p>
      <p v-if="!p.assigneeIds.length" class="notice warn">담당자가 없습니다. 납기까지 후임이 없으면 계약 실패입니다.</p>
      <div v-for="id in p.assigneeIds" :key="id" class="split">
        <span>{{ name(id) }}<small v-if="s.employees.find(e => e.id === id)?.handover"> · 인수인계 중</small></span>
        <button class="btn ghost compact" type="button" :disabled="p.assigneeIds.length < 2"
          @click="store.play(game => game.assignEmployee(id, null, Boolean(emergency[p.id])))">배정 해제</button>
      </div>
      <div v-if="candidates(p).length" class="controls">
        <label class="grow">추가 담당자
          <select :value="assignee(p)" @change="picks[p.id] = ($event.target as HTMLSelectElement).value">
            <option v-for="e in candidates(p)" :key="e.id" :value="e.id">{{ e.name }}{{ (p.isProduct ? freeForActivity(e, s.weekIndex) : freeForContract(e, s.weekIndex)) ? '' : ' · 활동 배정됨' }}</option>
          </select>
        </label>
        <button class="btn ghost compact" type="button" :disabled="!assignee(p)"
          @click="store.play(game => game.assignEmployee(assignee(p), p.id, Boolean(emergency[p.id])))">배정</button>
      </div>
      <button v-if="store.stage.index >= 3" class="btn ghost compact" type="button"
        :disabled="!store.contractCandidates.length || p.assigneeIds.length >= 4"
        @click="store.play(game => game.assignDevelopmentTeam(p.id))">개발팀 배정</button>
      <label v-if="candidates(p).length || p.assigneeIds.length > 1" class="inline">
        <input v-model="emergency[p.id]" type="checkbox" /> 긴급 재배정 허용
      </label>
      <div class="controls">
        <button class="btn ghost compact" type="button" :aria-pressed="p.mode === 'normal'"
          :disabled="p.state !== 'inDev' && p.state !== 'contracted'" @click="store.play(game => game.setProjectMode(p.id, 'normal'))">정상 개발</button>
        <button class="btn ghost compact" type="button" :aria-pressed="p.mode === 'speed'"
          :disabled="p.state !== 'inDev' && p.state !== 'contracted'" @click="store.play(game => game.setProjectMode(p.id, 'speed'))">스피드 개발 · 부채 증가</button>
      </div>

      <div v-if="p.scopePending" :id="'scope-' + p.id" class="notice stack" tabindex="-1" role="region" aria-label="고객 범위 변경 안내">
        <strong>고객이 추가 작업을 요청했습니다</strong>
        <p>모든 범위 변경 요청에 답할 때까지 시간이 멈춥니다.</p>
        <p v-if="p.longContract" class="muted">수락 시 보상이 15% 늘고 단계별 지급액이 조정됩니다. 12주 납기 안에 추가 범위를 검증해야 합니다.</p>
        <p v-else class="muted">수락 시 보상 15% 증가, 납기 1일 연장, 추가 검증이 필요합니다.</p>
        <div class="controls">
          <button class="btn compact" type="button" @click="store.play(game => game.resolveScope(p.id, true))">변경 수락</button>
          <button class="btn ghost compact" type="button" @click="store.play(game => game.resolveScope(p.id, false))">원래 범위 유지</button>
        </div>
      </div>

      <div v-if="waitingForLongReview(p)" class="notice stack" role="region" aria-label="3개월 계약 중간 검수">
        <strong>중간 검수 대기</strong>
        <p v-if="p.elapsedTicks < LONG_CONTRACT.checkpointEarliestTicks">
          고객 검수까지 {{ days(LONG_CONTRACT.checkpointEarliestTicks - p.elapsedTicks) }}일 남았습니다.
        </p>
        <p>검수 전에는 이 계약의 개발이 멈춥니다. 담당자를 바꾸거나 다음 주 배정 계획을 세운 뒤 진행할 수 있습니다. 납기까지 남은 시간은 계속 줄어듭니다.</p>
        <button class="btn compact" type="button" :disabled="!longReviewReady(p) || s.gameOver || Boolean(store.pendingScopeId)"
          @click="store.play(game => game.approveLongContractReview(p.id))">중간 검수 완료 · {{ longPayments(p.budget).middle }}pt 수령</button>
      </div>
      <details v-if="!p.isProduct && negotiator(p) && p.negotiationWeek !== s.weekIndex && (!p.longContract || p.negotiationWeek === 0)">
        <summary>개발 PM과 고객 조율</summary>
        <p>{{ negotiator(p)?.name }} · {{ odds(p) }}</p>
        <p class="muted">대실패 시 {{ !p.longContract && p.style === 'urgent' ? '납기가 줄어듭니다.' : '추가 검수 공수가 생깁니다.' }}</p>
        <label class="inline"><input v-model="research[p.id]" type="checkbox" :disabled="s.company.research < 3" /> 연구 3점 사용</label>
        <div class="controls">
          <button v-if="!p.longContract" class="btn ghost compact" type="button" @click="negotiate(p, 'time')">납기 연장 요청</button>
          <button class="btn ghost compact" type="button" @click="negotiate(p, 'scope')">일부 범위 미루기</button>
        </div>
      </details>

      <details v-if="canReview(p) && p.assigneeIds.length">
        <summary>코드 리뷰 · 배포 전</summary>
        <p>새 변경이 빈 값 입력에서 기존 처리를 깨뜨릴 수 있습니다. 어떤 테스트를 추가할까요?</p>
        <div class="controls">
          <button class="btn ghost compact" type="button" @click="store.play(game => game.reviewProject(p.id, true))">빈 값과 경계값 검증</button>
          <button class="btn ghost compact" type="button" @click="store.play(game => game.reviewProject(p.id, false))">정상 입력 재실행</button>
        </div>
      </details>

      <div v-if="cancelId === p.id" class="notice stack">
        <p>착수금 ₩{{ p.advance.toLocaleString() }} 전액을 반환합니다. 작업으로 얻은 개인 노하우는 남습니다.</p>
        <p v-if="p.longContract?.middlePaid">이미 지급된 중간 검수 대금은 유지됩니다.</p>
        <div class="controls">
          <button class="btn danger compact" type="button" @click="store.play(game => game.cancelProject(p.id)); cancelId = ''">취소 확정</button>
          <button class="btn ghost compact" type="button" @click="cancelId = ''">계속 진행</button>
        </div>
      </div>
      <button v-else class="btn ghost compact" type="button" @click="cancelId = p.id">{{ p.isProduct ? '개발 중단' : '계약 취소' }}</button>
    </article>

    <h2>유지보수</h2>
    <p v-if="!repairs.length" class="muted">보수 요청과 기술부채가 있는 납품작이 여기에 표시됩니다.</p>
    <article v-for="p in repairs" :key="p.id" class="panel stack">
      <div class="split"><h3>{{ p.title }}</h3><span class="tag warn">{{ Math.floor(p.debt) }} DP</span></div>
      <template v-if="p.issue">
        <p class="muted">{{ p.issue.source }} · {{ Math.ceil(p.issue.remaining) }} 공수 남음</p>
        <p v-if="p.issue.outsourcedUntil !== null">외주 처리 중 · 약 {{ days(p.issue.outsourcedUntil - s.tick) }}일 남음</p>
        <p v-else-if="p.issue.assignedId">사내 처리 중 · {{ name(p.issue.assignedId) }}</p>
        <template v-else>
          <label v-if="store.freeEmployees.length">보수 담당자
            <select :value="repairer(p)" @change="repairPicks[p.id] = ($event.target as HTMLSelectElement).value">
              <option v-for="e in store.freeEmployees" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>
          <div class="controls">
            <button class="btn compact" type="button" :disabled="!repairer(p)" @click="store.play(game => game.startRepair(repairer(p), p.id))">직접 보수</button>
            <button class="btn ghost compact" type="button" :disabled="s.company.cash < outsourcePrice(p)" @click="store.play(game => game.outsourceRepair(p.id))">외주 ₩{{ outsourcePrice(p) }}</button>
          </div>
        </template>
      </template>
      <button v-else class="btn ghost compact" type="button" @click="store.play(game => game.requestRepair(p.id))">예방 리팩토링 요청</button>
    </article>

    <h2 v-if="history.length">최근 결과</h2>
    <article v-for="p in history" :key="p.id" class="panel stack">
      <div class="split"><strong>{{ p.title }}</strong><span class="tag">{{ stateLabel[p.state] }}</span></div>
      <p class="muted">{{ p.state === 'canceled' ? '착수금 ₩' + p.advance.toLocaleString() + ' 반환' : '잔금 ₩' + p.payout.toLocaleString() }}<span v-if="p.longContract?.middlePaid"> · 중간 검수 지급 완료</span></p>
    </article>
  </section>
</template>
