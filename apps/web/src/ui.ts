import { reactive } from 'vue'

export const ui = reactive({
  toast: '' as string,
  toastKind: 'info' as 'info' | 'success' | 'error',
  inboxPinnedOpen: false,
})

export const confirmDialog = reactive({
  open: false,
  title: '请确认',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
})

let confirmResolver: ((confirmed: boolean) => void) | undefined

export function requestConfirm(message: string, options: { title?: string; confirmText?: string; cancelText?: string; danger?: boolean } = {}) {
  confirmResolver?.(false)
  Object.assign(confirmDialog, {
    open: true,
    title: options.title ?? '请确认',
    message,
    confirmText: options.confirmText ?? '确认',
    cancelText: options.cancelText ?? '取消',
    danger: options.danger ?? false,
  })
  return new Promise<boolean>(resolve => { confirmResolver = resolve })
}

export function resolveConfirm(confirmed: boolean) {
  confirmDialog.open = false
  const resolve = confirmResolver
  confirmResolver = undefined
  resolve?.(confirmed)
}

let timer = 0
export function notify(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  ui.toast = message
  ui.toastKind = kind
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { ui.toast = '' }, 3200)
}

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatTime(value: number) {
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function shouldShowChatTimestamp(value: number, previous?: number) {
  if (previous === undefined) return true
  const currentDate = new Date(value)
  const previousDate = new Date(previous)
  return currentDate.toDateString() !== previousDate.toDateString() || value - previous >= 5 * 60 * 1000
}

export function formatChatTimestamp(value: number, nowValue = Date.now()) {
  const date = new Date(value)
  const now = new Date(nowValue)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const daysAgo = Math.round((today - day) / 86400000)
  if (daysAgo === 0) return time
  if (daysAgo === 1) return `昨天 ${time}`
  if (daysAgo > 1 && daysAgo < 7) return `${date.toLocaleDateString('zh-CN', { weekday: 'short' })} ${time}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export async function copyText(text: string) {
  let copied = false
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true }
  } catch { /* fall back to the legacy selection API below */ }
  if (!copied) {
    const textarea = document.createElement('textarea')
    textarea.value = text; textarea.readOnly = true; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; textarea.style.pointerEvents = 'none'
    document.body.append(textarea); textarea.select(); textarea.setSelectionRange(0, text.length)
    try { copied = Boolean(document.execCommand?.('copy')) } catch { copied = false }
    textarea.remove()
  }
  notify(copied ? '已复制到剪贴板' : '自动复制不可用，请长按显示的内容手动复制', copied ? 'success' : 'error')
  return copied
}
