<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Archive, Heart, Inbox, LogOut, Search, Settings, Share2, Trash2, UserRound, Waves } from 'lucide-vue-next'
import { api, normalizeMessage, wsProtocols } from '../api'
import { clearSession, isTrusted, state } from '../state'
import { notify, ui } from '../ui'
import SearchOverlay from '../components/SearchOverlay.vue'
import type { Message } from '../types'

const route = useRoute(); const router = useRouter(); const searchOpen = ref(false); let socket: WebSocket | undefined; let reconnectTimer = 0; let stopped = false
const nav = [{ to: '/app', label: '助手', icon: Inbox }, { to: '/app/favorites', label: '收藏', icon: Heart }, { to: '/app/transfers', label: '传输', icon: Share2 }, { to: '/app/profile', label: '我的', icon: UserRound }]
async function loadShared() { try { state.devices = (await api.devices()).items; if (isTrusted.value) state.settings = await api.settings() } catch { /* individual pages show actionable errors */ } }
async function logout() { try { await api.logout() } catch { /* local session still closes */ } clearSession(); router.replace('/login') }
function applyRealtimeEvent(event: { type?: string; id?: string; message?: unknown }) {
  if (event.type === 'message.created' && event.message) {
    const message = normalizeMessage(event.message as Message)
    if (!state.messages.some(item => item.id === message.id)) state.messages.unshift(message)
  } else if (event.type === 'message.updated' && event.message) {
    const message = normalizeMessage(event.message as Message)
    const index = state.messages.findIndex(item => item.id === message.id)
    if (index >= 0) state.messages[index] = message
    else state.messages.unshift(message)
  } else if ((event.type === 'message.deleted' || event.type === 'message.hidden') && event.id) {
    state.messages = state.messages.filter(item => item.id !== event.id)
  }
  if (event.type === 'message.hidden' && event.id) window.dispatchEvent(new CustomEvent('message-hidden', { detail: event.id }))
  if (['message.created', 'message.updated', 'message.deleted', 'message.hidden'].includes(event.type ?? '')) window.dispatchEvent(new CustomEvent('messages-changed', { detail: event }))
}
function connect() {
  if (stopped) return
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; const protocols = wsProtocols()
  socket = protocols ? new WebSocket(`${protocol}//${location.host}/ws`, protocols) : new WebSocket(`${protocol}//${location.host}/ws`)
  socket.onmessage = message => { try { applyRealtimeEvent(JSON.parse(message.data)) } catch { /* ignore malformed events */ } }
  socket.onclose = () => { if (!stopped) reconnectTimer = window.setTimeout(connect, 4000) }
}
onMounted(() => { stopped = false; loadShared(); connect() }); onUnmounted(() => { stopped = true; window.clearTimeout(reconnectTimer); socket?.close() })
</script>
<template><div class="shell">
  <aside class="sidebar"><div class="sidebar-brand"><span><Waves :size="23" /></span><strong>渡口</strong></div><nav><RouterLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ active: route.path === item.to }"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></RouterLink><RouterLink to="/app/trash" :class="{ active: route.path === '/app/trash' }"><Trash2 :size="19" /><span>回收站</span></RouterLink><RouterLink v-if="isTrusted" to="/app/settings" :class="{ active: route.path === '/app/settings' }"><Settings :size="19" /><span>设置</span></RouterLink></nav><div class="sidebar-bottom"><button @click="searchOpen = true"><Search :size="18" />搜索</button><button @click="logout"><LogOut :size="18" />退出当前设备</button></div></aside>
  <main class="shell-main"><header class="mobile-header"><div class="mobile-brand"><Waves :size="21" /><strong>渡口</strong></div><button class="icon-button" aria-label="搜索" @click="searchOpen = true"><Search :size="21" /></button></header><RouterView /></main>
  <nav class="bottom-nav"><RouterLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ active: route.path === item.to }"><component :is="item.icon" :size="21" /><span>{{ item.label }}</span></RouterLink></nav>
  <SearchOverlay :open="searchOpen" @close="searchOpen = false" />
  <Transition name="toast"><div v-if="ui.toast" class="toast" :class="ui.toastKind" role="status">{{ ui.toast }}</div></Transition>
</div></template>
