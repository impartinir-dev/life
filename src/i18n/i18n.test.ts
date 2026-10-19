import { describe, expect, it } from 'vitest'
import { de } from './de'
import { en } from './en'
import { format } from './index'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  it('German has exactly the English keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
  })

  it('every German text uses the same placeholders as the English one', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('fills in placeholders and leaves unknown ones', () => {
    expect(format('{count} open, {x}', { count: 3 })).toBe('3 open, {x}')
  })
})
