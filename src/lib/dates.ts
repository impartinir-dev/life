// Dates are handled as local calendar days in "YYYY-MM-DD" form, matching the database's date type.

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function todayISO(now = new Date()): string {
  return toISODate(now)
}

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

/** Adds n periods; month and year steps clamp to the last day of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addPeriod(iso: string, unit: RepeatUnit, n: number): string {
  const { y, m, d } = parse(iso)
  if (unit === 'day' || unit === 'week') {
    return toISODate(new Date(y, m, d + n * (unit === 'week' ? 7 : 1)))
  }
  const totalMonths = m + n * (unit === 'year' ? 12 : 1)
  const ny = y + Math.floor(totalMonths / 12)
  const nm = ((totalMonths % 12) + 12) % 12
  return toISODate(new Date(ny, nm, Math.min(d, daysInMonth(ny, nm))))
}

/**
 * The due date of the next occurrence after a repeating to-do is completed.
 * Steps forward from the old due date (keeping its rhythm, e.g. "every Tuesday")
 * until the date lies after today, so a chore finished late isn't immediately overdue again.
 */
export function nextDueDate(due: string | null, unit: RepeatUnit, every: number, today: string): string {
  const start = due ?? today
  let k = 1
  let next = addPeriod(start, unit, every)
  while (next <= today) {
    k += 1
    // Always step from the original date, so month-end clamping doesn't drift (31st → 28th → 28th…).
    next = addPeriod(start, unit, every * k)
  }
  return next
}
