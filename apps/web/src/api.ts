import type { Device, DiagnosticReport, Drop, Message, OcrDiagnosticResult, OcrJobItem, OcrJobStatus, Principal, SearchFilters, Settings, Share } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
let temporaryToken = ''

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.status = status
    this.code = code
  }
}

export function setTemporaryToken(token?: string) { temporaryToken = token ?? '' }
export function hasTemporaryToken() { return Boolean(temporaryToken) }
export function wsProtocols() { return temporaryToken ? [`bearer.${temporaryToken}`] : undefined }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (temporaryToken) headers.set('Authorization', `Bearer ${temporaryToken}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string }
    throw new ApiError(response.status, body.error ?? 'request_failed', body.message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function queryString(values: Record<string, unknown>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== false) query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

function triggerFileDownload(url: string, fileName?: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'download'
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
}

export function normalizeMessage(raw: Message): Message {
  return {
    ...raw,
    favorite: Boolean(raw.favorite),
    pinned: Boolean(raw.pinned),
    tags: Array.isArray(raw.tags) ? raw.tags : (() => { try { return JSON.parse(String(raw.tags ?? '[]')) as string[] } catch { return [] } })(),
  }
}

export const api = {
  authStatus: () => request<{ initialized: boolean; principal: Principal | null }>('/auth/status'),
  initialize: (mainPassword: string, adminPassword: string) => request<{ ok: boolean }>('/auth/initialize', { method: 'POST', body: JSON.stringify({ mainPassword, adminPassword }) }),
  login: (password: string) => request<{ token: string; expiresAt: number }>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  promote: (adminPassword: string, name: string) => request<{ device: Device }>('/auth/promote', { method: 'POST', body: JSON.stringify({ adminPassword, name }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  logoutAll: (adminPassword: string) => request<{ ok: boolean }>('/auth/logout-all', { method: 'POST', body: JSON.stringify({ adminPassword }) }),
  renameCurrent: (name: string) => request<{ name: string }>('/auth/name', { method: 'PATCH', body: JSON.stringify({ name }) }),

  messages: async (params: { cursor?: string; limit?: number; favorites?: boolean; pinned?: boolean; trash?: boolean } = {}) => {
    const data = await request<{ items: Message[]; nextCursor?: string }>(`/messages${queryString({ ...params, favorite: params.favorites, favorites: undefined })}`)
    return { ...data, items: data.items.map(normalizeMessage) }
  },
  sendText: async (content: string, targetDeviceIds?: string[]) => normalizeMessage(await request<Message>('/messages', { method: 'POST', body: JSON.stringify({ content, targetDeviceIds }) })),
  uploadFile: (file: File, targetDeviceIds: string[] | undefined, onProgress: (value: number) => void, signal?: AbortSignal) => new Promise<Message>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/messages/file`)
    xhr.withCredentials = true
    if (temporaryToken) xhr.setRequestHeader('Authorization', `Bearer ${temporaryToken}`)
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total) }
    xhr.onerror = () => reject(new ApiError(0, 'network_error'))
    xhr.onabort = () => reject(new ApiError(0, 'upload_cancelled'))
    xhr.onload = () => {
      const body = (() => { try { return JSON.parse(xhr.responseText) } catch { return {} } })()
      if (xhr.status >= 200 && xhr.status < 300) resolve(normalizeMessage(body as Message))
      else reject(new ApiError(xhr.status, body.error ?? 'upload_failed', body.message))
    }
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    const form = new FormData()
    form.append('file', file)
    if (targetDeviceIds?.length) form.append('targetDeviceIds', JSON.stringify(targetDeviceIds))
    xhr.send(form)
  }),
  updateMessage: async (id: string, patch: Partial<Pick<Message, 'content' | 'favorite' | 'pinned' | 'visibility' | 'tags' | 'note'>>) => normalizeMessage(await request<Message>(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })),
  batchMessages: (ids: string[], action: 'delete' | 'restore' | 'purge' | 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'lock' | 'unlock') => request<{ updated: number }>('/messages/batch', { method: 'POST', body: JSON.stringify({ ids, action }) }),
  mergeMessages: async (ids: string[]) => normalizeMessage(await request<Message>('/messages/merge', { method: 'POST', body: JSON.stringify({ ids }) })),
  removeMessage: (id: string, permanent = false) => request<{ ok: boolean }>(`/messages/${id}${queryString({ permanent })}`, { method: 'DELETE' }),
  restoreMessage: (id: string) => request<Message>(`/messages/${id}/restore`, { method: 'POST' }),
  downloadUrl: (id: string) => `${API_BASE}/messages/${encodeURIComponent(id)}/download`,
  downloadTicket: (id: string) => request<{ token: string; expiresAt: number; url: string }>(`/messages/${encodeURIComponent(id)}/download-token`, { method: 'POST' }),
  previewTicket: (id: string) => request<{ token: string; expiresAt: number; url: string }>(`/messages/${encodeURIComponent(id)}/preview-token`, { method: 'POST' }),
  downloadMessage: async (id: string, fileName?: string) => {
    const ticket = await request<{ token: string; expiresAt: number; url: string }>(`/messages/${encodeURIComponent(id)}/download-token`, { method: 'POST' })
    triggerFileDownload(new URL(ticket.url, location.origin).href, fileName)
  },
  search: async (q: string, filters: SearchFilters, cursor?: number) => {
    const scope = [filters.text && 'text', filters.fileName && 'fileName', filters.imageName !== false && 'imageName', filters.imageText && 'ocr'].filter(Boolean).join(',')
    const data = await request<{ items: Message[]; pendingOcr?: number; nextCursor?: number | null }>(`/search${queryString({ q, images: filters.imageText, scope, type: filters.type, deviceId: filters.deviceId, sourceName: filters.sourceName, from: filters.dateFrom ? new Date(filters.dateFrom).getTime() : undefined, to: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : undefined, favorite: filters.favorite || undefined, pinned: filters.pinned || undefined, privateOnly: filters.privateOnly || undefined, cursor })}`)
    return { ...data, items: data.items.map(normalizeMessage) }
  },
  searchFacets: () => request<{ sources: { name: string; count: number }[] }>('/search/facets'),

  devices: () => request<{ items: Device[] }>('/devices'),
  revokeDevice: (id: string) => request<{ ok: boolean }>(`/devices/${id}`, { method: 'DELETE' }),
  renameDevice: (id: string, name: string) => request<Device>(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  shares: () => request<{ items: Share[] }>('/shares'),
  createShare: (messageId: string, values: { expiresIn: number | null; maxDownloads?: number | null; code?: string }) => request<Share>('/shares', { method: 'POST', body: JSON.stringify({ messageId, ...values }) }),
  createMultiShare: (messageIds: string[], values: { expiresIn: number | null; maxDownloads?: number | null; code?: string }) => request<Share>('/shares', { method: 'POST', body: JSON.stringify({ messageIds, ...values }) }),
  updateShare: (id: string, values: { expiresIn?: number | null; maxDownloads?: number | null }) => request<Share>(`/shares/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) }),
  revealShareLink: (id: string) => request<{ token: string; regenerated: boolean }>(`/shares/${encodeURIComponent(id)}/link`, { method: 'POST' }),
  revokeShare: (id: string) => request<{ ok: boolean }>(`/shares/${id}`, { method: 'DELETE' }),
  publicShare: async (token: string, code?: string) => {
    const data = await request<{ share?: Share; message: Message; messages?: Message[] }>(`/public/shares/${encodeURIComponent(token)}${queryString({ code })}`)
    const messages=(data.messages??[data.message]).map(normalizeMessage)
    return { share: data.share, message: messages[0], messages }
  },
  publicShareDownloadUrl: (token: string, code?: string) => `${API_BASE}/public/shares/${encodeURIComponent(token)}/download${queryString({ code })}`,
  publicSharePreviewUrl: (token: string, code?: string) => `${API_BASE}/public/shares/${encodeURIComponent(token)}/preview${queryString({ code })}`,
  publicShareItemDownloadUrl: (token: string, messageId: string, code?: string) => `${API_BASE}/public/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(messageId)}/download${queryString({ code })}`,
  publicShareItemPreviewUrl: (token: string, messageId: string, code?: string) => `${API_BASE}/public/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(messageId)}/preview${queryString({ code })}`,

  drops: () => request<{ items: Drop[] }>('/drops'),
  createDrop: (values: { name: string; expiresIn: number; maxUploads?: number | null; maxFileSize?: number | null; allowedTypes?: string[] }) => request<Drop>('/drops', { method: 'POST', body: JSON.stringify(values) }),
  updateDrop: (id: string, values: { name?: string; expiresIn?: number; maxUploads?: number | null; maxFileSize?: number | null; allowedTypes?: string[] }) => request<Drop>(`/drops/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) }),
  revealDropLink: (id: string) => request<{ token: string; regenerated: boolean }>(`/drops/${encodeURIComponent(id)}/link`, { method: 'POST' }),
  revokeDrop: (id: string) => request<{ ok: boolean }>(`/drops/${id}`, { method: 'DELETE' }),
  publicDrop: (token: string) => request<{ drop: Drop }>(`/public/drops/${encodeURIComponent(token)}`),
  submitDrop: async (token: string, files: File[], name: string, note: string, onProgress: (value: number, index?: number) => void) => {
    if (!files.length) {
      const result = await request<{ ok: boolean; receipt?: string; messageId?: string }>(`/public/drops/${encodeURIComponent(token)}/text`, { method: 'POST', body: JSON.stringify({ content: note, name }) })
      onProgress(1, 0)
      return { ok: true, receipt: result.receipt ?? result.messageId ?? '已送达', receipts: [result.receipt ?? result.messageId ?? '已送达'] }
    }
    const totalBytes = files.reduce((sum, file) => sum + Math.max(file.size, 1), 0)
    let completedBytes = 0
    const receipts: string[] = []
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const result = await new Promise<{ ok: boolean; receipt?: string; messageId?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE}/public/drops/${encodeURIComponent(token)}`)
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) onProgress((completedBytes + event.loaded) / totalBytes, index)
        }
        xhr.onerror = () => reject(new ApiError(0, 'network_error'))
        xhr.onload = () => {
          const body = (() => { try { return JSON.parse(xhr.responseText) } catch { return {} } })()
          xhr.status >= 200 && xhr.status < 300 ? resolve(body) : reject(new ApiError(xhr.status, body.error ?? 'upload_failed'))
        }
        const form = new FormData()
        form.append('name', name)
        form.append('note', note)
        form.append('file', file)
        xhr.send(form)
      })
      completedBytes += Math.max(file.size, 1)
      receipts.push(result.receipt ?? result.messageId ?? `${index + 1}`)
      onProgress(completedBytes / totalBytes, index)
    }
    return { ok: true, receipt: receipts.join('、'), receipts }
  },

  settings: async () => {
    const [base, ocr] = await Promise.all([request<Settings>('/settings'), request<{ enabled: boolean; counts: { status: string; count: number }[] }>('/ocr/status').catch(() => null)])
    const count = (name: string) => ocr?.counts.find(row => row.status === name)?.count ?? 0
    return { ...base, retention: base.retention ?? { imagesDays: base.retentionDays, filesDays: base.retentionDays }, ocr: { completed: count('done'), pending: count('pending'), processing: count('processing'), failed: count('failed') } }
  },
  diagnostics: () => request<DiagnosticReport>('/settings/diagnostics'),
  ocrDiagnostic: () => request<OcrDiagnosticResult>('/settings/diagnostics/ocr', { method: 'POST' }),
  retentionSummary: () => request<{ imagesDays: number; filesDays: number; trashDays: number; downloadedEarlier: boolean }>('/settings/retention'),
  ocrJobs: async (status: OcrJobStatus, offset = 0, limit = 40) => {
    const data = await request<{ items: OcrJobItem[]; total: number; nextOffset: number | null }>(`/ocr/jobs${queryString({ status, offset, limit })}`)
    return { ...data, items: data.items.map(item => ({ ...normalizeMessage(item), jobStatus: item.jobStatus, attempts: item.attempts, error: item.error, jobUpdatedAt: item.jobUpdatedAt })) as OcrJobItem[] }
  },
  updateSettings: async (patch: Partial<Settings>) => {
    const base = await request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(patch) })
    return { ...base, retention: base.retention ?? { imagesDays: base.retentionDays, filesDays: base.retentionDays } }
  },
  uploadPwaIcon: (icons: { icon192: Blob; icon512: Blob }) => { const form = new FormData(); form.append('icon192', icons.icon192, 'icon-192.png'); form.append('icon512', icons.icon512, 'icon-512.png'); return request<{ custom: boolean; version: number }>('/settings/pwa-icon', { method: 'POST', body: form }) },
  resetPwaIcon: () => request<{ custom: boolean; version: number }>('/settings/pwa-icon', { method: 'DELETE' }),
  updatePasswords: (values: { adminPassword: string; newMainPassword?: string; newAdminPassword?: string; revokeDevices?: boolean }) => request<{ ok: boolean }>('/settings/passwords', { method: 'PUT', body: JSON.stringify(values) }),
  rerunOcr: (scope: 'failed' | 'all' | string) => request<{ ok: boolean; queued?: number }>('/ocr/reindex', { method: 'POST', body: JSON.stringify(scope === 'failed' || scope === 'all' ? { scope } : { messageId: scope }) }),
  emptyTrash: (adminPassword: string) => request<{ ok: boolean }>('/trash', { method: 'DELETE', body: JSON.stringify({ adminPassword }) }),
  exportBackup: () => `${API_BASE}/settings/export`,
}

export function errorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'unknown'
  const labels: Record<string, string> = {
    invalid_password: '主口令不正确', invalid_admin_password: '管理口令不正确', invalid_code: '提取码不正确', code_required: '请输入提取码', unauthorized: '会话已失效，请重新进入',
    trusted_device_required: '此操作仅限长期设备', payload_too_large: '文件超过上传限制', file_too_large: '文件超过投递箱的单文件限制', file_type_not_allowed: '该文件类型不允许投递', storage_full: '服务器存储空间不足',
    share_expired: '分享已过期', share_revoked: '分享已撤销', download_limit_reached: '下载次数已用完', drop_expired: '投递箱已过期',
    network_error: '网络连接失败', passwords_must_differ: '主口令与管理口令必须不同', unsupported_pwa_icon: '请选择 PNG、JPEG 或 WebP 图片', pwa_icon_too_large: '应用图标不能超过 8 MB', invalid_pwa_icon: '图片无效或无法处理', merge_requires_multiple: '请至少选择两条不同的消息', merge_text_only: '只能合并文本消息', merge_targeted_not_supported: '定向消息暂不支持合并', merged_content_too_large: '合并后的文本过长', csrf_rejected: '安全校验失败，请刷新页面后重试', request_failed: '请求失败'
  }
  return labels[code] ?? (error instanceof Error ? error.message : '未知错误')
}
