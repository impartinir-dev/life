import { describe, expect, it } from 'vitest'
import { parseItemInput, rankSuggestions } from './suggest'

describe('rankSuggestions', () => {
  const history = ['Milk', 'Bread', 'milk', 'Oat milk', 'Mints', 'Milk', 'Mince']

  it('ranks by frequency, case-insensitively', () => {
    expect(rankSuggestions(history, 'mi')).toEqual(['Milk', 'Mints', 'Mince', 'Oat milk'])
  })

  it('matches the start of any word', () => {
    expect(rankSuggestions(history, 'mil')).toEqual(['Milk', 'Oat milk'])
  })

  it('leaves out items already on the list and exact matches', () => {
    expect(rankSuggestions(history, 'mi', ['MILK'])).toEqual(['Mints', 'Mince', 'Oat milk'])
    expect(rankSuggestions(history, 'bread')).toEqual([])
  })

  it('returns nothing for empty input', () => {
    expect(rankSuggestions(history, '  ')).toEqual([])
  })
})

describe('parseItemInput', () => {
  it('reads leading and trailing quantities', () => {
    expect(parseItemInput('2x milk')).toEqual({ name: 'milk', quantity: '2' })
    expect(parseItemInput('3 × Äpfel')).toEqual({ name: 'Äpfel', quantity: '3' })
    expect(parseItemInput('eggs 10x')).toEqual({ name: 'eggs', quantity: '10' })
  })

  it('keeps plain names untouched', () => {
    expect(parseItemInput('  7up  ')).toEqual({ name: '7up', quantity: null })
    expect(parseItemInput('Xmas lights')).toEqual({ name: 'Xmas lights', quantity: null })
  })
})
