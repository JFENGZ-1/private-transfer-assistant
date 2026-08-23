import { describe, expect, it } from 'vitest'
import { formatBytes, formatChatTimestamp, formatTime, shouldShowChatTimestamp } from './ui'

describe('ui formatters', () => {
  it('formats byte values for transfer cards', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('returns a readable time label', () => {
    expect(formatTime(Date.now())).toMatch(/\d{2}:\d{2}/)
  })

  it('formats WeChat-style timeline labels and five-minute gaps', () => {
    const now = new Date(2026, 7, 23, 18, 0).getTime()
    expect(formatChatTimestamp(new Date(2026, 7, 23, 9, 8).getTime(), now)).toBe('09:08')
    expect(formatChatTimestamp(new Date(2026, 7, 22, 21, 6).getTime(), now)).toBe('昨天 21:06')
    expect(formatChatTimestamp(new Date(2025, 11, 31, 23, 59).getTime(), now)).toBe('2025年12月31日 23:59')
    expect(shouldShowChatTimestamp(now)).toBe(true)
    expect(shouldShowChatTimestamp(now, now - 4 * 60 * 1000)).toBe(false)
    expect(shouldShowChatTimestamp(now, now - 5 * 60 * 1000)).toBe(true)
  })
})
