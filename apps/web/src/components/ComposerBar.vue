<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Camera, ClipboardPaste, File, Image, Images, Paperclip, Send, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { state } from '../state'
import type { Message, UploadTask } from '../types'
import { formatBytes, notify } from '../ui'

const emit = defineEmits<{ sent: [message: Message] }>()
const content = ref(''); const open = ref(false); const fileInput = ref<HTMLInputElement>(); const imageInput = ref<HTMLInputElement>(); const textarea = ref<HTMLTextAreaElement>(); const sending = ref(false)
const dragActive = ref(false); let dragDepth = 0; let activeUploads = 0
async function sendText() { const value = content.value.trim(); if (!value || sending.value) return; sending.value = true; try { const message = await api.sendText(value); content.value = ''; emit('sent', message) } catch (e) { notify(errorText(e), 'error') } finally { sending.value = false } }
function enqueueFiles(files: File[]) {
  for (const file of files) state.uploads.push({ id: crypto.randomUUID(), file, progress: 0, status: 'queued', controller: new AbortController() })
  pumpUploads()
}
function pumpUploads() { while (activeUploads < 2) { const task = state.uploads.find(value => value.status === 'queued'); if (!task) break; void startUpload(task) } }
async function startUpload(task: UploadTask) {
  activeUploads += 1; task.status = 'uploading'
  try { const message = await api.uploadFile(task.file, undefined, value => task.progress = value, task.controller?.signal); task.status = 'done'; emit('sent', message); setTimeout(() => { const index = state.uploads.indexOf(task); if (index >= 0) state.uploads.splice(index, 1) }, 1500) }
  catch (e) { if (!task.controller?.signal.aborted) { task.status = 'error'; task.error = errorText(e) } }
  finally { activeUploads -= 1; pumpUploads() }
}
function selectFiles(event: Event) { const files = [...((event.target as HTMLInputElement).files ?? [])]; open.value = false; enqueueFiles(files); (event.target as HTMLInputElement).value = '' }
function cancel(task: UploadTask) { task.status = 'cancelled'; task.controller?.abort(); const index = state.uploads.indexOf(task); if (index >= 0) state.uploads.splice(index, 1); pumpUploads() }
function handlePaste(event: ClipboardEvent) { const images = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/')); if (!images.length) return; event.preventDefault(); enqueueFiles(images); notify(`已从剪贴板加入 ${images.length} 张图片`, 'success') }
function resizeTextarea() {
  const element = textarea.value
  if (!element) return
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const maxHeight = window.innerWidth <= 560
    ? Math.max(120, Math.min(240, viewportHeight * 0.36))
    : Math.max(160, Math.min(360, viewportHeight * 0.5))
  element.style.setProperty('--composer-max-height', `${Math.round(maxHeight)}px`)
  element.style.height = '0px'
  const height = Math.min(Math.max(element.scrollHeight, 38), maxHeight)
  element.style.height = `${Math.round(height)}px`
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
}
async function quickPaste() {
  open.value = false
  try {
    if (!navigator.clipboard) throw new Error('clipboard_unavailable')
    let pastedText = ''
    const images: File[] = []
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const extension = (imageType.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '')
          images.push(new globalThis.File([blob], `剪贴板-${Date.now()}-${images.length + 1}.${extension}`, { type: imageType }))
        }
        if (!pastedText && item.types.includes('text/plain')) pastedText = await (await item.getType('text/plain')).text()
      }
    } else pastedText = await navigator.clipboard.readText()
    if (pastedText) content.value = content.value ? `${content.value}\n${pastedText}` : pastedText
    if (images.length) enqueueFiles(images)
    if (!pastedText && !images.length) { notify('剪贴板中没有可粘贴的文本或图片', 'error'); return }
    notify(images.length ? `已粘贴${pastedText ? '文本和' : ''}${images.length} 张图片` : '已粘贴到输入框', 'success')
  } catch {
    notify('无法读取剪贴板，请允许剪贴板权限或使用系统粘贴', 'error')
  }
}
function hasDraggedFiles(event: DragEvent) { return [...(event.dataTransfer?.types ?? [])].includes('Files') }
function onDragEnter(event: DragEvent) { if (!hasDraggedFiles(event)) return; event.preventDefault(); dragDepth += 1; dragActive.value = true }
function onDragOver(event: DragEvent) { if (hasDraggedFiles(event)) event.preventDefault() }
function onDragLeave(event: DragEvent) { if (!hasDraggedFiles(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragActive.value = false }
function onDrop(event: DragEvent) { if (!hasDraggedFiles(event)) return; event.preventDefault(); const files = [...(event.dataTransfer?.files ?? [])]; dragDepth = 0; dragActive.value = false; enqueueFiles(files) }
watch(content, () => { void nextTick(resizeTextarea) })
onMounted(() => { document.addEventListener('dragenter', onDragEnter); document.addEventListener('dragover', onDragOver); document.addEventListener('dragleave', onDragLeave); document.addEventListener('drop', onDrop); window.addEventListener('resize', resizeTextarea); window.visualViewport?.addEventListener('resize', resizeTextarea); void nextTick(resizeTextarea) })
onUnmounted(() => { document.removeEventListener('dragenter', onDragEnter); document.removeEventListener('dragover', onDragOver); document.removeEventListener('dragleave', onDragLeave); document.removeEventListener('drop', onDrop); window.removeEventListener('resize', resizeTextarea); window.visualViewport?.removeEventListener('resize', resizeTextarea) })
</script>
<template>
  <div class="composer-shell">
    <div v-if="state.uploads.length" class="upload-tray"><div v-for="task in state.uploads" :key="task.id" class="upload-item"><div><strong>{{ task.file.name }}</strong><span>{{ task.status === 'error' ? task.error : task.status === 'queued' ? `${formatBytes(task.file.size)} · 等待上传` : `${formatBytes(task.file.size)} · ${Math.round(task.progress*100)}%` }}</span><div class="progress"><i :class="{ error: task.status === 'error' }" :style="{ width: `${Math.max(task.progress*100, task.status === 'error' ? 100 : 0)}%` }" /></div></div><button class="icon-button" @click="cancel(task)"><X :size="17" /></button></div></div>
    <form class="composer" @submit.prevent="sendText">
      <div class="attach-wrap"><button type="button" class="icon-button attach" aria-label="添加附件" @click="open = !open"><Paperclip :size="21" /></button><Transition name="fade"><div v-if="open" class="attach-menu"><button type="button" @click="imageInput?.click()"><Camera :size="19" /><span>拍照或相册</span></button><button type="button" @click="imageInput?.click()"><Image :size="19" /><span>选择图片</span></button><button type="button" @click="fileInput?.click()"><File :size="19" /><span>选择文件</span></button></div></Transition></div>
      <button type="button" class="icon-button attach quick-paste" aria-label="快速粘贴" title="快速粘贴" @click="quickPaste"><ClipboardPaste :size="20" /></button>
      <textarea ref="textarea" v-model="content" rows="1" placeholder="输入或粘贴内容…" @keydown.enter.exact.prevent="sendText" @paste="handlePaste" />
      <button class="send-button" :disabled="!content.trim() || sending" aria-label="发送"><Send :size="19" /></button>
      <input ref="imageInput" class="visually-hidden" type="file" accept="image/*" multiple @change="selectFiles" /><input ref="fileInput" class="visually-hidden" type="file" multiple @change="selectFiles" />
    </form>
    <Teleport to="body"><Transition name="fade"><div v-if="dragActive" class="global-drop-overlay"><div><Images :size="38" /><strong>松开以上传</strong><span>文件将加入上传队列，最多同时传输 2 个</span></div></div></Transition></Teleport>
  </div>
</template>
