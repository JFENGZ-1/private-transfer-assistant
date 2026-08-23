<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, CalendarDays, FileSearch, Filter, Search, Settings2, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { isTrusted, state } from '../state'
import type { Message, SearchFilters } from '../types'
import MessageCard from './MessageCard.vue'
import EmptyState from './EmptyState.vue'
import SafeHighlight from './SafeHighlight.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const query = ref(''); const filtersOpen = ref(false); const loading = ref(false); const error = ref(''); const results = ref<Message[]>([]); const pendingOcr = ref(0)
const filters = reactive<SearchFilters>({ text: true, fileName: true, imageText: localStorage.getItem('search-image-text') !== '0', type: 'all', favorite: false, pinned: false, privateOnly: false })
const ocrAvailable = computed(() => state.settings?.ocrEnabled !== false)
let timer = 0
watch([query, filters], () => { window.clearTimeout(timer); localStorage.setItem('search-image-text', filters.imageText ? '1' : '0'); timer = window.setTimeout(run, 260) }, { deep: true })
async function run() { if (!query.value.trim()) { results.value = []; return } loading.value = true; error.value = ''; try { const data = await api.search(query.value, filters); results.value = data.items; pendingOcr.value = data.pendingOcr ?? 0 } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
function clearFilters() { Object.assign(filters, { text: true, fileName: true, imageText: ocrAvailable.value, type: 'all', deviceId: undefined, dateFrom: undefined, dateTo: undefined, favorite: false, pinned: false, privateOnly: false }) }
const refreshSearch = () => { if (query.value.trim()) void run() }
onMounted(() => window.addEventListener('messages-changed', refreshSearch))
onUnmounted(() => window.removeEventListener('messages-changed', refreshSearch))
</script>
<template><Teleport to="body"><Transition name="slide"><section v-if="open" class="search-overlay">
  <header class="search-head"><button class="icon-button" aria-label="返回" @click="$emit('close')"><ArrowLeft :size="22" /></button><label><Search :size="19" /><input v-model="query" autofocus placeholder="搜索消息、文件名…" /><button v-if="query" class="icon-button" @click="query = ''"><X :size="17" /></button></label><button class="icon-button" aria-label="搜索设置" @click="filtersOpen = true"><Settings2 :size="21" /></button></header>
  <main class="search-content">
    <div v-if="pendingOcr" class="status-callout"><FileSearch :size="18" />还有 {{ pendingOcr }} 张图片正在识别，结果可能不完整。</div>
    <div v-if="loading" class="skeleton-list"><i v-for="n in 4" :key="n" /></div>
    <EmptyState v-else-if="error" :icon="FileSearch" title="搜索失败" :description="error"><button class="secondary-button" @click="run">重试</button></EmptyState>
    <EmptyState v-else-if="!query" :icon="Search" title="搜你需要的内容" description="支持消息文本、文件名和图片中的文字" />
    <EmptyState v-else-if="!results.length" :icon="Filter" title="没有找到匹配内容" description="可以尝试换个关键词或清除筛选条件"><button class="secondary-button" @click="clearFilters">清除筛选</button></EmptyState>
    <div v-else class="message-list"><div v-for="message in results" :key="message.id" class="search-result"><MessageCard :message="message" @update="m => Object.assign(message, m)" @remove="id => results = results.filter(m => m.id !== id)" /><div v-if="message.snippet" class="ocr-snippet"><strong>{{ message.mime?.startsWith('image/') ? '匹配图片文字' : '匹配摘要' }}</strong><SafeHighlight :text="message.snippet" /></div></div></div>
  </main>
  <Transition name="fade"><div v-if="filtersOpen" class="dialog-backdrop" @click.self="filtersOpen = false"><section class="filter-sheet"><div class="sheet-handle" /><header><h2>搜索范围</h2><button class="text-button" @click="clearFilters">重置</button></header>
    <div class="toggle-list"><label><span>消息文本</span><input v-model="filters.text" type="checkbox" role="switch" /></label><label><span>文件名</span><input v-model="filters.fileName" type="checkbox" role="switch" /></label><label :class="{ disabled: !ocrAvailable }"><span>图片中的文字<small v-if="!ocrAvailable">服务器 OCR 已关闭</small></span><input v-model="filters.imageText" type="checkbox" role="switch" :disabled="!ocrAvailable" /></label></div>
    <label class="field"><span>文件类型</span><select v-model="filters.type"><option value="all">全部</option><option value="image">图片</option><option value="document">文档</option><option value="archive">压缩包</option><option value="other">其他</option></select></label>
    <label class="field"><span>来源设备</span><select v-model="filters.deviceId"><option :value="undefined">全部设备</option><option v-for="d in state.devices" :key="d.id" :value="d.id">{{ d.name }}</option></select></label>
    <div class="field"><span><CalendarDays :size="15" /> 日期范围</span><div class="date-pair"><input v-model="filters.dateFrom" type="date" /><span>至</span><input v-model="filters.dateTo" type="date" /></div></div>
    <div class="chip-row"><button :class="{ active: filters.favorite }" @click="filters.favorite = !filters.favorite">仅收藏</button><button :class="{ active: filters.pinned }" @click="filters.pinned = !filters.pinned">仅置顶</button><button v-if="isTrusted" :class="{ active: filters.privateOnly }" @click="filters.privateOnly = !filters.privateOnly">仅隐私</button></div>
    <button class="primary-button full" @click="filtersOpen = false">查看搜索结果</button>
  </section></div></Transition>
</section></Transition></Teleport></template>
