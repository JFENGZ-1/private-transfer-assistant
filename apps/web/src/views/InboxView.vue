<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ArrowDown, ChevronDown, Combine, Download, Heart, Inbox, Lock, Pin, Share2, Trash2, Unlock, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { isTrusted, state } from '../state'
import type { Message } from '../types'
import { formatChatTimestamp, notify, requestConfirm, shouldShowChatTimestamp, ui } from '../ui'
import ComposerBar from '../components/ComposerBar.vue'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'
import BatchShareDialog from '../components/BatchShareDialog.vue'

const loading = ref(true); const error = ref(''); const selecting = ref(false); const selected = ref<string[]>([]); const shareOpen=ref(false); const pinnedOpen = computed({ get: () => ui.inboxPinnedOpen, set: value => { ui.inboxPinnedOpen = value } }); const awayFromLatest=computed({get:()=>ui.inboxAwayFromLatest,set:value=>{ui.inboxAwayFromLatest=value}}); const newMessageCount=computed({get:()=>ui.inboxNewMessageCount,set:value=>{ui.inboxNewMessageCount=value}})
const pinned = computed(() => state.messages.filter(m => m.pinned).sort((a,b) => b.createdAt-a.createdAt))
const regular = computed(() => state.messages.filter(m => !m.pinned).sort((a,b) => a.createdAt-b.createdAt))
const timeline = computed(() => regular.value.map((message,index,array) => ({ message, label: shouldShowChatTimestamp(message.createdAt,array[index-1]?.createdAt) ? formatChatTimestamp(message.createdAt) : '' })))
const selectedItems=computed(()=>state.messages.filter(message=>selected.value.includes(message.id)))
const allSelectedPrivate=computed(()=>Boolean(selectedItems.value.length)&&selectedItems.value.every(message=>message.visibility==='trusted_only'))
const latestLabel=computed(()=>newMessageCount.value?`${newMessageCount.value} 条新消息，回到最新`:'回到最新消息')
function isNearLatest(threshold=180){return window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-threshold}
function handleScroll(){awayFromLatest.value=!isNearLatest();if(!awayFromLatest.value)newMessageCount.value=0}
function scrollToLatest(behavior:ScrollBehavior='auto'){newMessageCount.value=0;awayFromLatest.value=false;void nextTick(()=>{window.scrollTo({top:document.documentElement.scrollHeight,behavior});window.requestAnimationFrame(handleScroll)})}
function handleLatestRequest(){scrollToLatest('smooth')}
function handleComposerWillResize(){if(!isNearLatest())return;newMessageCount.value=0;awayFromLatest.value=false;window.requestAnimationFrame(()=>{window.scrollTo({top:document.documentElement.scrollHeight,behavior:'auto'});handleScroll()})}
function togglePinned(){pinnedOpen.value=!pinnedOpen.value}
async function load(initial=false) { if(initial)loading.value = true; error.value = ''; try { state.messages = (await api.messages({ limit: 100 })).items } catch (e) { error.value = errorText(e) } finally { loading.value = false } if(initial)scrollToLatest() }
function add(message: Message) { if (!state.messages.some(m => m.id === message.id)) state.messages.unshift(message); scrollToLatest('smooth') }
function update(message: Message) { const i = state.messages.findIndex(m => m.id === message.id); if (i >= 0) state.messages[i] = message }
function remove(id: string) { state.messages = state.messages.filter(m => m.id !== id) }
function select(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(v => v !== id) : [...selected.value, id] }
function startSelection(id:string){selecting.value=true;selected.value=[id]}
function cancelSelection(){selecting.value=false;selected.value=[]}
function startMerge(id:string){selecting.value=true;selected.value=[id];notify('再选择至少一条文本消息，然后点击合并','success')}
async function mergeSelected(){const items=state.messages.filter(message=>selected.value.includes(message.id));if(items.length<2){notify('请至少选择两条消息','error');return}if(items.some(message=>message.type!=='text')){notify('只能合并文本消息','error');return}if(!await requestConfirm(`按时间顺序合并 ${items.length} 条消息到日期最早的那条？其余消息会移入回收站。`,{title:'合并消息',confirmText:'确认合并'}))return;try{await api.mergeMessages(selected.value);selected.value=[];selecting.value=false;await load();notify('已合并到最早的消息','success')}catch(e){notify(errorText(e),'error')}}
async function batch(action: 'delete'|'favorite'|'pin'|'lock'|'unlock') { try { if (action === 'delete' && !await requestConfirm(`将 ${selected.value.length} 条内容移到回收站？`,{title:'批量删除',confirmText:'移入回收站',danger:true})) return; await api.batchMessages(selected.value, action); await load(); selected.value = []; selecting.value = false; notify('批量操作已完成', 'success') } catch (e) { notify(errorText(e), 'error') } }
function togglePrivacy(){void batch(allSelectedPrivate.value?'unlock':'lock')}
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
const refresh = (event:Event) => {const nearLatest=isNearLatest(),type=(event as CustomEvent<{type?:string}>).detail?.type;void load().then(()=>{if(type==='message.created'){if(nearLatest)scrollToLatest('smooth');else{newMessageCount.value+=1;awayFromLatest.value=true}}else handleScroll()})}; const hide = (e: Event) => remove((e as CustomEvent).detail)
onMounted(() => { void load(true); window.addEventListener('scroll',handleScroll,{passive:true}); window.addEventListener('messages-changed', refresh); window.addEventListener('message-hidden', hide); window.addEventListener('inbox-scroll-latest',handleLatestRequest); window.addEventListener('composer-will-resize',handleComposerWillResize) }); onUnmounted(() => { window.removeEventListener('scroll',handleScroll); window.removeEventListener('messages-changed', refresh); window.removeEventListener('message-hidden', hide); window.removeEventListener('inbox-scroll-latest',handleLatestRequest); window.removeEventListener('composer-will-resize',handleComposerWillResize); ui.inboxAwayFromLatest=false;ui.inboxNewMessageCount=0 })
</script>
<template><section class="page inbox-page" :class="{ 'selection-active': selecting }"><header class="page-head"><div><p class="eyebrow">私人空间</p><h1>传输助手</h1></div><div class="page-head-actions"><Transition name="fade"><button v-if="!selecting && awayFromLatest" class="secondary-button compact latest-message-button" :aria-label="latestLabel" @click="scrollToLatest('smooth')"><ArrowDown :size="16"/><span>{{newMessageCount ? `${newMessageCount} 条新消息` : '回到最新'}}</span></button></Transition><button v-if="!loading && pinned.length" class="secondary-button compact pinned-toggle" :class="{ active: pinnedOpen }" :aria-expanded="pinnedOpen" @click="togglePinned"><Pin :size="16" />置顶<ChevronDown :size="15" /></button></div></header>
  <Transition name="fade"><div v-if="!loading && pinned.length && pinnedOpen" class="pinned-popover-backdrop" aria-hidden="true" @click="pinnedOpen = false" /></Transition>
  <Transition name="pinned-expand"><section v-if="!loading && pinned.length && pinnedOpen" class="pinned-section pinned-popover"><div class="section-label"><span><Pin :size="15" />置顶</span><small>{{ pinned.length }} 条</small></div><div class="message-list"><MessageCard v-for="message in pinned" :key="message.id" :message="message" select-from-menu :selectable="selecting" :selected="selected.includes(message.id)" @select="select" @selection-start="startSelection" @update="update" @remove="remove" /></div></section></Transition>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 5" :key="n" /></div>
  <EmptyState v-else-if="error" :icon="Inbox" title="暂时无法读取消息" :description="error"><button class="secondary-button" @click="load()">重试</button></EmptyState>
  <EmptyState v-else-if="!state.messages.length" :icon="Inbox" title="从第一次传递开始" description="粘贴一段文字，或从手机选择图片与文件。" />
  <template v-else><div class="message-list chat-timeline"><template v-for="entry in timeline" :key="entry.message.id"><div v-if="entry.label" class="chat-time-label">{{ entry.label }}</div><MessageCard :message="entry.message" chat select-from-menu :show-time="false" :selectable="selecting" :selected="selected.includes(entry.message.id)" @select="select" @selection-start="startSelection" @merge-start="startMerge" @update="update" @remove="remove" /></template><div class="timeline-end" aria-hidden="true" /></div></template>
  <ComposerBar v-if="!selecting" @sent="add" />
  <div v-else class="batch-bar"><span>已选 {{ selected.length }} 条</span><button :disabled="selected.length < 2" @click="mergeSelected"><Combine :size="17" />合并</button><button :disabled="!selected.length" @click="batchDownload"><Download :size="17" />下载</button><button :disabled="!selected.length" @click="batch('favorite')"><Heart :size="17" />收藏</button><button :disabled="!selected.length" @click="batch('pin')"><Pin :size="17" />置顶</button><button v-if="isTrusted" :disabled="!selected.length" :aria-pressed="allSelectedPrivate" @click="togglePrivacy"><Unlock v-if="allSelectedPrivate" :size="17"/><Lock v-else :size="17"/>{{allSelectedPrivate?'取消锁':'隐私锁'}}</button><button :disabled="!selected.length" @click="shareOpen=true"><Share2 :size="17"/>分享</button><button :disabled="!selected.length" @click="batch('delete')"><Trash2 :size="17" />删除</button><button @click="cancelSelection"><X :size="17" />取消</button></div>
  <BatchShareDialog :open="shareOpen" :messages="selectedItems" @close="shareOpen=false"/>
</section></template>
