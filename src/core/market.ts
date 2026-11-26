import { BALANCE } from '@/data/balance'
import { CLIENT_STYLES, type ClientStyle } from '@/data/rules'
import type { MarketOffer, Requirement } from './types'
import { pick, randInt, uid } from './utils'

type Work = Pick<MarketOffer, 'title' | 'domain' | 'technology' | 'alternatives' | 'requirements'>

const WORK: Work[] = [
  { title: '창고 관리자 화면 개편', domain: 'inventory', technology: 'vue', alternatives: [], requirements: [{ skill: 'frontend', amount: 14 }] },
  { title: '기업 발주 API 개편', domain: 'inventory', technology: 'spring', alternatives: [], requirements: [{ skill: 'backend', amount: 14 }, { skill: 'database', amount: 10 }] },
  { title: '사내 재고 조회 도구', domain: 'inventory', technology: 'csharp', alternatives: ['spring', 'python'], requirements: [{ skill: 'backend', amount: 14 }] },
  { title: '쇼핑몰 주문 오류 보수', domain: 'commerce', technology: 'php', alternatives: [], requirements: [{ skill: 'backend', amount: 14 }] },
  { title: '예약 현황 대시보드', domain: 'operations', technology: 'react', alternatives: ['vue'], requirements: [{ skill: 'frontend', amount: 12 }, { skill: 'communication', amount: 10 }] },
  { title: '월말 보고서 자동화', domain: 'accounting', technology: 'python', alternatives: ['csharp'], requirements: [{ skill: 'coding', amount: 18 }, { skill: 'database', amount: 10 }] },
  { title: 'Linux 서비스 장애 복구', domain: 'operations', technology: 'linux', alternatives: [], requirements: [{ skill: 'infra', amount: 15 }] },
  { title: '재고 데이터베이스 이전', domain: 'inventory', technology: 'postgresql', alternatives: [], requirements: [{ skill: 'database', amount: 13 }] },
  { title: '웹 서비스 컨테이너 전환', domain: 'operations', technology: 'docker', alternatives: [], requirements: [{ skill: 'infra', amount: 12 }, { skill: 'coding', amount: 12 }] },
]
const ADVANCED_WORK: Work[] = [
  { title: '창고 스캔 앱 구축', domain: 'inventory', technology: 'kotlin', alternatives: ['swift'], requirements: [{ skill: 'frontend', amount: 22 }, { skill: 'backend', amount: 16 }] },
  { title: '주문 이벤트 처리 서버', domain: 'commerce', technology: 'nodejs', alternatives: ['go'], requirements: [{ skill: 'backend', amount: 28 }] },
  { title: '운영 서비스 클라우드 이전', domain: 'operations', technology: 'aws', alternatives: ['azure'], requirements: [{ skill: 'infra', amount: 25 }] },
]
const CLIENTS = ['김사장', '박팀장', '이대표', '최실장', '한매니저', '윤원장']

export function createForcedOffer(): MarketOffer {
  return {
    id: uid('offer'), title: '첫 외주 · 명함 사이트', client: '고모님 지인',
    difficulty: 1, budget: 150, durationTicks: 38, bugTolerance: 25,
    requirements: [{ skill: 'frontend', amount: 12 }, { skill: 'coding', amount: 10 }],
    technology: 'javascript', alternatives: [], domain: 'operations', style: 'stable', forced: true,
  }
}

export function rollMarketOffer(trust: number, related?: Pick<MarketOffer, 'domain' | 'technology'>): MarketOffer {
  const difficulty = trust < 20 ? 1 : trust < 40 ? randInt(1, 2) : randInt(2, 3)
  const budgets = [[100, 220], [220, 360], [350, 550]] as const
  const [min, max] = budgets[difficulty - 1] ?? budgets[0]
  const style = pick(Object.keys(CLIENT_STYLES) as ClientStyle[])
  const pool = trust < 25 ? WORK : [...WORK, ...ADVANCED_WORK]
  const relevant = related ? pool.filter((work) => work.domain === related.domain) : pool
  const matching = related ? relevant.filter((work) => work.technology === related.technology) : []
  const work = pick(matching.length ? matching : relevant.length ? relevant : pool)
  const requirements: Requirement[] = work.requirements.map((requirement) => ({
    ...requirement, amount: requirement.amount + (difficulty - 1) * 4,
  }))
  return {
    ...work, requirements, style, id: uid('offer'), client: pick(CLIENTS), difficulty,
    budget: randInt(min, max), durationTicks: difficulty * 30 + (style === 'urgent' ? 0 : 16),
    bugTolerance: [25, 20, 15][difficulty - 1] ?? 25,
  }
}

export function refreshMarket(trust: number, keepForced = false, activeClients: string[] = []): MarketOffer[] {
  const offers: MarketOffer[] = keepForced ? [createForcedOffer()] : []
  while (offers.length < BALANCE.MARKET_SIZE) {
    const offer = rollMarketOffer(trust)
    const unused = CLIENTS.filter((name) => !offers.some((row) => row.client === name))
    const available = unused.filter((name) => !activeClients.includes(name))
    const pool = available.length ? available : unused
    if (pool.length && !pool.includes(offer.client)) offer.client = pick(pool)
    offers.push(offer)
  }
  return offers
}
