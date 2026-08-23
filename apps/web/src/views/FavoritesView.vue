<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Combine, Heart, Layers3, Search, Tag, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message } from '../types'
import { notify, requestConfirm } from '../ui'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'

const items = ref<Message[]>([]); const loading = ref(true); const error = ref(''); const query = ref(''); const activeTag = ref(''); const selecting = ref(false); const selected = ref<string[]>([])
const tags = computed(() => [...new Set(items.value.flatMap(m => m.tags ?? []))])
const filtered = computed(() => items.value.filter(m => (!query.value || `${m.content} ${m.fileName} ${m.note}`.toLowerCase().includes(query.value.toLowerCase())) && (!activeTag.value || m.tags?.includes(activeTag.value))))
async function load() { try { items.value = (await api.messages({ favorites: true, limit: 100 })).items } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
function select(id:string){selected.value=selected.value.includes(id)?selected.value.filter(value=>value!==id):[...selected.value,id]}
async function mergeSelected(){const chosen=items.value.filter(message=>selected.value.includes(message.id));if(chosen.length<2){notify('请至少选择两条消息','error');return}if(chosen.some(message=>message.type!=='text')){notify('只能合并文本消息','error');return}if(!await requestConfirm(`按时间顺序合并 ${chosen.length} 条收藏到日期最早的那条？其余消息会移入回收站。`,{title:'合并收藏消息',confirmText:'确认合并'}))return;try{await api.mergeMessages(selected.value);selected.value=[];selecting.value=false;await load();notify('已合并到最早的收藏消息','success')}catch(e){notify(errorText(e),'error')}}
onMounted(() => { load(); window.addEventListener('messages-changed', load) })
onUnmounted(() => window.removeEventListener('messages-changed', load))
</script>
<template><section class="page" :class="{ 'selection-active': selecting }"><header class="page-head"><div><p class="eyebrow">长期保留</p><h1>收藏</h1></div><button class="secondary-button compact" @click="selecting=!selecting;selected=[]"><X v-if="selecting" :size="17"/><Layers3 v-else :size="17"/>{{selecting?'取消':'多选'}}</button></header>
  <label class="page-search"><Search :size="18" /><input v-model="query" placeholder="搜索收藏内容" /></label>
  <div v-if="tags.length" class="chip-row scroll"><button :class="{ active: !activeTag }" @click="activeTag = ''">全部</button><button v-for="tag in tags" :key="tag" :class="{ active: activeTag === tag }" @click="activeTag = tag"><Tag :size="13" />{{ tag }}</button></div>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 4" :key="n" /></div>
  <EmptyState v-else-if="error" :icon="Heart" title="收藏读取失败" :description="error" />
  <EmptyState v-else-if="!filtered.length" :icon="Heart" :title="items.length ? '没有匹配的收藏' : '还没有收藏'" description="收藏内容不受普通自动清理规则影响。" />
  <div v-else class="message-list"><MessageCard v-for="message in filtered" :key="message.id" :message="message" :selectable="selecting" :selected="selected.includes(message.id)" @select="select" @update="m => Object.assign(message, m)" @remove="id => items = items.filter(m => m.id !== id)" /></div>
  <div v-if="selecting" class="batch-bar batch-bar--compact"><span>已选 {{selected.length}} 条</span><button :disabled="selected.length<2" @click="mergeSelected"><Combine :size="17"/>合并</button></div>
</section></template>
