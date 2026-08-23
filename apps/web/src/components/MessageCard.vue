<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import QRCode from 'qrcode'
import { ArchiveRestore, Copy, Download, Ellipsis, Eye, FileArchive, FileText, Heart, Image, Lock, Pencil, Pin, QrCode, RotateCcw, Share2, Star, Tag, Trash2, Unlock } from 'lucide-vue-next'
import type { Message } from '../types'
import { api, errorText } from '../api'
import { copyText, formatBytes, formatTime, notify } from '../ui'
import { isTrusted } from '../state'
import BaseDialog from './BaseDialog.vue'

const props = withDefaults(defineProps<{ message: Message; trash?: boolean; selectable?: boolean; selected?: boolean; showTime?: boolean }>(), { showTime: true })
const emit = defineEmits<{ update: [message: Message]; remove: [id: string]; restore: [id: string]; select: [id: string] }>()
const menu = ref(false); const menuWrap = ref<HTMLElement>(); const shareOpen = ref(false); const expiresIn = ref(3600); const maxDownloads = ref<number | null>(1); const code = ref(''); const sharing = ref(false); const shareUrl = ref('')
const editOpen = ref(false); const editTags = ref(''); const editNote = ref(''); const editSaving = ref(false)
const qrOpen = ref(false); const qrLoading = ref(false); const qrImage = ref(''); const qrValue = ref('')
const thumbTarget = ref<HTMLElement>(); const thumbUrl = ref(''); const thumbFailed = ref(false); const previewOpen = ref(false); const previewUrl = ref(''); const previewLoading = ref(false); let imageObserver: IntersectionObserver | undefined
const isImage = computed(() => props.message.mime?.startsWith('image/'))
const Icon = computed(() => isImage.value ? Image : props.message.mime?.includes('zip') ? FileArchive : FileText)
async function patch(values: Partial<Message>) { try { const updated = await api.updateMessage(props.message.id, values); emit('update', updated); menu.value = false } catch (e) { notify(errorText(e), 'error') } }
async function remove() { if (!confirm(props.trash ? '将永久删除这条内容？' : '将这条内容移到回收站？')) return; try { await api.removeMessage(props.message.id, Boolean(props.trash)); emit('remove', props.message.id) } catch (e) { notify(errorText(e), 'error') } }
async function restore() { try { await api.restoreMessage(props.message.id); emit('restore', props.message.id); notify('已恢复', 'success') } catch (e) { notify(errorText(e), 'error') } }
async function createShare() { sharing.value = true; try { const share = await api.createShare(props.message.id, { expiresIn: expiresIn.value, maxDownloads: maxDownloads.value, code: code.value || undefined }); shareUrl.value = share.url ?? `${location.origin}/s/${share.token}` } catch (e) { notify(errorText(e), 'error') } finally { sharing.value = false } }
function copy() { copyText(props.message.type === 'text' ? props.message.content ?? '' : props.message.fileName ?? '') }
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
  try { await api.downloadMessage(props.message.id, props.message.fileName ?? '下载') }
  catch (e) { notify(errorText(e), 'error') }
}
async function loadThumbnail() { if (thumbUrl.value || thumbFailed.value || props.trash) return; try { const ticket = await api.downloadTicket(props.message.id); thumbUrl.value = new URL(ticket.url, location.origin).href } catch { thumbFailed.value = true } }
async function openPreview() { previewOpen.value = true; previewLoading.value = true; previewUrl.value = ''; try { const ticket = await api.downloadTicket(props.message.id); previewUrl.value = new URL(ticket.url, location.origin).href } catch (error) { notify(errorText(error), 'error'); previewOpen.value = false } finally { previewLoading.value = false } }
function closeMenuOnOutside(event:PointerEvent) { if (menu.value && !menuWrap.value?.contains(event.target as Node)) menu.value = false }
onMounted(async () => { document.addEventListener('pointerdown', closeMenuOnOutside); if (!isImage.value || props.trash) return; await nextTick(); if (!thumbTarget.value) return; imageObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { void loadThumbnail(); imageObserver?.disconnect() } }, { rootMargin: '180px' }); imageObserver.observe(thumbTarget.value) })
onUnmounted(() => { document.removeEventListener('pointerdown', closeMenuOnOutside); imageObserver?.disconnect() })
</script>

<template>
  <article class="message-card" :class="{ private: message.visibility === 'trusted_only', selected }" @click="selectable && $emit('select', message.id)">
    <button v-if="selectable" class="check-dot" :aria-label="selected ? '取消选择' : '选择'">{{ selected ? '✓' : '' }}</button>
    <div class="message-main">
      <div v-if="message.type === 'file'" class="file-message">
        <button v-if="isImage && !trash" ref="thumbTarget" class="image-thumb" aria-label="预览图片" @click.stop="selectable ? $emit('select', message.id) : openPreview()"><img v-if="thumbUrl" :src="thumbUrl" :alt="message.fileName" loading="lazy" @error="thumbFailed = true" /><component :is="Icon" v-else :size="23" /></button>
        <div v-else class="file-icon"><component :is="Icon" :size="23" /></div>
        <div class="file-copy"><strong>{{ message.fileName }}</strong><span>{{ formatBytes(message.size) }}<template v-if="message.ocrStatus === 'pending' || message.ocrStatus === 'processing'"> · 文字识别中</template></span></div>
        <button class="icon-button soft" aria-label="下载" @click.stop="download"><Download :size="18" /></button>
      </div>
      <p v-else class="text-message">{{ message.content }}</p>
      <p v-if="message.note" class="message-note">{{ message.note }}</p>
      <div v-if="message.tags?.length" class="tags"><span v-for="tag in message.tags" :key="tag">#{{ tag }}</span></div>
      <footer class="message-meta">
        <span :title="new Date(message.createdAt).toLocaleString('zh-CN')">{{ message.sourceDeviceName || '本设备' }}<template v-if="showTime"> · {{ formatTime(message.createdAt) }}</template></span>
        <span class="message-badges"><Lock v-if="message.visibility === 'trusted_only'" :size="13" /><Pin v-if="message.pinned" :size="13" /><Heart v-if="message.favorite" :size="13" fill="currentColor" /></span>
      </footer>
    </div>
    <div ref="menuWrap" class="message-menu-wrap" @click.stop>
      <button class="icon-button message-more" aria-label="消息操作" @click="menu = !menu"><Ellipsis :size="20" /></button>
      <Transition name="fade"><div v-if="menu" class="context-menu">
        <button @click="copy"><Copy :size="17" />{{ message.type === 'text' ? '复制纯文本' : '复制文件名' }}</button>
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
      </div></Transition>
    </div>
  </article>

  <BaseDialog :open="shareOpen" title="创建临时分享" @close="shareOpen = false">
    <div v-if="shareUrl" class="stack"><div class="success-callout"><Eye :size="18" /><span>分享已创建，仅可访问这条内容。</span></div><label class="field"><span>分享链接</span><input :value="shareUrl" readonly /></label><button class="primary-button" @click="copyText(shareUrl)">复制链接</button></div>
    <form v-else class="stack" @submit.prevent="createShare">
      <label class="field"><span>有效期</span><select v-model="expiresIn"><option :value="600">10 分钟</option><option :value="3600">1 小时</option><option :value="86400">24 小时</option><option :value="604800">7 天</option></select></label>
      <label class="field"><span>最多下载</span><select v-model="maxDownloads"><option :value="1">1 次</option><option :value="5">5 次</option><option :value="null">不限</option></select></label>
      <label class="field"><span>提取码（可选）</span><input v-model="code" maxlength="32" placeholder="留空则无需提取码" /></label>
      <div v-if="message.visibility === 'trusted_only'" class="warning-callout"><Lock :size="18" />分享后，持链接者可在有效期内访问这条隐私内容。</div>
      <button class="primary-button" :disabled="sharing">{{ sharing ? '正在创建…' : '创建分享' }}</button>
    </form>
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
      <div v-if="qrImage" class="button-row"><button class="secondary-button" @click="copyText(qrValue)"><Copy :size="17" />复制内容</button><button class="primary-button" @click="saveQrImage"><Download :size="17" />保存图片</button></div>
    </div>
  </BaseDialog>
  <BaseDialog :open="previewOpen" :title="message.fileName || '图片预览'" wide @close="previewOpen = false">
    <div class="image-preview"><div v-if="previewLoading" class="image-preview-loading">正在打开原图…</div><img v-else-if="previewUrl" :src="previewUrl" :alt="message.fileName" /></div>
    <template #footer><button class="primary-button full" @click="download"><Download :size="18" />下载原图</button></template>
  </BaseDialog>
</template>
