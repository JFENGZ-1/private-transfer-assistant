import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

const OriginalXHR = globalThis.XMLHttpRequest

afterEach(() => { globalThis.XMLHttpRequest = OriginalXHR; vi.unstubAllGlobals() })

describe('public drop uploads', () => {
  it('sends each selected file in its own sequential request', async () => {
    const sentNames: string[] = []
    let active = 0
    let maxActive = 0

    class FakeXHR {
      upload: { onprogress?: (event: ProgressEvent) => void } = {}
      status = 201
      responseText = ''
      onerror?: () => void
      onload?: () => void
      open() {}
      send(form: FormData) {
        active += 1
        maxActive = Math.max(maxActive, active)
        const file = form.get('file') as File
        sentNames.push(file.name)
        this.responseText = JSON.stringify({ ok: true, messageId: `m-${file.name}` })
        queueMicrotask(() => {
          this.upload.onprogress?.({ lengthComputable: true, loaded: file.size, total: file.size } as ProgressEvent)
          active -= 1
          this.onload?.()
        })
      }
    }
    globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest

    const first = new File(['a'], 'a.txt')
    const second = new File(['bb'], 'b.txt')
    const progress = vi.fn()
    const result = await api.submitDrop('token', [first, second], '', '', progress)

    expect(sentNames).toEqual(['a.txt', 'b.txt'])
    expect(maxActive).toBe(1)
    expect(result.receipts).toEqual(['m-a.txt', 'm-b.txt'])
    expect(progress).toHaveBeenLastCalledWith(1, 1)
  })
})

describe('authenticated downloads', () => {
  it('requests a short-lived ticket and navigates without buffering the file', async () => {
    const click = vi.fn()
    const anchor = { href: '', rel: '', style: { display: '' }, click, remove: vi.fn() }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'ticket', expiresAt: Date.now() + 60_000, url: '/api/downloads/ticket' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { origin: 'https://transfer.test' })
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append: vi.fn() } })

    await api.downloadMessage('message-1', 'large.iso')

    expect(fetchMock).toHaveBeenCalledWith('/api/messages/message-1/download-token', expect.objectContaining({ method: 'POST' }))
    expect(anchor.href).toBe('https://transfer.test/api/downloads/ticket')
    expect(click).toHaveBeenCalledOnce()
    expect(anchor.remove).toHaveBeenCalledOnce()
  })
})

describe('settings contract', () => {
  it('forwards the complete patch without dropping fields', async () => {
    const patch = { ocrEnabled: false, retention: { imagesDays: 14, filesDays: 30, trashDays: 7 }, defaultShare: { expiresIn: 3600, maxDownloads: 5 } }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(patch), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api.updateSettings(patch)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual(patch)
  })
})
