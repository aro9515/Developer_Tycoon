export const BALANCE = {
  TICKS_PER_DAY: 8,
  MS_PER_TICK_1X: 600,
  DAYS_PER_WEEK: 7,
  ADVANCE_RATIO: 0.3,
  FINAL_RATIO: 0.7,

  START_CASH: 800,
  START_TRUST: 10,
  WEEKLY_RENT: 40,
  WEEKLY_SERVER: 10,
  PLAYER_SALARY: 0,

  INTEREST_BASE: 0.03,
  SPEED_DP_PER_TICK: 1.2,
  HEAT_FROM_DP_RATIO: 0.15,
  MELTDOWN_HEAT: 85,

  BASE_PROGRESS: 4.2,
  BASE_BUG: 0.8,

  MODES: {
    normal: { progress: 1, bug: 1, debt: 1, label: '정상' },
    speed: { progress: 1.35, bug: 1.45, debt: 1.9, label: '스피드' },
  } as const,

  RESULT_PAY: {
    great: 1.2,
    success: 1.0,
    ok: 0.8,
    fail: 0.15,
  } as const,

  RESULT_TRUST: {
    great: 8,
    success: 4,
    ok: 1,
    fail: -8,
  } as const,

  MARKET_SIZE: 3,
} as const

export type WorkMode = keyof typeof BALANCE.MODES
export type ProjectResult = keyof typeof BALANCE.RESULT_PAY
