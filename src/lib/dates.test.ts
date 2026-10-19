import { describe, expect, it } from 'vitest'
import { addPeriod, nextDueDate } from './dates'

describe('addPeriod', () => {
  it('adds days and weeks across month boundaries', () => {
    expect(addPeriod('2026-10-30', 'day', 3)).toBe('2026-11-02')
    expect(addPeriod('2026-12-29', 'week', 1)).toBe('2027-01-05')
  })

  it('clamps months to the last day of shorter months', () => {
    expect(addPeriod('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(addPeriod('2028-01-31', 'month', 1)).toBe('2028-02-29')
    expect(addPeriod('2026-11-15', 'month', 3)).toBe('2027-02-15')
  })

  it('handles leap days for yearly repeats', () => {
    expect(addPeriod('2028-02-29', 'year', 1)).toBe('2029-02-28')
  })
})

describe('nextDueDate', () => {
  it('moves to the next period when done on time', () => {
    expect(nextDueDate('2026-10-20', 'week', 1, '2026-10-20')).toBe('2026-10-27')
  })

  it('skips missed periods but keeps the weekday rhythm', () => {
    // Bins every Tuesday, last due 6 Oct, ticked off on Monday 19 Oct → next Tuesday.
    expect(nextDueDate('2026-10-06', 'week', 1, '2026-10-19')).toBe('2026-10-20')
  })

  it('starts from today when there was no due date', () => {
    expect(nextDueDate(null, 'month', 3, '2026-10-19')).toBe('2027-01-19')
  })

  it('does not drift at month ends', () => {
    expect(nextDueDate('2026-01-31', 'month', 1, '2026-03-01')).toBe('2026-03-31')
  })

  it('completing early still advances one period', () => {
    expect(nextDueDate('2026-11-01', 'month', 1, '2026-10-19')).toBe('2026-12-01')
  })
})
