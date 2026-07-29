import { BALANCE } from '@/data/balance'
import type { MarketOffer, Requirement, SkillKey } from './types'
import { pick, randInt, uid } from './utils'

const TITLES = [
  '동네 카페 예약 페이지',
  '스터디 모임 출석 앱',
  '작은 쇼핑몰 리뉴얼',
  '사내 휴가 신청 도구',
  '포트폴리오 웹사이트',
  '설문 응답 대시보드',
  '배달 업체 랜딩',
  '동아리 게시판',
]

const CLIENTS = ['김사장', '박팀장', '이대표', '최실장', '한매니저', '윤원장']

function req(skill: SkillKey, amount: number): Requirement {
  return { skill, amount }
}

export function createForcedOffer(): MarketOffer {
  return {
    id: uid('offer'),
    title: '첫 외주: 명함 사이트',
    client: '고모님 지인',
    difficulty: 1,
    budget: 650,
    durationTicks: 24,
    bugTolerance: 25,
    requirements: [req('frontend', 12), req('coding', 10)],
    forced: true,
  }
}

export function rollMarketOffer(trust: number): MarketOffer {
  const difficulty = trust < 20 ? 1 : trust < 40 ? randInt(1, 2) : randInt(1, 3)
  const budgetRanges: Record<number, [number, number]> = {
    1: [500, 900],
    2: [1200, 2000],
    3: [3000, 5000],
  }
  const durationMap: Record<number, number> = { 1: 24, 2: 40, 3: 64 }
  const bugMap: Record<number, number> = { 1: 25, 2: 20, 3: 15 }
  const [minB, maxB] = budgetRanges[difficulty] ?? [500, 900]

  const pool: Requirement[][] = [
    [req('frontend', 14), req('coding', 10)],
    [req('backend', 14), req('database', 10)],
    [req('frontend', 10), req('backend', 10), req('coding', 8)],
    [req('database', 12), req('backend', 12)],
  ]

  return {
    id: uid('offer'),
    title: pick(TITLES),
    client: pick(CLIENTS),
    difficulty,
    budget: randInt(minB, maxB),
    durationTicks: durationMap[difficulty] ?? 24,
    bugTolerance: bugMap[difficulty] ?? 20,
    requirements: pick(pool),
  }
}

export function refreshMarket(trust: number, keepForced = false): MarketOffer[] {
  const offers: MarketOffer[] = []
  if (keepForced) offers.push(createForcedOffer())
  while (offers.length < BALANCE.MARKET_SIZE) {
    offers.push(rollMarketOffer(trust))
  }
  return offers
}
