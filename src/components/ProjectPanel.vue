<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { assignmentBlock, freeForActivity, negotiationOdds, outsourcePrice } from '@/core/Game'
import { canReview, employeeMatch, isActive } from '@/core/project'
import { LONG_CONTRACT, longPayments, longReviewReady, waitingForLongReview } from '@/core/longContracts'
import { BALANCE } from '@/data/balance'
import { ROLES, techName } from '@/data/rules'
import { roleLevel } from '@/core/staff'
import { formatContractDuration } from '@/core/weeklyContracts'
import type { Employee, Project } from '@/core/types'
import EmployeeFitDetails from '@/components/EmployeeFitDetails.vue'

const store = useGameStore()
const s = computed(() => store.snapshot)
const history = computed(() => s.value.projects.filter(p => !isActive(p)).slice(-8).reverse())
const repairs = computed(() => s.value.projects.filter(p => !isActive(p) && (p.issue || p.debt >= 1)))
const picks = ref<Record<string, string>>({})
const lastAssigned = ref<Record<string, string>>({})
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
const assignee = (p: Project) => candidates(p).find(e => e.id === picks.value[p.id]) ?? candidates(p)[0]
const assigned = (p: Project) => p.assigneeIds.flatMap(id => {
  const employee = s.value.employees.find(e => e.id === id)
  return employee ? [employee] : []
})
const roleLabel = (e: Employee) => ROLES[e.role] + ' Lv.' + roleLevel(e)
const formatWeeks = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
const personWeeks = (p: Project) => p.weeklyTerms
  ? formatWeeks.format(p.weeklyTerms.personWeeks * (p.acceptedOfferNegotiation?.workMultiplier ?? 1))
  : ''
const assignmentMessages = {
  'game-over': '회사 운영이 종료되어 배정할 수 없습니다.',
  'last-assignee': '마지막 담당자입니다. 후임을 먼저 배정하세요.',
  'worked-this-week': '진행한 주간 활동을 바꾸려면 긴급 재배정을 선택하세요.',
}
function restriction(e: Employee, p: Project, target?: Project): string {
  const reason = assignmentBlock(s.value, e, target, Boolean(emergency.value[p.id]))
  return reason ? assignmentMessages[reason] : ''
}
function allocation(e: Employee): string {
  if (e.assignedProjectId) {
    const title = s.value.projects.find(p => p.id === e.assignedProjectId)?.title
    return title ? title + ' 배정 중' : '프로젝트 배정 중'
  }
  const support = s.value.enterprise.support
  if (support.week === s.value.weekIndex && support.employeeIds.includes(e.id)) return '솔루션 고객 지원 배정 중'
  if (e.activity?.kind === 'repair') return '유지보수 배정 중'
  if (e.activity) {
    const activity = e.activity.kind === 'pilot' ? ' 파일럿' : ' 교육'
    return techName(e.activity.target) + activity + (e.activity.progress > 0 ? ' 중' : ' 배정 중')
  }
  if (e.workedWeek === s.value.weekIndex) return '이번 주 활동 진행 이력 있음'
  return '현재 배정 없음'
}
function canAssignLabel(e: Employee, p: Project): string {
  const blocked = restriction(e, p, p)
  if (blocked) return blocked
  if (assignmentBlock(s.value, e, p) === 'worked-this-week') return '긴급 재배정 가능'
  if (e.assignedProjectId || e.activity) return '현재 배정을 바꿔 합류 가능'
  if (e.contractAvailableWeek === s.value.weekIndex) return '이전 납품 완료 · 바로 배정 가능'
  return '바로 배정 가능'
}
function assign(p: Project): void {
  const employee = assignee(p)
  if (employee && store.play(game => game.assignEmployee(employee.id, p.id, Boolean(emergency.value[p.id])))) {
    lastAssigned.value[p.id] = employee.id
  }
}
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
      <p>납기 {{ p.elapsedTicks > p.durationTicks ? formatContractDuration(p.elapsedTicks - p.durationTicks) + ' 지연' : formatContractDuration(p.durationTicks - p.elapsedTicks) + ' 남음' }} · 버그 {{ Math.floor(p.bugs) }} · 부채 {{ Math.floor(p.debt) }} DP</p>
      <p v-if="p.weeklyTerms" class="muted">
        계약 납기 {{ formatContractDuration(p.durationTicks) }} · 표준 작업량 {{ personWeeks(p) }}인주 · 계약액 {{ p.budget.toLocaleString() }}pt
      </p>
      <p v-if="p.longContract" class="muted">
        {{ p.weeklyTerms ? '장기 계약' : '3개월 계약' }}<span v-if="!p.weeklyTerms"> · 예상 공수 약 {{ p.longContract.workDays }}인일</span>
        · 착수 {{ p.advance }}pt / 중간 {{ longPayments(p.budget).middle }}pt / 납품 {{ longPayments(p.budget).final }}pt
      </p>
      <p v-if="!p.assigneeIds.length" class="notice warn">담당자가 없습니다. 납기까지 후임이 없으면 계약 실패입니다.</p>
      <div v-else class="team-members" role="region" aria-label="현재 담당자">
        <div v-for="e in assigned(p)" :key="e.id" class="member-row">
          <details :open="lastAssigned[p.id] === e.id || undefined">
            <summary><span>{{ e.name }} · {{ roleLabel(e) }}</span><small v-if="e.handover"> · 인수인계 중</small></summary>
            <EmployeeFitDetails :employee="e" :work="p" context="이 프로젝트 배정 중" />
          </details>
          <button class="btn ghost compact" type="button" :disabled="Boolean(restriction(e, p))"
            :aria-describedby="restriction(e, p) ? p.id + '-' + e.id + '-release' : undefined"
            @click="store.play(game => game.assignEmployee(e.id, null, Boolean(emergency[p.id])))">배정 해제</button>
          <p v-if="restriction(e, p)" :id="p.id + '-' + e.id + '-release'" class="muted">{{ restriction(e, p) }}</p>
        </div>
      </div>
      <div v-if="candidates(p).length" class="controls">
        <label class="grow">추가 담당자
          <select :value="assignee(p)?.id" @change="picks[p.id] = ($event.target as HTMLSelectElement).value">
            <option v-for="e in candidates(p)" :key="e.id" :value="e.id">
              {{ e.name }} · {{ roleLabel(e) }} · {{ Math.round(employeeMatch(e, p) * 100) }}%{{ restriction(e, p, p) ? ' · 제한' : '' }}
            </option>
          </select>
        </label>
        <button class="btn ghost compact" type="button" :disabled="!assignee(p) || Boolean(restriction(assignee(p)!, p, p))"
          :aria-describedby="assignee(p) ? p.id + '-availability' : undefined"
          @click="assign(p)">배정</button>
      </div>
      <div v-if="assignee(p)" class="candidate-card" role="region" aria-label="선택한 후보">
        <EmployeeFitDetails :key="assignee(p)!.id" :employee="assignee(p)!" :work="p" :context="allocation(assignee(p)!)" />
        <p :id="p.id + '-availability'" class="muted" aria-live="polite">{{ canAssignLabel(assignee(p)!, p) }}</p>
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
        <p v-if="p.longContract" class="muted">수락 시 보상이 15% 늘고 단계별 지급액이 조정됩니다. {{ formatContractDuration(p.durationTicks) }} 납기 안에 추가 범위를 검증해야 합니다.</p>
        <p v-else class="muted">수락 시 보상 15% 증가, 납기 1일 연장, 추가 검증이 필요합니다.</p>
        <div class="controls">
          <button class="btn compact" type="button" @click="store.play(game => game.resolveScope(p.id, true))">변경 수락</button>
          <button class="btn ghost compact" type="button" @click="store.play(game => game.resolveScope(p.id, false))">원래 범위 유지</button>
        </div>
      </div>

      <div v-if="waitingForLongReview(p)" class="notice stack" role="region" :aria-label="p.weeklyTerms ? '장기 계약 중간 검수' : '3개월 계약 중간 검수'">
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

<style scoped>
.team-members { display: grid; gap: 0.5rem; }
.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.3rem 0.5rem;
}
.member-row > details { min-width: 0; }
.member-row > details > summary { overflow-wrap: anywhere; }
.member-row > p { grid-column: 1 / -1; }
.candidate-card { min-width: 0; display: grid; gap: 0.4rem; padding: 0.55rem 0.65rem; border: 1px solid var(--line); border-radius: 0.5rem; }
</style>
      </template>

<style scoped>
.team-members { display: grid; gap: 0.5rem; }
.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.3rem 0.5rem;
}
.member-row > details { min-width: 0; }
.member-row > details > summary { overflow-wrap: anywhere; }
.member-row > p { grid-column: 1 / -1; }
.candidate-card { min-width: 0; display: grid; gap: 0.4rem; padding: 0.55rem 0.65rem; border: 1px solid var(--line); border-radius: 0.5rem; }
</style>
      <button v-else class="btn ghost compact" type="button" @click="store.play(game => game.requestRepair(p.id))">예방 리팩토링 요청</button>
    </article>

    <h2 v-if="history.length">최근 결과</h2>
    <article v-for="p in history" :key="p.id" class="panel stack">
      <div class="split"><strong>{{ p.title }}</strong><span class="tag">{{ stateLabel[p.state] }}</span></div>
      <p class="muted">{{ p.state === 'canceled' ? '착수금 ₩' + p.advance.toLocaleString() + ' 반환' : '잔금 ₩' + p.payout.toLocaleString() }}<span v-if="p.longContract?.middlePaid"> · 중간 검수 지급 완료</span></p>
    </article>
  </section>
</template>

<style scoped>
.team-members { display: grid; gap: 0.5rem; }
.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.3rem 0.5rem;
}
.member-row > details { min-width: 0; }
.member-row > details > summary { overflow-wrap: anywhere; }
.member-row > p { grid-column: 1 / -1; }
.candidate-card { min-width: 0; display: grid; gap: 0.4rem; padding: 0.55rem 0.65rem; border: 1px solid var(--line); border-radius: 0.5rem; }
</style>
