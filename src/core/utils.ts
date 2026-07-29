let seq = 0

export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
