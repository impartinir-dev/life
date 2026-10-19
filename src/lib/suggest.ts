/**
 * Ranks previously bought item names for the shopping-list input.
 * `history` is newest-first; names are matched case-insensitively and
 * ranked by how often they were bought, then by how recently.
 */
export function rankSuggestions(history: string[], typed: string, exclude: string[] = [], limit = 5): string[] {
  const q = typed.trim().toLowerCase()
  if (!q) return []
  const excluded = new Set(exclude.map((n) => n.trim().toLowerCase()))
  const stats = new Map<string, { label: string; count: number; firstSeen: number }>()

  history.forEach((raw, index) => {
    const label = raw.trim()
    const key = label.toLowerCase()
    if (!key || excluded.has(key)) return
    const s = stats.get(key)
    if (s) s.count += 1
    else stats.set(key, { label, count: 1, firstSeen: index })
  })

  return [...stats.entries()]
    .filter(([key]) => key !== q && (key.startsWith(q) || key.split(/\s+/).some((word) => word.startsWith(q))))
    .sort(([ka, a], [kb, b]) => {
      // Names that start with what was typed come before mid-word matches.
      const pa = ka.startsWith(q) ? 0 : 1
      const pb = kb.startsWith(q) ? 0 : 1
      return pa - pb || b.count - a.count || a.firstSeen - b.firstSeen
    })
    .slice(0, limit)
    .map(([, s]) => s.label)
}

/** Splits "2x milk", "2 × Milch" or "milk 2x" into a quantity and a name. */
export function parseItemInput(input: string): { name: string; quantity: string | null } {
  const text = input.trim().replace(/\s+/g, ' ')
  const lead = text.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+)$/i)
  if (lead) return { quantity: lead[1], name: lead[2] }
  const trail = text.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*[x×]$/i)
  if (trail) return { quantity: trail[2], name: trail[1] }
  return { name: text, quantity: null }
}
