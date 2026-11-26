<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { freeForActivity, freeForContract, PILOT_DAYS, PILOT_SKILL_MIN, TRAINING_DAYS, trainingBlock } from '@/core/Game'
import { canChangeRole, canLevelUpRole, HIRE_COST, nextRoleTarget, roleLevel, salaryReviewDue } from '@/core/staff'
import { ADVANCED_ROLES, BASE_ROLES, DOMAINS, ITEMS, ROLES, MAX_ROLE_LEVEL, ROLE_REQUIREMENTS, SHOP, SKILLS, TRAINING_COURSES, tech, techName, trainingCourse, type Role } from '@/data/rules'
import type { Employee } from '@/core/types'

const store = useGameStore()
const s = computed(() => store.snapshot)
const selection = ref<Record<string, string>>({})
const salaries = ref<Record<string, number>>({})
const roleOptions = [...BASE_ROLES, ...ADVANCED_ROLES]
const course = (employee: Employee) => selection.value[employee.id] ?? 'javascript'
const ready = (employee: Employee) => freeForActivity(employee, s.value.weekIndex)
const salary = (e: Employee) => salaries.value[e.id] ?? e.desiredSalary
const allowedTechnology = (key: string) => !tech(key)?.expansion || store.stage.deliveries >= 4
const trainingMessages: Record<NonNullable<ReturnType<typeof trainingBlock>>, string> = {
  'game-over': '진행이 종료되었습니다.',
  'unknown-course': '교육 과정을 선택하세요.',
  busy: '업무에 배정됐거나 이번 주 작업을 이미 시작했습니다.',
  stage: '외주 납품 4건 후 열립니다.',
  'not-technology': '일반 교육 과정으로 파일럿을 진행할 수 없습니다.',
  skill: '파일럿에 필요한 능력치에 아직 도달하지 못했습니다.',
  validated: '이미 검증한 기술입니다.',
  'pilot-in-progress': '다른 직원이 이 기술의 파일럿을 진행 중입니다.',
}

function educationBlock(employee: Employee, pilot = false): string {
  const reason = trainingBlock(s.value, employee, course(employee), pilot)
  return reason ? trainingMessages[reason] : ''
}

function courseSummary(employee: Employee): string {
  const entry = trainingCourse(course(employee))
  if (!entry) return ''
  const display = Math.floor(employee.stats[entry.skill] * 10) / 10
  return SKILLS[entry.skill] + ' 현재 ' + display + (tech(entry.key) ? ' · 파일럿 기준 ' + PILOT_SKILL_MIN : '')
}
function requirementGroups(role: Role) {
  const advanced = ADVANCED_ROLES.find((candidate) => candidate === role)
  return advanced ? ROLE_REQUIREMENTS[advanced] : []
}
function displayRoleXp(employee: Employee, role: Role): string {
  return (Math.floor((employee.roleXp[role] ?? 0) * 10) / 10).toFixed(1)
}
function alertLevel(weeks: number): string {
  return weeks >= 6 ? '퇴사 의사 · 이번 주 대응 필요' : weeks >= 4 ? '면담 요청' : '불만 알림'
}
</script>

<template>
  <section class="stack">
    <div class="split"><h1>직원</h1><span class="muted">{{ s.employees.length }}/{{ store.stage.hires }}명</span></div>
    <details class="panel">
      <summary>채용 · 계약비 ₩{{ HIRE_COST }}</summary>
      <div class="controls">
        <button v-for="role in BASE_ROLES" :key="role" type="button" class="btn ghost compact"
          :disabled="s.employees.length >= store.stage.hires || s.company.cash < HIRE_COST"
          @click="store.play(game => game.hireEmployee(role))">{{ ROLES[role] }}</button>
      </div>
    </details>

    <article v-for="e in s.employees" :key="e.id" class="panel stack">
      <div class="split"><h2>{{ e.name }} · {{ ROLES[e.role] }} Lv.{{ roleLevel(e) }}</h2><span v-if="e.isPlayer" class="tag">대표</span></div>
      <p class="muted">체력 {{ Math.floor(e.stamina) }} · 스트레스 {{ Math.floor(e.stress) }}/{{ e.workloadLimit }} · 주급 ₩{{ e.salary }}</p>
      <p v-if="e.assignedProjectId">{{ s.projects.find(p => p.id === e.assignedProjectId)?.title ?? '프로젝트' }}{{ e.handover ? ' · 인수인계' : '' }}</p>
      <p v-else-if="s.enterprise.support.week === s.weekIndex && s.enterprise.support.employeeIds.includes(e.id)">솔루션 고객 지원 중</p>
      <p v-else-if="e.activity?.kind === 'repair'">유지보수 중</p>
      <p v-else-if="e.activity">{{ techName(e.activity.target) }} {{ e.activity.kind === 'pilot' ? '파일럿' : '교육' }} · {{ Math.floor(e.activity.progress / e.activity.duration * 100) }}%</p>
      <p v-else class="muted">{{ ready(e) ? '이번 주 배정 가능' : freeForContract(e, s.weekIndex) ? '다른 의뢰 배정 가능' : '이번 주 활동 종료' }}</p>

      <div v-if="e.complaints.salary >= 2 || e.complaints.balance >= 2" class="notice warn">
        <p v-if="e.complaints.salary >= 2">급여 {{ alertLevel(e.complaints.salary) }} · 희망 주급 ₩{{ e.desiredSalary }}</p>
        <p v-if="e.complaints.balance >= 2">워라밸 {{ alertLevel(e.complaints.balance) }} · 긴급 업무나 스피드 배정을 줄이세요.</p>
      </div>
      <div v-if="salaryReviewDue(e, s.weekIndex)" class="notice stack">
        <strong>입사 기념 연봉협상</strong>
        <p>희망 연봉 ₩{{ (e.desiredSalary * 48).toLocaleString() }} · 현재 주급 ₩{{ e.salary }}</p>
        <label>제안 주급
          <input type="number" :min="e.salary" :value="salary(e)" @input="salaries[e.id] = ($event.target as HTMLInputElement).valueAsNumber" />
        </label>
        <div class="controls">
          <button type="button" class="btn compact" :disabled="!Number.isSafeInteger(salary(e)) || salary(e) < e.salary"
            @click="store.play(game => game.negotiateSalary(e.id, salary(e)))">연봉 제안</button>
          <button type="button" class="btn ghost compact" @click="store.play(game => game.negotiateSalary(e.id, e.salary))">현재 연봉 유지</button>
        </div>
      </div>

      <details>
        <summary>능력치·노하우</summary>
        <p class="controls"><span v-for="(label, key) in SKILLS" :key="key" class="tag">{{ label }} {{ e.stats[key].toFixed(1) }}</span></p>
        <p class="controls"><span v-for="(value, key) in e.stackXp" :key="key" class="tag">{{ techName(String(key)) }} {{ value.toFixed(1) }}</span></p>
        <p class="controls"><span v-for="(value, key) in e.domainXp" :key="key" class="tag">{{ DOMAINS[key] }} {{ value?.toFixed(1) }}</span></p>
      </details>

      <details>
        <summary>교육·신기술 파일럿</summary>
        <label>기술
          <select aria-label="교육 기술" :value="course(e)" @change="selection[e.id] = ($event.target as HTMLSelectElement).value">
            <option v-for="entry in TRAINING_COURSES" :key="entry.key" :value="entry.key" :disabled="!allowedTechnology(entry.key)">
              {{ entry.name }}{{ allowedTechnology(entry.key) ? '' : ' · 성장 단계 필요' }}
            </option>
          </select>
        </label>
        <p>{{ courseSummary(e) }}</p>
        <p class="muted">교육 {{ TRAINING_DAYS }}일 · 관련 능력치 성장<span v-if="tech(course(e))"> · 파일럿 {{ PILOT_DAYS }}일 · 수료 시 기술 검증과 연구 점수 획득</span></p>
        <p v-if="educationBlock(e)" class="muted">{{ educationBlock(e) }}</p>
        <p v-else-if="educationBlock(e, true)" class="muted">{{ educationBlock(e, true) }}</p>
        <div class="controls">
          <button type="button" class="btn ghost compact" :disabled="!!educationBlock(e)" @click="store.play(game => game.startTraining(e.id, course(e)))">교육 배정</button>
          <button type="button" class="btn ghost compact" :disabled="!!educationBlock(e, true)"
            @click="store.play(game => game.startTraining(e.id, course(e), true))">파일럿 배정</button>
        </div>
      </details>

      <details>
        <summary>직위·전직</summary>
        <div class="controls">
          <span>누적 XP {{ displayRoleXp(e, e.role) }} · {{ nextRoleTarget(e) === undefined ? '최고 레벨' : '다음 레벨 ' + nextRoleTarget(e) + ' XP' }}</span>
          <button class="btn ghost compact" type="button" :disabled="s.gameOver || !canLevelUpRole(e)"
            @click="store.play(game => game.levelUpRole(e.id))">레벨업</button>
        </div>
        <div v-for="role in roleOptions" :key="role" class="split">
          <div>
            <span>{{ ROLES[role] }}</span>
            <small v-if="e.roleLevels[role] !== undefined || e.roleXp[role] !== undefined">
              · Lv.{{ roleLevel(e, role) }} · {{ displayRoleXp(e, role) }} XP
            </small>
            <div v-if="e.roleLevels[role] === undefined && requirementGroups(role).length" class="role-requirements muted"
              :id="e.id + '-role-requirements-' + role">
              <div v-for="(group, index) in requirementGroups(role)" :key="index" class="role-requirement-group">
                <small v-if="index > 0">또는</small>
                <small v-for="(base, position) in group" :key="base">
                  {{ position > 0 ? '+ ' : '' }}{{ ROLES[base] }} 현재 Lv.{{ roleLevel(e, base) }} / 필요 Lv.{{ MAX_ROLE_LEVEL }}
                </small>
              </div>
            </div>
          </div>
          <button class="btn ghost compact" type="button" :disabled="s.gameOver || !canChangeRole(e, role)"
            :aria-label="ROLES[role] + (e.role === role ? ' 현재' : ' 전직')"
            :aria-describedby="e.roleLevels[role] === undefined && requirementGroups(role).length ? e.id + '-role-requirements-' + role : undefined"
            @click="store.play(game => game.changeRole(e.id, role))">{{ e.role === role ? '현재' : '전직' }}</button>
        </div>
      </details>

      <details v-if="ITEMS.some(item => s.company.inventory[item])">
        <summary>아이템 사용</summary>
        <div class="controls">
          <button v-for="item in ITEMS" :key="item" class="btn ghost compact" type="button"
            :disabled="!s.company.inventory[item] || e.itemWeek[item] === s.weekIndex || (item === 'voucher' && (e.activity?.kind !== 'training' || !tech(e.activity.target)))"
            @click="store.play(game => game.useItem(e.id, item))">{{ SHOP[item].label }} ({{ s.company.inventory[item] }})</button>
        </div>
      </details>
    </article>
  </section>
</template>

<style scoped>
.role-requirements, .role-requirement-group {
  display: grid;
  gap: 2px;
}
.role-requirements {
  margin-top: 4px;
}
</style>
