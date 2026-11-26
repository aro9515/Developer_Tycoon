<script setup lang="ts">
import { computed } from 'vue'
import { employeeMatch } from '@/core/project'
import { roleLevel } from '@/core/staff'
import type { Employee, Project, SkillKey } from '@/core/types'
import { ROLES, SKILLS, tech, techName } from '@/data/rules'

const props = defineProps<{
  employee: Employee
  work: Pick<Project, 'requirements' | 'technology'>
  summary?: string
  context?: string
}>()

const fit = computed(() => Math.round(employeeMatch(props.employee, props.work) * 100))
const otherSkills = computed(() => (Object.keys(SKILLS) as SkillKey[])
  .filter(skill => !props.work.requirements.some(requirement => requirement.skill === skill)))
const foundation = computed(() => tech(props.work.technology)?.family)
const format = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
</script>

<template>
  <div class="fit-details">
    <p class="fit-summary"><strong>{{ employee.name }} · {{ ROLES[employee.role] }} Lv.{{ roleLevel(employee) }}</strong></p>
    <p v-if="context" class="muted">{{ context }}</p>
    <p>개인 적합도 {{ fit }}%</p>
    <ul v-if="work.requirements.length" class="fit-skills" aria-label="요구 능력치">
      <li v-for="(requirement, index) in work.requirements" :key="index">
        <b>{{ SKILLS[requirement.skill] }} {{ format.format(employee.stats[requirement.skill]) }} / 필요 {{ requirement.amount }}</b>
        <small :class="{ warn: employee.stats[requirement.skill] < requirement.amount }">
          {{ employee.stats[requirement.skill] >= requirement.amount ? '충족' : '부족' }}
        </small>
      </li>
    </ul>
    <details>
      <summary>{{ summary ?? '다른 능력치·노하우 자세히' }}</summary>
      <div class="fit-extra muted">
        <p>{{ techName(work.technology) }} 노하우 {{ format.format(employee.stackXp[work.technology] ?? 0) }}<span v-if="foundation">
          · {{ techName(foundation) }} 기초 노하우 {{ format.format(employee.stackXp[foundation] ?? 0) }}
        </span></p>
        <p>개인 적합도에는 요구 능력치와 기술 노하우가 반영됩니다.</p>
        <dl v-if="otherSkills.length" class="fit-skills">
          <div v-for="skill in otherSkills" :key="skill">
            <dt>{{ SKILLS[skill] }}</dt><dd>{{ format.format(employee.stats[skill]) }}</dd>
          </div>
        </dl>
      </div>
    </details>
  </div>
</template>

<style scoped>
.fit-details { min-width: 0; display: grid; gap: 0.25rem; }
.fit-details > details { margin-top: 0.2rem; }
.fit-summary { overflow-wrap: anywhere; }
.fit-skills { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; list-style: none; margin: 0; padding: 0; }
.fit-skills li, .fit-skills div { display: inline-flex; gap: 0.3rem; align-items: baseline; padding: 0.12rem 0.4rem; border: 1px solid var(--line); border-radius: 0.45rem; }
.fit-skills li { font-size: 13px; }
.fit-skills dd { margin: 0; font-variant-numeric: tabular-nums; }
.fit-extra { display: grid; gap: 0.35rem; }
</style>
