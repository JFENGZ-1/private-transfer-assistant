<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Download, Heart, Inbox, Layers3, Lock, Pin, Trash2, Unlock, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { isTrusted, state } from '../state'
import type { Message } from '../types'
import { formatChatTimestamp, notify, shouldShowChatTimestamp } from '../ui'
import ComposerBar from '../components/ComposerBar.vue'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'

const loading = ref(true); const error = ref(''); const selecting = ref(false); const selected = ref<string[]>([]); const timelineEnd = ref<HTMLElement>()
const pinned = computed(() => state.messages.filter(m => m.pinned).sort((a,b) => b.createdAt-a.createdAt))
const regular = computed(() => state.messages.filter(m => !m.pinned).sort((a,b) => a.createdAt-b.createdAt))
const timeline = computed(() => regular.value.map((message,index,array) => ({ message, label: shouldShowChatTimestamp(message.createdAt,array[index-1]?.createdAt) ? formatChatTimestamp(message.createdAt) : '' })))
function scrollToLatest(behavior:ScrollBehavior='auto'){void nextTick(()=>timelineEnd.value?.scrollIntoView({behavior,block:'end'}))}
async function load(initial=false) { if(initial)loading.value = true; error.value = ''; try { state.messages = (await api.messages({ limit: 100 })).items } catch (e) { error.value = errorText(e) } finally { loading.value = false } if(initial)scrollToLatest() }
function add(message: Message) { if (!state.messages.some(m => m.id === message.id)) state.messages.unshift(message); scrollToLatest('smooth') }
function update(message: Message) { const i = state.messages.findIndex(m => m.id === message.id); if (i >= 0) state.messages[i] = message }
function remove(id: string) { state.messages = state.messages.filter(m => m.id !== id) }
function select(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(v => v !== id) : [...selected.value, id] }
async function batch(action: 'delete'|'favorite'|'pin'|'lock'|'unlock') { try { if (action === 'delete' && !confirm(`将 ${selected.value.length} 条内容移到回收站？`)) return; await api.batchMessages(selected.value, action); await load(); selected.value = []; selecting.value = false; notify('批量操作已完成', 'success') } catch (e) { notify(errorText(e), 'error') } }
async function batchDownload() {
  const items = state.messages.filter(message => selected.value.includes(message.id))
  const texts = items.filter(message => message.type === 'text' && message.content).map(message => `${new Date(message.createdAt).toLocaleString('zh-CN')}\n${message.content}`)
  try {
    if (texts.length) {
      const url = URL.createObjectURL(new Blob([texts.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `渡口文本-${Date.now()}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    for (const message of items.filter(value => value.type === 'file')) await api.downloadMessage(message.id, message.fileName ?? '下载')
    notify(`已准备 ${items.length} 条内容的下载`, 'success')
  } catch (error) { notify(errorText(error), 'error') }
}
const refresh = (event:Event) => {const nearBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-180;void load().then(()=>{const type=(event as CustomEvent).detail?.type;if(type==='message.created'&&nearBottom)scrollToLatest('smooth')})}; const hide = (e: Event) => remove((e as CustomEvent).detail)
onMounted(() => { void load(true); window.addEventListener('messages-changed', refresh); window.addEventListener('message-hidden', hide) }); onUnmounted(() => { window.removeEventListener('messages-changed', refresh); window.removeEventListener('message-hidden', hide) })
</script>
<template><section class="page inbox-page"><header class="page-head"><div><p class="eyebrow">私人空间</p><h1>传输助手</h1></div><button class="secondary-button compact" @click="selecting = !selecting; selected = []"><X v-if="selecting" :size="17" /><Layers3 v-else :size="17" />{{ selecting ? '取消' : '多选' }}</button></header>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 5" :key="n" /></div>
  <EmptyState v-else-if="error" :icon="Inbox" title="暂时无法读取消息" :description="error"><button class="secondary-button" @click="load()">重试</button></EmptyState>
  <EmptyState v-else-if="!state.messages.length" :icon="Inbox" title="从第一次传递开始" description="粘贴一段文字，或从手机选择图片与文件。" />
  <template v-else><section v-if="pinned.length" class="pinned-section"><div class="section-label"><span><Pin :size="15" />置顶</span><small>{{ pinned.length }} 条</small></div><div class="message-list"><MessageCard v-for="message in pinned" :key="message.id" :message="message" :selectable="selecting" :selected="selected.includes(message.id)" @select="select" @update="update" @remove="remove" /></div></section><div class="message-list chat-timeline"><template v-for="entry in timeline" :key="entry.message.id"><div v-if="entry.label" class="chat-time-label">{{ entry.label }}</div><MessageCard :message="entry.message" :show-time="false" :selectable="selecting" :selected="selected.includes(entry.message.id)" @select="select" @update="update" @remove="remove" /></template><div ref="timelineEnd" class="timeline-end" aria-hidden="true" /></div></template>
  <ComposerBar v-if="!selecting" @sent="add" />
  <div v-else class="batch-bar"><span>已选 {{ selected.length }} 条</span><button :disabled="!selected.length" @click="batchDownload"><Download :size="17" />下载</button><button :disabled="!selected.length" @click="batch('favorite')"><Heart :size="17" />收藏</button><button :disabled="!selected.length" @click="batch('pin')"><Pin :size="17" />置顶</button><button v-if="isTrusted" :disabled="!selected.length" @click="batch('lock')"><Lock :size="17" />隐私</button><button v-if="isTrusted" :disabled="!selected.length" @click="batch('unlock')"><Unlock :size="17" />取消锁</button><button :disabled="!selected.length" @click="batch('delete')"><Trash2 :size="17" />删除</button></div>
</section></template>
