import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import type { SearchFilters } from './types'

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

  it('updates drop parameters and requests a managed link', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'drop-1', name: '编辑后', token: 'saved-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'saved-token', regenerated: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api.updateDrop('drop-1', { name: '编辑后', expiresIn: 604800, maxUploads: null, maxFileSize: 104857600, allowedTypes: ['image/*'] })
    const updateInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(fetchMock.mock.calls[0][0]).toBe('/api/drops/drop-1')
    expect(updateInit.method).toBe('PATCH')
    expect(JSON.parse(String(updateInit.body))).toEqual({ name: '编辑后', expiresIn: 604800, maxUploads: null, maxFileSize: 104857600, allowedTypes: ['image/*'] })

    expect(await api.revealDropLink('drop-1')).toEqual({ token: 'saved-token', regenerated: false })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/drops/drop-1/link')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST')
  })

  it('submits text when no file is selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, messageId: 'text-1', receipt: 'text-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()

    const result = await api.submitDrop('drop token', [], '访客', '只有文本', progress)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/public/drops/drop%20token/text')
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ content: '只有文本', name: '访客' })
    expect(result.receipt).toBe('text-1')
    expect(progress).toHaveBeenCalledWith(1, 0)
  })
})

describe('authenticated downloads', () => {
  it('requests a short-lived ticket and navigates without buffering the file', async () => {
    const assign = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'ticket', expiresAt: Date.now() + 60_000, url: '/api/downloads/ticket' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { origin: 'https://transfer.test', assign })

    await api.downloadMessage('message-1', 'large.iso')

    expect(fetchMock).toHaveBeenCalledWith('/api/messages/message-1/download-token', expect.objectContaining({ method: 'POST' }))
    expect(assign).toHaveBeenCalledWith('https://transfer.test/api/downloads/ticket')
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

describe('search scope compatibility', () => {
  it('searches image names when an older open page has no imageName state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const legacyFilters = { text: true, fileName: true, imageText: true, type: 'all', favorite: false, pinned: false, privateOnly: false } as unknown as SearchFilters

    await api.search('微信图片_20260626030925_27_169.jpg', legacyFilters)

    expect(String(fetchMock.mock.calls[0][0])).toContain('scope=text%2CfileName%2CimageName%2Cocr')
  })
})

describe('multi-message shares', () => {
  it('sends all selected ids and normalizes every public item', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'share-1', token: 'token', itemCount: 2, expiresAt: 0, downloads: 0 }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ share: { expiresAt: 0, downloads: 0, itemCount: 2 }, message: { id: 'm1', type: 'text', content: 'a' }, messages: [{ id: 'm1', type: 'text', content: 'a', favorite: 0, pinned: 0 }, { id: 'm2', type: 'file', fileName: 'b.pdf', favorite: 1, pinned: 0 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api.createMultiShare(['m1', 'm2'], { expiresIn: null, maxDownloads: 5 })
    const createdInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(createdInit.body))).toEqual({ messageIds: ['m1', 'm2'], expiresIn: null, maxDownloads: 5 })

    const opened = await api.publicShare('token')
    expect(opened.messages).toHaveLength(2)
    expect(opened.messages[1]).toMatchObject({ id: 'm2', favorite: true, pinned: false })
    expect(api.publicShareItemPreviewUrl('token', 'm2')).toContain('/public/shares/token/items/m2/preview')
  })
})
