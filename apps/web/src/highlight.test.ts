import { describe, expect, it } from 'vitest'
import { parseSnippet } from './highlight'

describe('safe OCR snippet parsing', () => {
  it('marks only explicit FTS mark spans', () => {
    expect(parseSnippet('订单 <mark>2026</mark> 已完成')).toEqual([
      { text: '订单 ', highlighted: false },
      { text: '2026', highlighted: true },
      { text: ' 已完成', highlighted: false },
    ])
  })

  it('keeps unrelated HTML as inert text', () => {
    expect(parseSnippet('<img src=x onerror=alert(1)>')).toEqual([
      { text: '<img src=x onerror=alert(1)>', highlighted: false },
    ])
  })
})
