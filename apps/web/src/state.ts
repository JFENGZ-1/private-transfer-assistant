import { computed, reactive } from 'vue'
import { api, setTemporaryToken } from './api'
import type { Device, Message, Principal, Settings, UploadTask } from './types'

export const state = reactive({
  ready: false,
  initialized: true,
  principal: null as Principal | null,
  messages: [] as Message[],
  devices: [] as Device[],
  settings: null as Settings | null,
  uploads: [] as UploadTask[],
  offline: !navigator.onLine,
})

export const isTrusted = computed(() => state.principal?.kind === 'device')
export const isAuthenticated = computed(() => Boolean(state.principal))

export async function hydrateAuth() {
  try {
    const status = await api.authStatus()
    state.initialized = status.initialized
    state.principal = status.principal
  } catch {
    state.principal = null
  } finally {
    state.ready = true
  }
}

export function acceptTemporarySession(token: string) {
  setTemporaryToken(token)
  state.principal = { sessionId: 'temporary', kind: 'temporary' }
}

export async function refreshPrincipal() {
  const status = await api.authStatus()
  state.principal = status.principal
  return status.principal
}

export function clearSession() {
  setTemporaryToken()
  state.principal = null
  state.messages = []
  state.settings = null
}

window.addEventListener('online', () => { state.offline = false })
window.addEventListener('offline', () => { state.offline = true })
