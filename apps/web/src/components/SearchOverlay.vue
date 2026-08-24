<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, CalendarDays, Combine, Download, FileSearch, Filter, Heart, Lock, Pin, Search, Settings2, Share2, Trash2, Unlock, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { isTrusted, state } from '../state'
import type { Message, SearchFilters } from '../types'
import MessageCard from './MessageCard.vue'
import EmptyState from './EmptyState.vue'
import SafeHighlight from './SafeHighlight.vue'
import BatchShareDialog from './BatchShareDialog.vue'
import { notify, requestConfirm } from '../ui'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
type Category = 'all' | 'date' | 'media' | 'file' | 'link' | 'audio' | 'source'
const categories: { key: Exclude<Category, 'all'>; label: string }[] = [
  { key: 'date', label: '日期' }, { key: 'media', label: '图片与视频' }, { key: 'file', label: '文件' },
  { key: 'link', label: '链接' }, { key: 'audio', label: '音乐与音频' }, { key: 'source', label: '来源设备' },
]
const typeByCategory = { media: 'media', file: 'file', link: 'link', audio: 'audio' } as const
const query = ref(''); const searchInput = ref<HTMLInputElement>(); const category = ref<Category>('all'); const chooser = ref<'date' | 'source' | null>(null); const dateChoice = ref('')
const filtersOpen = ref(false); const loading = ref(false); const loadingMore = ref(false); const error = ref(''); const results = ref<Message[]>([]); const pendingOcr = ref(0); const nextCursor = ref<number | null>(null); const sources = ref<{ name: string; count: number }[]>([])
const selecting=ref(false);const selected=ref<string[]>([]);const shareOpen=ref(false)
const filters = reactive<SearchFilters>({ text: true, fileName: true, imageName: true, imageText: localStorage.getItem('search-image-text') !== '0', type: 'all', favorite: false, pinned: false, privateOnly: false })
const ocrAvailable = computed(() => state.settings?.ocrEnabled !== false)
const activeLabel = computed(() => categories.find(item => item.key === category.value)?.label ?? '')
const placeholder = computed(() => category.value === 'all' ? '搜索消息、文件名…' : `搜索${activeLabel.value}`)
const canBrowse = computed(() => ['media', 'file', 'link', 'audio'].includes(category.value) || (category.value === 'date' && Boolean(filters.dateFrom)) || (category.value === 'source' && Boolean(filters.sourceName)))
const selectedItems=computed(()=>results.value.filter(message=>selected.value.includes(message.id)))
const allSelectedPrivate=computed(()=>Boolean(selectedItems.value.length)&&selectedItems.value.every(message=>message.visibility==='trusted_only'))
let timer = 0; let runVersion = 0

function resetAdvanced() { Object.assign(filters, { text: true, fileName: true, imageName: true, imageText: ocrAvailable.value, favorite: false, pinned: false, privateOnly: false }) }
function resetCategory() { category.value = 'all'; chooser.value = null; dateChoice.value = ''; Object.assign(filters, { type: 'all', sourceName: undefined, dateFrom: undefined, dateTo: undefined }); results.value = []; nextCursor.value = null; cancelSelection() }
function resetSearch() { query.value = ''; resetAdvanced(); resetCategory(); error.value = ''; pendingOcr.value = 0;cancelSelection() }
async function loadSources() { try { sources.value = (await api.searchFacets()).sources } catch { sources.value = [] } }
function chooseCategory(value: Exclude<Category, 'all'>) {
  cancelSelection(); category.value = value; query.value = ''; results.value = []; nextCursor.value = null; chooser.value = value === 'date' || value === 'source' ? value : null
  Object.assign(filters, { type: value in typeByCategory ? typeByCategory[value as keyof typeof typeByCategory] : 'all', sourceName: undefined, dateFrom: undefined, dateTo: undefined })
}
function selectDate() { if (!dateChoice.value) return; filters.dateFrom = dateChoice.value; filters.dateTo = dateChoice.value; chooser.value = null }
function selectSource(name: string) { filters.sourceName = name; chooser.value = null }
function matchLabel(message: Message) {
  return ({ text: '匹配消息文本', fileName: '匹配文件名', imageName: '匹配图片名称', ocr: '匹配图片文字' } as const)[message.matchScope ?? 'text']
}
async function run(more = false) {
  if (!query.value.trim() && !canBrowse.value) { results.value = []; nextCursor.value = null; return }
  const version = ++runVersion
  if (more) loadingMore.value = true; else loading.value = true
  error.value = ''
  try {
    const data = await api.search(query.value, filters, more ? nextCursor.value ?? undefined : undefined)
    if (version !== runVersion) return
    results.value = more ? [...results.value, ...data.items] : data.items
    selected.value=selected.value.filter(id=>results.value.some(message=>message.id===id))
    pendingOcr.value = data.pendingOcr ?? 0; nextCursor.value = data.nextCursor ?? null
  } catch (exception) { if (version === runVersion) error.value = errorText(exception) }
  finally { if (version === runVersion) { loading.value = false; loadingMore.value = false } }
}
watch([query, filters], () => {
  window.clearTimeout(timer); localStorage.setItem('search-image-text', filters.imageText ? '1' : '0')
  if (query.value.trim()) chooser.value = null
  timer = window.setTimeout(() => { void run() }, 260)
}, { deep: true })
watch(() => props.open, open => { if (open) { resetSearch(); void loadSources(); void nextTick(() => searchInput.value?.focus()) } })
function select(id:string){selected.value=selected.value.includes(id)?selected.value.filter(value=>value!==id):[...selected.value,id]}
function startSelection(id:string){selecting.value=true;selected.value=[id]}
function cancelSelection(){selecting.value=false;selected.value=[];shareOpen.value=false}
function removeResult(id:string){results.value=results.value.filter(item=>item.id!==id);selected.value=selected.value.filter(value=>value!==id);if(!selected.value.length)cancelSelection()}
async function mergeSelected(){if(selectedItems.value.length<2){notify('请至少选择两条消息','error');return}if(selectedItems.value.some(message=>message.type!=='text')){notify('只能合并文本消息','error');return}if(!await requestConfirm(`按时间顺序合并选中的 ${selectedItems.value.length} 条消息？其余消息会移入回收站。`,{title:'合并搜索结果',confirmText:'确认合并'}))return;try{await api.mergeMessages(selected.value);cancelSelection();await run();notify('已合并到最早的消息','success')}catch(reason){notify(errorText(reason),'error')}}
async function batch(action:'delete'|'favorite'|'pin'|'lock'|'unlock'){if(!selected.value.length)return;if(action==='delete'&&!await requestConfirm(`将选中的 ${selected.value.length} 条内容移到回收站？`,{title:'批量删除',confirmText:'移入回收站',danger:true}))return;try{await api.batchMessages(selected.value,action);cancelSelection();await run();notify('批量操作已完成','success')}catch(reason){notify(errorText(reason),'error')}}
function togglePrivacy(){void batch(allSelectedPrivate.value?'unlock':'lock')}
async function batchDownload(){const texts=selectedItems.value.filter(message=>message.type==='text'&&message.content).map(message=>`${new Date(message.createdAt).toLocaleString('zh-CN')}\n${message.content}`);try{if(texts.length){const url=URL.createObjectURL(new Blob([texts.join('\n\n---\n\n')],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`渡口搜索文本-${Date.now()}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}for(const message of selectedItems.value.filter(value=>value.type==='file'))await api.downloadMessage(message.id,message.fileName??'下载');notify(`已准备 ${selectedItems.value.length} 条内容的下载`,'success')}catch(reason){notify(errorText(reason),'error')}}
const refreshSearch = () => { if (query.value.trim() || canBrowse.value) void run() }
onMounted(() => window.addEventListener('messages-changed', refreshSearch))
onUnmounted(() => { window.clearTimeout(timer); window.removeEventListener('messages-changed', refreshSearch) })
</script>

<template><Teleport to="body"><Transition name="slide"><section v-if="open" class="search-overlay">
  <header class="search-head wechat-search-head"><label><Search :size="19" /><input ref="searchInput" v-model="query" :placeholder="placeholder" /><button v-if="query" class="icon-button" aria-label="清空搜索" @click="query = ''"><X :size="17" /></button></label><button class="icon-button" aria-label="搜索设置" @click="filtersOpen = true"><Settings2 :size="21" /></button><button class="search-cancel" @click="$emit('close')">取消</button></header>
  <main class="search-content" :class="{'selection-active':selecting}">
    <div v-if="category !== 'all'" class="search-scope-bar"><button class="icon-button" aria-label="返回搜索分类" @click="resetCategory"><ArrowLeft :size="19" /></button><strong>{{ activeLabel }}</strong><span v-if="!chooser && !loading">{{ results.length }} 条<template v-if="nextCursor">以上</template></span></div>
    <section v-if="category === 'all' && !query" class="search-landing"><p>搜索指定内容</p><div class="search-category-grid"><button v-for="item in categories" :key="item.key" @click="chooseCategory(item.key)">{{ item.label }}</button></div></section>
    <section v-else-if="chooser === 'date' && !query" class="search-chooser"><CalendarDays :size="28"/><h2>选择日期</h2><p>查看指定日期发送的全部内容</p><input v-model="dateChoice" type="date" @change="selectDate" /></section>
    <section v-else-if="chooser === 'source' && !query" class="search-chooser source-chooser"><h2>选择来源设备</h2><p>相同名称的设备会合并显示</p><div v-if="sources.length" class="source-choice-list"><button v-for="source in sources" :key="source.name" @click="selectSource(source.name)"><span>{{ source.name }}</span><small>{{ source.count }} 条</small></button></div><p v-else class="muted">暂无来源记录</p></section>
    <template v-else>
      <div v-if="pendingOcr" class="status-callout"><FileSearch :size="18" />还有 {{ pendingOcr }} 张图片正在识别，结果可能不完整。</div>
      <div v-if="loading" class="skeleton-list"><i v-for="n in 4" :key="n" /></div>
      <EmptyState v-else-if="error" :icon="FileSearch" title="搜索失败" :description="error"><button class="secondary-button" @click="run()">重试</button></EmptyState>
      <EmptyState v-else-if="!results.length" :icon="Filter" title="没有找到匹配内容" :description="query ? '可以尝试换个关键词或调整搜索设置' : `还没有${activeLabel}内容`" />
      <div v-else class="message-list"><div v-for="message in results" :key="message.id" class="search-result"><MessageCard :message="message" select-from-menu :selectable="selecting" :selected="selected.includes(message.id)" @select="select" @selection-start="startSelection" @update="updated => Object.assign(message, updated)" @remove="removeResult" /><div v-if="message.snippet" class="ocr-snippet"><strong>{{ matchLabel(message) }}</strong><SafeHighlight :text="message.snippet" /></div></div><button v-if="nextCursor" class="secondary-button search-more" :disabled="loadingMore" @click="run(true)">{{ loadingMore ? '正在加载…' : '加载更多' }}</button></div>
    </template>
  </main>
  <Transition name="fade"><div v-if="filtersOpen" class="dialog-backdrop" @click.self="filtersOpen = false"><section class="filter-sheet"><div class="sheet-handle" /><header><h2>搜索设置</h2><button class="text-button" @click="resetAdvanced">重置</button></header>
    <div class="toggle-list"><label><span>消息文本</span><input v-model="filters.text" type="checkbox" role="switch" /></label><label><span>文件名</span><input v-model="filters.fileName" type="checkbox" role="switch" /></label><label><span>图片名称</span><input v-model="filters.imageName" type="checkbox" role="switch" /></label><label :class="{ disabled: !ocrAvailable }"><span>图片中的文字<small v-if="!ocrAvailable">服务器 OCR 已关闭</small></span><input v-model="filters.imageText" type="checkbox" role="switch" :disabled="!ocrAvailable" /></label></div>
    <div class="chip-row"><button :class="{ active: filters.favorite }" @click="filters.favorite = !filters.favorite">仅收藏</button><button :class="{ active: filters.pinned }" @click="filters.pinned = !filters.pinned">仅置顶</button><button v-if="isTrusted" :class="{ active: filters.privateOnly }" @click="filters.privateOnly = !filters.privateOnly">仅隐私</button></div>
    <button class="primary-button full" @click="filtersOpen = false">查看搜索结果</button>
  </section></div></Transition>
  <div v-if="selecting" class="batch-bar search-batch-bar"><span>已选 {{selected.length}} 条</span><button :disabled="selected.length<2" @click="mergeSelected"><Combine :size="17"/>合并</button><button :disabled="!selected.length" @click="batchDownload"><Download :size="17"/>下载</button><button :disabled="!selected.length" @click="batch('favorite')"><Heart :size="17"/>收藏</button><button :disabled="!selected.length" @click="batch('pin')"><Pin :size="17"/>置顶</button><button v-if="isTrusted" :disabled="!selected.length" :aria-pressed="allSelectedPrivate" @click="togglePrivacy"><Unlock v-if="allSelectedPrivate" :size="17"/><Lock v-else :size="17"/>{{allSelectedPrivate?'取消锁':'隐私锁'}}</button><button :disabled="!selected.length" @click="shareOpen=true"><Share2 :size="17"/>分享</button><button :disabled="!selected.length" @click="batch('delete')"><Trash2 :size="17"/>删除</button><button @click="cancelSelection"><X :size="17"/>取消</button></div>
  <BatchShareDialog :open="shareOpen" :messages="selectedItems" @close="shareOpen=false"/>
</section></Transition></Teleport></template>

<style scoped>
.wechat-search-head{padding-inline:10px}.wechat-search-head>label{min-width:0}.search-cancel{flex:none;border:0;background:transparent;color:var(--brand);padding:8px 4px;font-weight:700;white-space:nowrap}
.search-landing{padding:86px 10px 20px;text-align:center}.search-landing>p{margin-bottom:28px;color:var(--faint);font-size:14px}.search-category-grid{display:grid;max-width:560px;grid-template-columns:repeat(3,1fr);margin:auto}.search-category-grid button{position:relative;min-height:62px;border:0;background:transparent;color:var(--brand);font-size:16px}.search-category-grid button:not(:nth-child(3n+1))::before{position:absolute;left:0;top:18px;bottom:18px;width:1px;background:var(--line);content:""}.search-scope-bar{display:flex;align-items:center;min-height:48px;margin-bottom:14px;border-bottom:1px solid var(--line)}.search-scope-bar strong{flex:1}.search-scope-bar span{color:var(--muted);font-size:12px}.search-chooser{display:flex;max-width:480px;min-height:330px;flex-direction:column;align-items:center;justify-content:center;gap:10px;margin:auto;text-align:center}.search-chooser>svg{color:var(--brand)}.search-chooser h2{font-size:19px}.search-chooser>p{color:var(--muted);font-size:13px}.search-chooser>input{max-width:280px;margin-top:8px}.source-chooser{justify-content:flex-start;padding-top:42px}.source-choice-list{width:100%;margin-top:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface);overflow:hidden}.source-choice-list button{display:flex;width:100%;align-items:center;justify-content:space-between;border:0;border-bottom:1px solid var(--line);background:transparent;padding:15px;text-align:left}.source-choice-list button:last-child{border-bottom:0}.source-choice-list small{color:var(--muted)}.search-more{align-self:center;margin:8px auto 0}
.search-content.selection-active{padding-bottom:245px}.search-batch-bar{z-index:130}
@media(max-width:420px){.wechat-search-head{gap:2px;padding-inline:6px}.wechat-search-head>.icon-button{width:36px}.search-cancel{padding-inline:3px}.search-landing{padding-top:70px}.search-category-grid button{font-size:15px}}
@media(min-width:900px){.search-batch-bar{left:max(24px,calc((100vw - 830px)/2));right:max(24px,calc((100vw - 830px)/2))}}
</style>
