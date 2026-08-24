import { reactive } from 'vue'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

const DEFAULT_SITE_TITLE = '渡口'
const DEFAULT_TAB_TITLE = '渡口 · 私人传输助手'

export const siteAppearance = reactive({
  siteTitle: DEFAULT_SITE_TITLE,
  tabTitle: DEFAULT_TAB_TITLE,
  iconVersion: 2,
})

export function pwaIconUrl(version?: number, size: 192 | 512 = 512) {
  return `${API_BASE}/appearance/icon/${size}.png${version ? `?v=${version}` : ''}`
}

function canvasPng(source: ImageBitmap, size: 192 | 512) {
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('invalid_pwa_icon')
  const scale = Math.max(size / source.width, size / source.height)
  const width = source.width * scale, height = source.height * scale
  context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('invalid_pwa_icon')), 'image/png'))
}

export async function preparePwaIcons(file: File) {
  const source = await createImageBitmap(file)
  try {
    const [icon192, icon512] = await Promise.all([canvasPng(source, 192), canvasPng(source, 512)])
    return { icon192, icon512 }
  } finally { source.close() }
}

function refreshManifest() {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (manifest) manifest.href = `${API_BASE}/appearance/manifest.webmanifest?v=${siteAppearance.iconVersion}&title=${encodeURIComponent(siteAppearance.siteTitle)}&tab=${encodeURIComponent(siteAppearance.tabTitle)}`
}

export function applySiteAppearance(value?: { siteTitle?: string; tabTitle?: string }) {
  siteAppearance.siteTitle = value?.siteTitle?.trim() || DEFAULT_SITE_TITLE
  siteAppearance.tabTitle = value?.tabTitle?.trim() || DEFAULT_TAB_TITLE
  document.title = siteAppearance.tabTitle
  refreshManifest()
}

export function applyPwaAppearance(version: number) {
  siteAppearance.iconVersion = version
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (favicon) { favicon.href = pwaIconUrl(version, 192); favicon.type = 'image/png' }
  if (appleIcon) appleIcon.href = pwaIconUrl(version, 192)
  refreshManifest()
}

export async function loadPwaAppearance() {
  try {
    const response = await fetch(`${API_BASE}/appearance`, { credentials: 'include' })
    if (!response.ok) return
    const value = await response.json() as { version?: number; siteTitle?: string; tabTitle?: string }
    applySiteAppearance(value)
    if (value.version) applyPwaAppearance(value.version)
  } catch { /* The static default icon remains available while offline. */ }
}
