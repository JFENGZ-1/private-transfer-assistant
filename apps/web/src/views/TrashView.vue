<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ArchiveRestore, Layers3, Trash2, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message } from '../types'
import { notify, requestConfirm } from '../ui'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'

const items = ref<Message[]>([]); const loading = ref(true); const error = ref(''); const selecting=ref(false); const selected=ref<string[]>([]); const operating=ref(false); const trashDays=ref(-1)
async function load() { try { const [messages,retention]=await Promise.all([api.messages({trash:true,limit:100}),api.retentionSummary().catch(()=>null)]);items.value=messages.items;if(retention)trashDays.value=retention.trashDays;selected.value=selected.value.filter(id=>items.value.some(item=>item.id===id)) } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
function toggleSelection(){selecting.value=!selecting.value;selected.value=[]}
function select(id:string){selected.value=selected.value.includes(id)?selected.value.filter(value=>value!==id):[...selected.value,id]}
async function batchRestore(){if(!selected.value.length)return;operating.value=true;try{const ids=[...selected.value],result=await api.batchMessages(ids,'restore');items.value=items.value.filter(item=>!ids.includes(item.id));selected.value=[];selecting.value=false;notify(`已恢复 ${result.updated} 条内容`,'success')}catch(e){notify(errorText(e),'error')}finally{operating.value=false}}
async function batchDelete(){if(!selected.value.length||!await requestConfirm(`永久删除选中的 ${selected.value.length} 条内容？文件也可能被立即清理，此操作无法恢复。`,{title:'批量永久删除',confirmText:'永久删除',danger:true}))return;operating.value=true;try{const ids=[...selected.value],result=await api.batchMessages(ids,'purge');items.value=items.value.filter(item=>!ids.includes(item.id));selected.value=[];selecting.value=false;notify(`已永久删除 ${result.updated} 条内容`,'success')}catch(e){notify(errorText(e),'error')}finally{operating.value=false}}
onMounted(() => { load(); window.addEventListener('messages-changed', load) })
onUnmounted(() => window.removeEventListener('messages-changed', load))
</script>
<template><section class="page" :class="{'selection-active':selecting}"><header class="page-head"><div><p class="eyebrow">{{trashDays>0?`${trashDays} 天后自动清理`:'永久保留'}}</p><h1>回收站</h1></div><button v-if="!loading&&items.length" class="secondary-button compact" @click="toggleSelection"><X v-if="selecting" :size="17"/><Layers3 v-else :size="17"/>{{selecting?'取消':'多选'}}</button></header>
  <div class="status-callout"><Trash2 :size="18" />移到回收站后，原有临时分享会立即失效，恢复消息也不会自动恢复分享。</div>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 3" :key="n" /></div><EmptyState v-else-if="error" :icon="Trash2" title="回收站读取失败" :description="error" /><EmptyState v-else-if="!items.length" :icon="Trash2" title="回收站是空的" description="删除的内容会在这里暂存，防止误操作。" />
  <div v-else class="message-list"><MessageCard v-for="message in items" :key="message.id" :message="message" trash :selectable="selecting" :selected="selected.includes(message.id)" @select="select" @restore="id => items = items.filter(m => m.id !== id)" @remove="id => items = items.filter(m => m.id !== id)" /></div>
  <div v-if="selecting" class="batch-bar batch-bar--compact"><span>已选 {{selected.length}} 条</span><button :disabled="!selected.length||operating" @click="batchRestore"><ArchiveRestore :size="17"/>恢复</button><button :disabled="!selected.length||operating" @click="batchDelete"><Trash2 :size="17"/>永久删除</button><button :disabled="operating" @click="toggleSelection"><X :size="17"/>取消</button></div>
</section></template>

