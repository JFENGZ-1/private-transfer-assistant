<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { ArchiveRestore, Combine, Copy, Download, Eye, FileArchive, FileAudio, FileCode2, FileText, Heart, Image, ListChecks, Lock, Pencil, Pin, Play, QrCode, RotateCcw, Share2, Star, Tag, Trash2, Unlock, Video } from 'lucide-vue-next'
import type { Message } from '../types'
import { api, errorText } from '../api'
import { copyText, formatBytes, formatTime, notify, requestConfirm } from '../ui'
import { isTrusted } from '../state'
import BaseDialog from './BaseDialog.vue'
import FilePreviewContent from './FilePreviewContent.vue'
import CopyableValue from './CopyableValue.vue'
import ShareParameterFields from './ShareParameterFields.vue'
import { filePreviewKind } from '../preview'

const props = withDefaults(defineProps<{ message: Message; trash?: boolean; selectable?: boolean; selected?: boolean; showTime?: boolean; chat?: boolean; selectFromMenu?: boolean; readonly?: boolean }>(), { showTime: true })
const emit = defineEmits<{ update: [message: Message]; remove: [id: string]; restore: [id: string]; select: [id: string]; 'selection-start': [id: string]; 'merge-start': [id: string] }>()
const menu = ref(false); const menuUp = ref(false); const menuMaxHeight = ref(520); const menuWrap = ref<HTMLElement>(); const menuPanel = ref<HTMLElement>(); const menuPosition = ref<{left:number;top?:number;bottom?:number}>({left:8,top:8}); const shareOpen = ref(false); const expiresIn = ref(3600); const maxDownloads = ref<number | null>(1); const code = ref(''); const sharing = ref(false); const shareUrl = ref('')
const editOpen = ref(false); const editTags = ref(''); const editNote = ref(''); const editSaving = ref(false)
const freeCopyOpen = ref(false); const freeCopyText = ref(''); const freeCopyInput = ref<HTMLTextAreaElement>()
const freeEditOpen = ref(false); const freeEditText = ref(''); const freeEditInput = ref<HTMLTextAreaElement>(); const freeEditSaving = ref(false)
const qrOpen = ref(false); const qrLoading = ref(false); const qrImage = ref(''); const qrValue = ref('')
const thumbTarget = ref<HTMLElement>(); const thumbUrl = ref(''); const thumbFailed = ref(false); const previewOpen = ref(false); const previewUrl = ref(''); const previewLoading = ref(false); const previewFailed = ref(false); let imageObserver: IntersectionObserver | undefined
const textTarget = ref<HTMLElement>(); const textExpanded = ref(false); const textOverflowing = ref(false); let textObserver: ResizeObserver | undefined
const previewKind = computed(() => filePreviewKind(props.message))
const isImage = computed(() => previewKind.value==='image')
const isVideo = computed(() => previewKind.value==='video')
const sourceLabel = computed(() => props.message.sourceDeviceName || (props.message.sourceDeviceId ? '本设备' : '临时设备'))
const Icon = computed(() => isImage.value ? Image : isVideo.value ? Video : previewKind.value==='audio' ? FileAudio : previewKind.value==='html'||previewKind.value==='text' ? FileCode2 : props.message.mime?.includes('zip') ? FileArchive : FileText)
const menuStyle = computed(() => ({ maxHeight: `${menuMaxHeight.value}px`, left: `${menuPosition.value.left}px`, top: menuPosition.value.top === undefined ? 'auto' : `${menuPosition.value.top}px`, bottom: menuPosition.value.bottom === undefined ? 'auto' : `${menuPosition.value.bottom}px` }))
async function patch(values: Partial<Message>) { try { const updated = await api.updateMessage(props.message.id, values); emit('update', updated); menu.value = false } catch (e) { notify(errorText(e), 'error') } }
async function remove() { const permanent=Boolean(props.trash); if (!await requestConfirm(permanent?'删除后无法恢复，确定永久删除这条内容？':'确定将这条内容移到回收站？',{title:permanent?'永久删除':'移到回收站',confirmText:permanent?'永久删除':'移入回收站',danger:true})) return; try { await api.removeMessage(props.message.id, permanent); emit('remove', props.message.id) } catch (e) { notify(errorText(e), 'error') } }
async function restore() { try { await api.restoreMessage(props.message.id); emit('restore', props.message.id); notify('已恢复', 'success') } catch (e) { notify(errorText(e), 'error') } }
async function createShare() { sharing.value = true; try { const share = await api.createShare(props.message.id, { expiresIn: expiresIn.value, maxDownloads: maxDownloads.value, code: code.value || undefined }); shareUrl.value = share.url ?? `${location.origin}/s/${share.token}` } catch (e) { notify(errorText(e), 'error') } finally { sharing.value = false } }
function copy() { menu.value=false; void copyText(props.message.type === 'text' ? props.message.content ?? '' : props.message.fileName ?? '') }
async function openFreeCopy() { menu.value = false; freeCopyText.value = props.message.content ?? ''; freeCopyOpen.value = true; await nextTick(); freeCopyInput.value?.focus() }
function selectAllFreeCopy() { freeCopyInput.value?.focus(); freeCopyInput.value?.select() }
async function copyFreeSelection() {
  const input = freeCopyInput.value; if (!input) return
  const selected = freeCopyText.value.slice(input.selectionStart, input.selectionEnd)
  if (!selected) { notify('请先选择要复制的文字', 'error'); return }
  try { await copyText(selected) } catch { notify('复制失败，请使用系统复制菜单', 'error') }
}
async function openFreeEdit() { menu.value = false; freeEditText.value = props.message.content ?? ''; freeEditOpen.value = true; await nextTick(); freeEditInput.value?.focus(); freeEditInput.value?.setSelectionRange(freeEditText.value.length, freeEditText.value.length) }
async function saveFreeEdit() {
  if (!freeEditText.value.trim()) { notify('消息内容不能为空', 'error'); return }
  if (freeEditText.value === (props.message.content ?? '')) { freeEditOpen.value = false; return }
  freeEditSaving.value = true
  try { const updated = await api.updateMessage(props.message.id, { content: freeEditText.value }); emit('update', updated); freeEditOpen.value = false; notify('消息已修改', 'success') }
  catch (error) { notify(errorText(error), 'error') }
  finally { freeEditSaving.value = false }
}
function startSelection() { menu.value = false; emit('selection-start', props.message.id) }
function openEditor() { editTags.value = (props.message.tags ?? []).join('，'); editNote.value = props.message.note ?? ''; editOpen.value = true; menu.value = false }
async function saveMetadata() {
  editSaving.value = true
  const tags = [...new Set(editTags.value.split(/[,，\n]/).map(value => value.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 20)
  try { await patch({ tags, note: editNote.value.trim() }); editOpen.value = false }
  finally { editSaving.value = false }
}
async function openQr() {
  menu.value = false; qrOpen.value = true; qrLoading.value = true; qrImage.value = ''
  try {
    if (props.message.type === 'text') qrValue.value = props.message.content ?? ''
    else {
      const share = await api.createShare(props.message.id, { expiresIn: 3600, maxDownloads: null })
      qrValue.value = share.url ?? `${location.origin}/s/${share.token}`
    }
    if (!qrValue.value) throw new Error('这条内容无法生成二维码')
    qrImage.value = await QRCode.toDataURL(qrValue.value, { width: 640, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#153f34', light: '#fffefa' } })
  } catch (error) { notify(error instanceof Error && /too big|code length/i.test(error.message) ? '内容过长，请先生成临时分享链接' : errorText(error), 'error'); qrOpen.value = false }
  finally { qrLoading.value = false }
}
function saveQrImage() { const link = document.createElement('a'); link.href = qrImage.value; link.download = `渡口-${props.message.fileName ?? props.message.id}.png`; link.click() }
async function download() {
  menu.value = false
  try { await api.downloadMessage(props.message.id, props.message.fileName ?? '下载') }
  catch (e) { notify(errorText(e), 'error') }
}
async function loadThumbnail() { if (thumbUrl.value || thumbFailed.value || props.trash) return; try { const ticket = await api.previewTicket(props.message.id); thumbUrl.value = new URL(ticket.url, location.origin).href } catch { thumbFailed.value = true } }
async function openPreview() { previewOpen.value = true; previewLoading.value = true; previewFailed.value = false; previewUrl.value = ''; try { const ticket = await api.previewTicket(props.message.id); previewUrl.value = new URL(ticket.url, location.origin).href } catch (error) { notify(errorText(error), 'error'); previewOpen.value = false } finally { previewLoading.value = false } }
function closePreview(){previewOpen.value=false;previewUrl.value='';previewFailed.value=false}
function measureTextOverflow() { const target = textTarget.value; if (!target || textExpanded.value) return; textOverflowing.value = target.scrollHeight > target.clientHeight + 1 }
function toggleTextExpanded() { textExpanded.value = !textExpanded.value; if (!textExpanded.value) void nextTick(measureTextOverflow) }
function toggleMenu(event: MouseEvent) { if (menu.value) { menu.value = false; return } const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(),edge=8,gap=4,width=window.innerWidth>=900?195:185,below=window.innerHeight-rect.bottom-gap-edge,above=rect.top-gap-edge; menuUp.value=below<Math.min(430,window.innerHeight*.58)&&above>below;menuMaxHeight.value=Math.max(120,Math.min(520,menuUp.value?above:below));const left=Math.max(edge,Math.min(rect.right-width,window.innerWidth-width-edge));menuPosition.value=menuUp.value?{left,bottom:Math.max(edge,window.innerHeight-rect.top+gap)}:{left,top:Math.max(edge,rect.bottom+gap)};menu.value=true }
function closeMenuOnOutside(event:PointerEvent) { const target=event.target as Node;if(menu.value&&!menuWrap.value?.contains(target)&&!menuPanel.value?.contains(target))menu.value=false }
function closeMenuOnViewportChange(){menu.value=false}
watch(() => props.message.content, async () => { textExpanded.value = false; await nextTick(); measureTextOverflow() })
onMounted(async () => { document.addEventListener('pointerdown', closeMenuOnOutside);document.addEventListener('scroll',closeMenuOnViewportChange,true);window.addEventListener('resize',closeMenuOnViewportChange); await nextTick(); measureTextOverflow(); if (textTarget.value) { textObserver = new ResizeObserver(measureTextOverflow); textObserver.observe(textTarget.value) } if (!isImage.value || props.trash || !thumbTarget.value) return; imageObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { void loadThumbnail(); imageObserver?.disconnect() } }, { rootMargin: '180px' }); imageObserver.observe(thumbTarget.value) })
onUnmounted(() => { document.removeEventListener('pointerdown', closeMenuOnOutside);document.removeEventListener('scroll',closeMenuOnViewportChange,true);window.removeEventListener('resize',closeMenuOnViewportChange); imageObserver?.disconnect(); textObserver?.disconnect() })
</script>

<template>
  <article class="message-card" :class="{ private: message.visibility === 'trusted_only', selected, chat, own: chat, readonly }" @click="selectable && $emit('select', message.id)">
    <button v-if="selectable" class="check-dot" :aria-label="selected ? '取消选择' : '选择'">{{ selected ? '✓' : '' }}</button>
    <div v-if="chat" class="chat-avatar" aria-hidden="true">我</div>
    <div class="message-main">
      <div v-if="!readonly" ref="menuWrap" class="message-menu-wrap" @click.stop>
        <button class="icon-button message-more" aria-label="消息操作" :aria-expanded="menu" @click="toggleMenu"><span class="message-more-dots" aria-hidden="true"><i /><i /></span></button>
        <Teleport to="body"><Transition name="fade"><div v-if="menu" ref="menuPanel" class="context-menu portal-menu" :class="{ 'open-up': menuUp }" :style="menuStyle">
          <button @click="copy"><Copy :size="17" />{{ message.type === 'text' ? '复制纯文本' : '复制文件名' }}</button>
          <button v-if="message.type === 'text'" @click="openFreeCopy"><Copy :size="17" />自由复制</button>
          <button v-if="message.type === 'text' && !trash" @click="openFreeEdit"><Pencil :size="17" />自由编辑</button>
          <button v-if="selectFromMenu && !selectable && !trash" @click="startSelection"><ListChecks :size="17" />多选</button>
          <button v-if="chat && message.type === 'text' && !trash" @click="menu = false; emit('merge-start', message.id)"><Combine :size="17" />合并消息</button>
          <button v-if="message.type === 'file'" @click="download"><Download :size="17" />下载</button>
          <button @click="patch({ pinned: !message.pinned })"><Pin :size="17" />{{ message.pinned ? '取消置顶' : '置顶' }}</button>
          <button @click="patch({ favorite: !message.favorite })"><Star :size="17" />{{ message.favorite ? '取消收藏' : '收藏' }}</button>
          <button v-if="!trash" @click="openEditor"><Tag :size="17" />标签与备注</button>
          <button v-if="!trash" @click="shareOpen = true; menu = false"><Share2 :size="17" />临时分享</button>
          <button v-if="!trash" @click="openQr"><QrCode :size="17" />生成二维码</button>
          <button v-if="isTrusted" @click="patch({ visibility: message.visibility === 'trusted_only' ? 'normal' : 'trusted_only' })"><Unlock v-if="message.visibility === 'trusted_only'" :size="17" /><Lock v-else :size="17" />{{ message.visibility === 'trusted_only' ? '关闭隐私锁' : '开启隐私锁' }}</button>
          <button v-if="isTrusted && isImage" @click="api.rerunOcr(message.id).then(() => notify('已加入识别队列', 'success'))"><RotateCcw :size="17" />重新识别</button>
          <button v-if="trash" @click="restore"><ArchiveRestore :size="17" />恢复</button>
          <button class="danger" @click="remove"><Trash2 :size="17" />{{ trash ? '永久删除' : '移到回收站' }}</button>
        </div></Transition></Teleport>
      </div>
      <div v-if="message.type === 'file'" class="file-message">
        <button v-if="isImage && !trash && !readonly" ref="thumbTarget" class="image-thumb" aria-label="预览图片" @click.stop="selectable ? $emit('select', message.id) : openPreview()"><img v-if="thumbUrl" :src="thumbUrl" :alt="message.fileName" loading="lazy" @error="thumbFailed = true" /><component :is="Icon" v-else :size="23" /></button>
        <div v-else-if="isImage && !trash" ref="thumbTarget" class="image-thumb"><img v-if="thumbUrl" :src="thumbUrl" :alt="message.fileName" loading="lazy" @error="thumbFailed = true" /><component :is="Icon" v-else :size="23" /></div>
        <button v-else-if="previewKind && !trash && !readonly" class="file-icon video-thumb" :aria-label="`预览${isVideo?'视频':'文件'}`" @click.stop="selectable ? $emit('select', message.id) : openPreview()"><component :is="Icon" :size="23"/><span class="video-play"><Play v-if="previewKind==='video'||previewKind==='audio'" :size="10" fill="currentColor"/><Eye v-else :size="10"/></span></button>
        <div v-else class="file-icon"><component :is="Icon" :size="23" /></div>
        <button v-if="previewKind && !isImage && !trash && !readonly" class="file-copy file-preview-copy" :aria-label="`预览${message.fileName||'文件'}`" @click.stop="selectable ? $emit('select', message.id) : openPreview()"><strong>{{ message.fileName }}</strong><span>{{ formatBytes(message.size) }}</span></button>
        <div v-else class="file-copy"><strong>{{ message.fileName }}</strong><span>{{ formatBytes(message.size) }}<template v-if="message.ocrStatus === 'pending' || message.ocrStatus === 'processing'"> · 文字识别中</template></span></div>
        <button v-if="!readonly" class="icon-button soft" aria-label="下载" @click.stop="download"><Download :size="18" /></button>
      </div>
      <div v-else class="text-message-shell" :class="{ expanded: textExpanded, overflowing: textOverflowing }"><p ref="textTarget" class="text-message" :class="{ collapsed: !textExpanded }">{{ message.content }}</p><button v-if="textOverflowing" class="text-expand" :aria-expanded="textExpanded" @click.stop="toggleTextExpanded">{{ textExpanded ? '收起' : '展开' }}</button></div>
      <p v-if="message.note" class="message-note">{{ message.note }}</p>
      <div v-if="message.tags?.length" class="tags"><span v-for="tag in message.tags" :key="tag">#{{ tag }}</span></div>
      <footer class="message-meta">
        <span :title="new Date(message.createdAt).toLocaleString('zh-CN')">{{ sourceLabel }}<template v-if="showTime"> · {{ formatTime(message.createdAt) }}</template></span>
        <span class="message-badges"><Lock v-if="message.visibility === 'trusted_only'" :size="13" /><Pin v-if="message.pinned" :size="13" /><Heart v-if="message.favorite" :size="13" fill="currentColor" /></span>
      </footer>
    </div>
  </article>

  <BaseDialog :open="shareOpen" title="创建临时分享" @close="shareOpen = false">
    <div v-if="shareUrl" class="stack"><div class="success-callout"><Eye :size="18" /><span>分享已创建，仅可访问这条内容。</span></div><CopyableValue label="分享链接" :value="shareUrl"/><button class="primary-button" @click="copyText(shareUrl)">复制链接</button></div>
    <form v-else class="stack" @submit.prevent="createShare">
      <ShareParameterFields v-model:expires-in="expiresIn" v-model:max-downloads="maxDownloads" />
      <label class="field"><span>提取码（可选）</span><input v-model="code" maxlength="32" placeholder="留空则无需提取码" /></label>
      <div v-if="message.visibility === 'trusted_only'" class="warning-callout"><Lock :size="18" />分享后，持链接者可在有效期内访问这条隐私内容。</div>
      <button class="primary-button" :disabled="sharing">{{ sharing ? '正在创建…' : '创建分享' }}</button>
    </form>
  </BaseDialog>
  <BaseDialog :open="freeCopyOpen" title="自由复制" wide @close="freeCopyOpen = false">
    <div class="stack free-copy-panel"><p class="muted">拖动选择需要的文字，再复制所选内容。</p><textarea ref="freeCopyInput" :value="freeCopyText" rows="12" readonly aria-label="自由复制文本" spellcheck="false"></textarea><div class="button-row"><button class="secondary-button" @click="selectAllFreeCopy">全选</button><button class="primary-button" @click="copyFreeSelection"><Copy :size="17" />复制所选</button></div></div>
  </BaseDialog>
  <BaseDialog :open="freeEditOpen" title="自由编辑" wide @close="freeEditOpen = false">
    <form class="stack free-edit-panel" @submit.prevent="saveFreeEdit"><p class="muted">直接修改完整内容，保存后可在消息历史中查看修改前的版本。</p><textarea ref="freeEditInput" v-model="freeEditText" rows="12" maxlength="1000000" aria-label="自由编辑文本" spellcheck="false"></textarea><div class="button-row"><button class="secondary-button" type="button" @click="freeEditOpen = false">取消</button><button class="primary-button" :disabled="freeEditSaving || !freeEditText.trim()"><Pencil :size="17" />{{ freeEditSaving ? '保存中…' : '保存修改' }}</button></div></form>
  </BaseDialog>
  <BaseDialog :open="editOpen" title="标签与备注" @close="editOpen = false">
    <form class="stack" @submit.prevent="saveMetadata">
      <label class="field"><span>标签</span><input v-model="editTags" maxlength="400" placeholder="用逗号分隔，例如：工作，待处理" /><small>最多 20 个，可用于收藏筛选。</small></label>
      <label class="field"><span>备注</span><textarea v-model="editNote" rows="4" maxlength="1000" placeholder="补充这条内容的用途或上下文" /></label>
      <button class="primary-button" :disabled="editSaving"><Pencil :size="17" />{{ editSaving ? '保存中…' : '保存' }}</button>
    </form>
  </BaseDialog>
  <BaseDialog :open="qrOpen" title="二维码" @close="qrOpen = false">
    <div class="qr-panel">
      <div v-if="qrLoading" class="qr-placeholder">正在生成…</div>
      <img v-else-if="qrImage" :src="qrImage" alt="消息二维码" />
      <p v-if="message.type === 'file'">文件二维码使用一小时临时分享链接。</p>
      <p v-else>扫码后可在其他设备上读取这段文本。</p>
      <CopyableValue v-if="qrImage" :label="message.type === 'file' ? '分享链接' : '二维码内容'" :value="qrValue" />
      <div v-if="qrImage" class="button-row"><button class="secondary-button" @click="copyText(qrValue)"><Copy :size="17" />复制内容</button><button class="primary-button" @click="saveQrImage"><Download :size="17" />保存图片</button></div>
    </div>
  </BaseDialog>
  <BaseDialog :open="previewOpen" :title="message.fileName || '文件预览'" wide @close="closePreview">
    <div class="image-preview media-preview"><div v-if="previewLoading" class="image-preview-loading">正在打开预览…</div><p v-else-if="previewFailed" class="media-preview-failed">当前浏览器无法预览该文件，请下载后查看。</p><FilePreviewContent v-else-if="previewUrl && previewKind" :kind="previewKind" :src="previewUrl" :title="message.fileName || '文件'" @error="previewFailed = true"/></div>
    <template #footer><button class="primary-button full" @click="download"><Download :size="18" />下载原文件</button></template>
  </BaseDialog>
</template>

<style scoped>
.free-copy-panel textarea, .free-edit-panel textarea { min-height: min(44dvh, 360px); white-space: pre-wrap; word-break: break-word; }
.free-copy-panel .button-row, .free-edit-panel .button-row { display: grid; grid-template-columns: 1fr 1fr; margin-top: 0; }
.free-copy-panel .button-row .secondary-button, .free-copy-panel .button-row .primary-button, .free-edit-panel .button-row .secondary-button, .free-edit-panel .button-row .primary-button { width: 100%; }
</style>
