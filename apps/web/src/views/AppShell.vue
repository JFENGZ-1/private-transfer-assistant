<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Heart, Inbox, LogOut, Search, Settings, Share2, Trash2, UserRound, Waves, X } from 'lucide-vue-next'
import { api, normalizeMessage, wsProtocols } from '../api'
import { clearSession, isTrusted, state } from '../state'
import { notify, ui } from '../ui'
import SearchOverlay from '../components/SearchOverlay.vue'
import type { Message } from '../types'

const route = useRoute(); const router = useRouter(); const searchOpen = ref(false); const drawerOpen = ref(false); let socket: WebSocket | undefined; let reconnectTimer = 0; let stopped = false
const nav = [{ to: '/app', label: '助手', icon: Inbox }, { to: '/app/favorites', label: '收藏', icon: Heart }, { to: '/app/transfers', label: '传输', icon: Share2 }, { to: '/app/profile', label: '我的', icon: UserRound }]
async function loadShared() { try { state.devices = (await api.devices()).items; if (isTrusted.value) state.settings = await api.settings() } catch { /* individual pages show actionable errors */ } }
async function logout() { try { await api.logout() } catch { /* local session still closes */ } clearSession(); router.replace('/login') }
function openSearch() { drawerOpen.value = false; searchOpen.value = true }
function handleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') drawerOpen.value = false }
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
  if (['message.created', 'message.updated', 'message.deleted', 'message.hidden', 'source.renamed'].includes(event.type ?? '')) window.dispatchEvent(new CustomEvent('messages-changed', { detail: event }))
}
function connect() {
  if (stopped) return
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; const protocols = wsProtocols()
  socket = protocols ? new WebSocket(`${protocol}//${location.host}/ws`, protocols) : new WebSocket(`${protocol}//${location.host}/ws`)
  socket.onmessage = message => { try { applyRealtimeEvent(JSON.parse(message.data)) } catch { /* ignore malformed events */ } }
  socket.onclose = () => { if (!stopped) reconnectTimer = window.setTimeout(connect, 4000) }
}
watch(() => route.path, () => { drawerOpen.value = false })
onMounted(() => { stopped = false; loadShared(); connect(); window.addEventListener('keydown', handleKeydown) }); onUnmounted(() => { stopped = true; window.clearTimeout(reconnectTimer); socket?.close(); window.removeEventListener('keydown', handleKeydown) })
</script>
<template><div class="shell">
  <aside class="sidebar"><div class="sidebar-brand"><span><Waves :size="23" /></span><strong>渡口</strong></div><nav><RouterLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ active: route.path === item.to }"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></RouterLink><RouterLink to="/app/trash" :class="{ active: route.path === '/app/trash' }"><Trash2 :size="19" /><span>回收站</span></RouterLink><RouterLink v-if="isTrusted" to="/app/settings" :class="{ active: route.path === '/app/settings' }"><Settings :size="19" /><span>设置</span></RouterLink></nav><div class="sidebar-bottom"><button @click="openSearch"><Search :size="18" />搜索</button><button @click="logout"><LogOut :size="18" />退出当前设备</button></div></aside>
  <main class="shell-main"><header class="mobile-header"><button class="mobile-brand" aria-label="打开导航菜单" :aria-expanded="drawerOpen" @click="drawerOpen = true"><Waves :size="21" /><strong>渡口</strong></button><button class="icon-button" aria-label="搜索" @click="openSearch"><Search :size="21" /></button></header><RouterView /></main>
  <Transition name="drawer-fade"><div v-if="drawerOpen" class="mobile-drawer-backdrop" @click.self="drawerOpen = false"><aside class="mobile-drawer" aria-label="导航菜单"><header><div class="mobile-drawer-brand"><span><Waves :size="22" /></span><strong>渡口</strong></div><button class="icon-button" aria-label="关闭导航菜单" @click="drawerOpen = false"><X :size="21" /></button></header><nav><RouterLink v-for="item in nav" :key="item.to" :to="item.to" :class="{ active: route.path === item.to }" @click="drawerOpen = false"><component :is="item.icon" :size="20" /><span>{{ item.label }}</span></RouterLink><RouterLink to="/app/trash" :class="{ active: route.path === '/app/trash' }" @click="drawerOpen = false"><Trash2 :size="20" /><span>回收站</span></RouterLink><RouterLink v-if="isTrusted" to="/app/settings" :class="{ active: route.path === '/app/settings' }" @click="drawerOpen = false"><Settings :size="20" /><span>设置</span></RouterLink></nav><div class="mobile-drawer-bottom"><button @click="openSearch"><Search :size="19" />搜索</button><button class="danger-text" @click="logout"><LogOut :size="19" />退出当前设备</button></div></aside></div></Transition>
  <SearchOverlay :open="searchOpen" @close="searchOpen = false" />
  <Transition name="toast"><div v-if="ui.toast" class="toast" :class="ui.toastKind" role="status">{{ ui.toast }}</div></Transition>
</div></template>
