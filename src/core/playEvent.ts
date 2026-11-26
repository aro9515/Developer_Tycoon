export type PlayEventDetails = {
  projectId?: string
  customerId?: string
  trust?: number
  employeeId?: string
  technology?: string
  mode?: string
  domain?: string
  amount?: number
  cash?: number
  debt?: number
  heat?: number
  research?: number
  remaining?: number
  duration?: number
  difficulty?: number
}

export type PlayEvent = PlayEventDetails & {
  tick: number
  day: number
  week: number
  action: string
  result: string
}
