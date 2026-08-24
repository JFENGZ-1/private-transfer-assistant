// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, ui } from './ui'

const clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard')
const execCommandDescriptor=Object.getOwnPropertyDescriptor(document,'execCommand')
afterEach(() => {
  vi.useRealTimers();vi.restoreAllMocks();ui.toast=''
  if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete (navigator as {clipboard?:unknown}).clipboard
  if(execCommandDescriptor)Object.defineProperty(document,'execCommand',execCommandDescriptor);else delete (document as {execCommand?:unknown}).execCommand
})

describe('copyText', () => {
  it('falls back and tells the user to copy the visible value manually when permission is unavailable', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })

    expect(await copyText('https://example.test/long-link')).toBe(false)
    expect(ui.toast).toContain('长按显示的内容手动复制')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
