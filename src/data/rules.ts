export const WEEKS_PER_MONTH = 4
export const WEEKS_PER_YEAR = 12 * WEEKS_PER_MONTH

export const SALES_RULES = { cost: 250, leadDays: 3, followUpDays: 8, startingTrust: 50, followUpTrust: 60 } as const

export const SKILLS = {
  coding: '코딩', frontend: '프론트엔드', backend: '백엔드', database: '데이터베이스',
  infra: '서버·인프라', ai: 'AI', communication: '커뮤니케이션',
} as const

export const ROLES = {
  frontend: '프론트엔드 개발자', backend: '백엔드 개발자',
  server: '서버 엔지니어', coordinator: '프로젝트 코디네이터',
  fullstack: '풀스택 개발자', platform: '플랫폼 엔지니어',
  consultant: '솔루션 컨설턴트', pm: '개발 PM',
} as const
export type Role = keyof typeof ROLES
export type BaseRole = 'frontend' | 'backend' | 'server' | 'coordinator'
export const BASE_ROLES: BaseRole[] = ['frontend', 'backend', 'server', 'coordinator']
export const ADVANCED_ROLES = ['fullstack', 'platform', 'consultant', 'pm'] as const
export type RoleLevel = 1 | 2 | 3 | 4 | 5
export const MAX_ROLE_LEVEL = 5
export const ROLE_LEVEL_XP: Readonly<Partial<Record<number, number>>> = { 2: 5, 3: 12, 4: 21, 5: 32 }
export const ROLE_REQUIREMENTS: Record<(typeof ADVANCED_ROLES)[number], BaseRole[][]> = {
  fullstack: [['frontend', 'backend']],
  platform: [['backend', 'server']],
  consultant: [['server', 'coordinator']],
  pm: [['coordinator', 'frontend'], ['coordinator', 'backend']],
}

type Technology = {
  key: string
  name: string
  skill: keyof typeof SKILLS
  family?: string
  expansion?: boolean
}
export const TECHNOLOGIES: Technology[] = [
  { key: 'javascript', name: 'JavaScript', skill: 'frontend' },
  { key: 'typescript', name: 'TypeScript', skill: 'frontend', family: 'javascript' },
  { key: 'java', name: 'Java', skill: 'backend' },
  { key: 'python', name: 'Python', skill: 'coding' },
  { key: 'csharp', name: 'C#', skill: 'backend' },
  { key: 'php', name: 'PHP', skill: 'backend' },
  { key: 'sql', name: 'SQL', skill: 'database' },
  { key: 'vue', name: 'Vue', skill: 'frontend', family: 'javascript' },
  { key: 'react', name: 'React', skill: 'frontend', family: 'javascript' },
  { key: 'spring', name: 'Spring Boot', skill: 'backend', family: 'java' },
  { key: 'aspnet', name: 'ASP.NET Core', skill: 'backend', family: 'csharp' },
  { key: 'postgresql', name: 'PostgreSQL', skill: 'database', family: 'sql' },
  { key: 'linux', name: 'Linux', skill: 'infra' },
  { key: 'docker', name: 'Docker', skill: 'infra' },
  { key: 'go', name: 'Go', skill: 'backend', expansion: true },
  { key: 'cpp', name: 'C++', skill: 'coding', expansion: true },
  { key: 'rust', name: 'Rust', skill: 'coding', expansion: true },
  { key: 'kotlin', name: 'Kotlin', skill: 'frontend', expansion: true },
  { key: 'swift', name: 'Swift', skill: 'frontend', expansion: true },
  { key: 'angular', name: 'Angular', skill: 'frontend', family: 'typescript', expansion: true },
  { key: 'nextjs', name: 'Next.js', skill: 'frontend', family: 'react', expansion: true },
  { key: 'nodejs', name: 'Node.js', skill: 'backend', family: 'javascript', expansion: true },
  { key: 'django', name: 'Django', skill: 'backend', family: 'python', expansion: true },
  { key: 'fastapi', name: 'FastAPI', skill: 'backend', family: 'python', expansion: true },
  { key: 'laravel', name: 'Laravel', skill: 'backend', family: 'php', expansion: true },
  { key: 'mysql', name: 'MySQL', skill: 'database', family: 'sql', expansion: true },
  { key: 'redis', name: 'Redis', skill: 'database', expansion: true },
  { key: 'kubernetes', name: 'Kubernetes', skill: 'infra', family: 'docker', expansion: true },
  { key: 'aws', name: 'AWS', skill: 'infra', expansion: true },
  { key: 'azure', name: 'Azure', skill: 'infra', expansion: true },
]

export const DOMAINS = {
  inventory: '재고관리', commerce: '전자상거래', accounting: '회계·정산', operations: '서비스 운영',
} as const
export type Domain = keyof typeof DOMAINS

export const GENERAL_COURSES: Technology[] = [{ key: 'customer-interview', name: '고객 인터뷰 실습', skill: 'communication' }]
export const TRAINING_COURSES = [...GENERAL_COURSES, ...TECHNOLOGIES]

export const tech = (key: string) => TECHNOLOGIES.find((entry) => entry.key === key)
export const trainingCourse = (key: string) => TRAINING_COURSES.find((entry) => entry.key === key)
export const techName = (key: string) => trainingCourse(key)?.name ?? key

export const SHOP = {
  meal: { label: '식사 쿠폰', price: 18, effect: '스트레스 18 감소', stock: 3 },
  book: { label: '고객 인터뷰 교재', price: 34, effect: '커뮤니케이션 +3', stock: 2 },
  voucher: { label: '실습 수강권', price: 52, effect: '진행 중인 기술 교육 수료 시 노하우 +8', stock: 1 },
} as const
export type Item = keyof typeof SHOP
export const ITEMS = Object.keys(SHOP) as Item[]

export const COMPANY_STAGES = [
  { name: '개인 스튜디오', deliveries: 0, hires: 2, slots: 1 },
  { name: '소형 개발사', deliveries: 1, hires: 3, slots: 2 },
  { name: '성장 개발사', deliveries: 4, hires: 5, slots: 3 },
  { name: '전문 개발사', deliveries: 8, hires: 7, slots: 4 },
] as const

export const CLIENT_STYLES = {
  stable: { name: '명확한 요구', scopeChance: 0.13 },
  changing: { name: '잦은 요구 변경', scopeChance: 0.68 },
  urgent: { name: '촉박한 일정', scopeChance: 0.38 },
} as const
export type ClientStyle = keyof typeof CLIENT_STYLES
