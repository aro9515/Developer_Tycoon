<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { gameMonth } from '@/core/customers'
import {
  adChannels, automationCost, billingModels, customerProfile, eligibleTrialCustomers, enterpriseProgress,
  marketEntryReason, quoteOutsourceCampaign, quoteSolutionCampaign, solutionMarkets, solutionPrices, solutionProject, solutionRenewalChance, solutionRenewalReason,
  solutionSizes, supportCapacity, type AdChannel, type BillingModel, type ForeignMarket, type SolutionAccount, type SolutionMarket, type SolutionSize,
} from '@/core/enterprise'
import { BALANCE } from '@/data/balance'
import { DOMAINS } from '@/data/rules'

const store = useGameStore()
const state = computed(() => store.snapshot)
const enterprise = computed(() => state.value.enterprise)
const solution = computed(() => solutionProject(state.value))
const metrics = computed(() => enterpriseProgress(state.value))
const month = computed(() => gameMonth(state.value.weekIndex))
const trialCustomers = computed(() => eligibleTrialCustomers(state.value))
const productRunning = computed(() => state.value.projects.some((project) =>
  project.isProduct && project.state !== 'failed' && project.state !== 'canceled'))
const firstReady = computed(() => store.freeEmployees[0]?.id ?? '')
const employee = ref('')
const salesperson = computed(() => store.freeEmployees.find((entry) => entry.id === employee.value) ?? store.freeEmployees[0])
const salesEmployee = computed(() => salesperson.value?.id ?? '')
const selectedDomain = ref<keyof typeof DOMAINS>()
const domain = computed(() => store.products.includes(selectedDomain.value!) ? selectedDomain.value : store.products[0])
const developer = ref('')
const developers = computed(() => {
  const key = domain.value
  return key ? store.freeEmployees.filter((entry) => (entry.domainXp[key] ?? 0) >= 8) : []
})
const developerId = computed(() => developers.value.some((entry) => entry.id === developer.value) ? developer.value : developers.value[0]?.id ?? '')
const selectedChannel = ref<AdChannel>('online')
const selectedMarket = ref<SolutionMarket>('domestic')
const selectedSize = ref<SolutionSize>('small')
const supportSelection = ref<string[]>([])
const permittedSupport = computed(() => store.freeEmployees.filter((entry) => supportSelection.value.includes(entry.id)).map((entry) => entry.id))
const selectedAd = computed(() => quoteOutsourceCampaign(state.value, selectedChannel.value))
const solutionQuote = computed(() => quoteSolutionCampaign(state.value, selectedChannel.value, selectedMarket.value, selectedSize.value))
const campaignReady = computed(() => !enterprise.value.campaign && enterprise.value.campaignMonth !== month.value &&
  selectedAd.value && state.value.company.cash >= selectedAd.value.cost)
const markets = Object.keys(solutionMarkets) as SolutionMarket[]
const foreign: ForeignMarket[] = ['japan', 'northAmerica']
const models: BillingModel[] = ['license', 'subscription']
const offerReady = computed(() => enterprise.value.opportunities.filter((lead) => lead.status !== 'inquiry'))
const daysUntil = (tick: number) => Math.max(0, Math.ceil((tick - state.value.tick) / BALANCE.TICKS_PER_DAY))
const name = (id: string) => state.value.customers.find((entry) => entry.id === id)?.name ?? '고객'
const segment = (id: string) => {
  const profile = customerProfile(state.value, id)
  return solutionMarkets[profile.market].label + ' · ' + solutionSizes[profile.size]
}
const money = (value: number) => value.toLocaleString() + 'pt'
function renewalBlock(account: SolutionAccount): string {
  if (state.value.gameOver) return '진행이 종료되었습니다.'
  return solutionRenewalReason(state.value, account) || (salesEmployee.value ? '' : '이번 주 배정 가능한 영업 담당자가 없습니다.')
}
function priceLabel(id: string, model: BillingModel): string {
  const { onboarding, monthly } = solutionPrices(state.value, id, model)
  return (onboarding ? '도입 ' + money(onboarding) + ' + ' : '') + '월 ' + money(monthly)
}
</script>

<template>
  <section class="panel stack" aria-label="자사 솔루션">
    <div class="split">
      <h2>자사 솔루션</h2>
      <span v-if="solution" class="tag">유료 {{ metrics.paidCustomers }}곳 · 갱신 {{ metrics.renewals }}건</span>
    </div>

    <template v-if="!solution">
      <p v-if="productRunning" class="muted">개발 중입니다. 프로젝트 탭에서 진행 상황을 확인하세요.</p>
      <p v-else-if="!store.products.length" class="muted">같은 분야의 서로 다른 고객 두 곳에 납품하고, 해당 분야 노하우 8 이상인 직원이 있으면 솔루션을 개발할 수 있습니다.</p>
      <template v-else>
        <label>솔루션 분야
          <select :value="domain" aria-label="솔루션 분야" @change="selectedDomain = ($event.target as HTMLSelectElement).value as keyof typeof DOMAINS">
            <option v-for="entry in store.products" :key="entry" :value="entry">{{ DOMAINS[entry] }}</option>
          </select>
        </label>
        <label>개발 담당자
          <select :value="developerId" aria-label="솔루션 개발 담당자" @change="developer = ($event.target as HTMLSelectElement).value">
            <option v-for="entry in developers" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!domain || !developerId || state.company.cash < 100 ||
          store.activeProjects.length >= state.company.projectSlots || state.gameOver"
          @click="store.play(game => game.startProduct(domain!, developerId))">개발 시작 100pt</button>
        <p v-if="!developers.length" class="muted">이번 주 배정 가능하고 해당 분야 노하우가 8 이상인 직원이 필요합니다.</p>
      </template>
    </template>

    <template v-else>
      <h3>{{ DOMAINS[solution.domain] }} 솔루션</h3>
      <p class="muted">예상 월 반복 순수입 {{ money(metrics.monthlyRecurringNet) }} · 지난 주 지원 {{ enterprise.support.handled }}건 · 호스팅 {{ money(enterprise.support.hostingExpense) }} · 지원비 {{ money(enterprise.support.supportExpense) }}</p>
      <label>영업 담당자
        <select v-model="employee" aria-label="솔루션 영업 담당자">
          <option value="">자동 선택</option>
          <option v-for="entry in store.freeEmployees" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
        </select>
      </label>
      <p v-if="salesperson" class="muted">선택한 담당자 {{ salesperson.name }} · 커뮤니케이션 {{ salesperson.stats.communication.toFixed(1) }}</p>
      <p v-else class="muted">이번 주 배정 가능한 직원이 없습니다.</p>

      <details open>
        <summary>시범 도입과 판매</summary>
        <p v-if="!trialCustomers.length && !offerReady.length" class="muted">신뢰 60 이상인 납품 고객에게 제안하거나 제품 광고로 문의를 받으세요.</p>
        <article v-for="customer in trialCustomers" :key="customer.id" class="customer stack" :aria-label="customer.name + ' 시범 도입'">
          <div class="split"><strong>{{ customer.name }}</strong><span class="muted">{{ segment(customer.id) }} · 신뢰 {{ customer.trust }}</span></div>
          <button class="btn ghost compact" type="button" :disabled="!salesEmployee || state.gameOver"
            @click="store.play(game => game.enterpriseAction({ type: 'trial', customerId: customer.id, employeeId: salesEmployee }))">시범 제안</button>
        </article>
        <article v-for="lead in offerReady" :key="lead.customerId" class="customer stack" :aria-label="name(lead.customerId) + ' 판매'">
          <div class="split"><strong>{{ name(lead.customerId) }}</strong><span class="muted">{{ segment(lead.customerId) }}</span></div>
          <p v-if="lead.status === 'trial'" class="muted">시범 도입 중 · 약 {{ daysUntil(lead.dueTick) }}일 남음</p>
          <template v-else>
            <div v-for="model in models" :key="model" class="split commerce">
              <span>{{ billingModels[model] }}<small>{{ priceLabel(lead.customerId, model) }}</small></span>
              <button class="btn ghost compact" type="button" :disabled="!salesEmployee || state.gameOver"
                @click="store.play(game => game.enterpriseAction({ type: 'sell', customerId: lead.customerId, employeeId: salesEmployee, model }))">
                {{ model === 'license' ? '기업 도입 계약' : '월 구독 계약' }}
              </button>
            </div>
          </template>
        </article>
      </details>

      <details :open="enterprise.accounts.length > 0">
        <summary>지원과 갱신 · 계약 {{ enterprise.accounts.length }}곳</summary>
        <p v-if="!enterprise.accounts.length" class="muted">첫 계약을 하면 제품 사용량에 따라 지원 업무와 서버 비용이 발생합니다.</p>
        <article v-for="account in enterprise.accounts" :key="account.customerId" class="customer stack" :aria-label="name(account.customerId) + ' 월 계약'">
          <div class="split"><strong>{{ name(account.customerId) }}</strong><span class="muted">{{ segment(account.customerId) }}</span></div>
          <p class="muted">{{ billingModels[account.model] }} · 월 {{ money(solutionPrices(state, account.customerId, account.model).monthly) }}</p>
          <p class="muted">{{ account.paidUntil > month ? (account.paidUntil - 1) + '개월차까지 납부' : '월 계약 만료' }} · 만족도 {{ account.satisfaction }}/100 · 미처리 {{ account.backlog }}건</p>
          <p>성공 시 {{ money(solutionPrices(state, account.customerId, account.model).monthly) }} 수입
            · {{ Math.max(account.paidUntil, month) }}개월차까지 연장</p>
          <div class="split">
            <span v-if="renewalBlock(account)" class="muted">{{ renewalBlock(account) }}</span>
            <span v-else-if="salesperson" class="muted">갱신 성공 확률 {{ Math.floor(solutionRenewalChance(account, salesperson) * 100) }}%</span>
            <button class="btn ghost compact" type="button" :disabled="!!renewalBlock(account)"
              @click="store.play(game => game.enterpriseAction({ type: 'renew', customerId: account.customerId, employeeId: salesEmployee }))">갱신 제안</button>
          </div>
        </article>
        <template v-if="metrics.paidCustomers">
          <p class="muted" v-if="enterprise.support.week === state.weekIndex">이번 주 지원팀 {{ enterprise.support.employeeIds.length }}명 배정</p>
          <div class="support-crew">
            <label v-for="entry in store.freeEmployees" :key="entry.id">
              <input v-model="supportSelection" type="checkbox" :value="entry.id" /> {{ entry.name }} · {{ supportCapacity(entry) }}건
            </label>
          </div>
          <div class="controls">
            <button type="button" class="btn ghost compact" :disabled="!permittedSupport.length || state.gameOver"
              @click="store.play(game => game.enterpriseAction({ type: 'support', employeeIds: permittedSupport }))">선택 인원 지원 배정</button>
            <button type="button" class="btn ghost compact" :disabled="!firstReady || state.gameOver"
              @click="store.play(game => game.enterpriseAction({ type: 'support', employeeIds: store.freeEmployees.map(entry => entry.id) }))">가용 지원팀 배정</button>
            <button type="button" class="btn ghost compact" :disabled="enterprise.automation >= 3 || state.company.cash < automationCost(state) || state.gameOver"
              @click="store.play(game => game.enterpriseAction({ type: 'automate' }))">
              {{ enterprise.automation >= 3 ? '지원 자동화 완료' : '지원 자동화 ' + money(automationCost(state)) }}
            </button>
          </div>
          <p class="muted">자동 처리 주 {{ enterprise.automation * 2 }}건 · 배정한 직원은 이번 주 다른 업무를 맡을 수 없습니다.</p>
        </template>
      </details>

      <details>
        <summary>제품 광고와 해외 진출</summary>
        <div class="customer stack">
          <label>광고 채널
            <select v-model="selectedChannel" aria-label="솔루션 광고 채널">
              <option v-for="entry in adChannels" :key="entry.id" :value="entry.id" :disabled="!quoteOutsourceCampaign(state, entry.id)">
                {{ entry.label }} {{ money(entry.cost) }}{{ quoteOutsourceCampaign(state, entry.id) ? '' : ' · 납품 ' + entry.deliveries + '건 필요' }}
              </option>
            </select>
          </label>
          <label>시장
            <select v-model="selectedMarket" aria-label="솔루션 광고 시장">
              <option v-for="entry in markets" :key="entry" :value="entry" :disabled="!enterprise.markets[entry].open">{{ solutionMarkets[entry].label }}</option>
            </select>
          </label>
          <label>대상 규모
            <select v-model="selectedSize" aria-label="광고 대상 규모">
              <option v-for="(label, id) in solutionSizes" :key="id" :value="id">{{ label }} 기업</option>
            </select>
          </label>
          <p v-if="enterprise.campaign" role="status">제품 광고 진행 중 · 약 {{ daysUntil(enterprise.campaign.dueTick) }}일</p>
          <p v-else-if="enterprise.campaignMonth === month" class="muted">이번 달 제품 광고를 사용했습니다.</p>
          <p v-else-if="solutionQuote" class="muted">{{ solutionQuote.days }}일 후 · 최대 {{ solutionQuote.reach }}곳 도달 · 문의 확률 {{ Math.round(solutionQuote.chance * 100) }}%/곳 · 월 1회</p>
          <button type="button" class="btn ghost compact" :disabled="!campaignReady || state.gameOver"
            @click="store.play(game => game.enterpriseAction({ type: 'advertise', channel: selectedChannel, market: selectedMarket, target: selectedSize }))">제품 광고 시작</button>
        </div>
        <article v-for="entry in foreign" :key="entry" class="customer stack">
          <div class="split">
            <span><strong>{{ solutionMarkets[entry].label }}</strong> · {{ marketEntryReason(state, entry) || solutionMarkets[entry].days + '일 준비' }}</span>
            <button type="button" class="btn ghost compact" :disabled="!!marketEntryReason(state, entry) || state.gameOver"
              :aria-label="solutionMarkets[entry].label + ' 진출 준비'"
              @click="store.play(game => game.enterpriseAction({ type: 'enter-market', market: entry }))">진출 {{ money(solutionMarkets[entry].cost) }}</button>
          </div>
        </article>
      </details>
    </template>
  </section>
</template>

<style scoped>
.customer { display: grid; gap: 7px; padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--line); }
.commerce { flex-wrap: wrap; }
.commerce small { display: block; }
.support-crew { display: flex; gap: 6px 14px; flex-wrap: wrap; margin: 5px 0; }
.support-crew label { flex-direction: row; align-items: center; }
.support-crew input { width: auto; }
</style>
