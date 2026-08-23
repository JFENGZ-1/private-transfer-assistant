export type HighlightPart = { text: string; highlighted: boolean }

/** Parse the tiny mark-tag vocabulary emitted by SQLite FTS without using v-html. */
export function parseSnippet(value: string): HighlightPart[] {
  const parts: HighlightPart[] = []
  const tokens = value.split(/(<mark>|<\/mark>)/gi)
  let highlighted = false
  for (const token of tokens) {
    if (!token) continue
    if (/^<mark>$/i.test(token)) { highlighted = true; continue }
    if (/^<\/mark>$/i.test(token)) { highlighted = false; continue }
    parts.push({ text: token, highlighted })
  }
  return parts
}
