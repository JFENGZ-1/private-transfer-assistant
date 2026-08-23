<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { BookOpen, Camera, File, Image, Images, Paperclip, Plus, Send, Trash2, X } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { state } from '../state'
import type { Message, UploadTask } from '../types'
import { formatBytes, notify } from '../ui'
import BaseDialog from './BaseDialog.vue'

const emit = defineEmits<{ sent: [message: Message] }>()
const content = ref(''); const open = ref(false); const fileInput = ref<HTMLInputElement>(); const imageInput = ref<HTMLInputElement>(); const target = ref('all'); const sending = ref(false)
type TextTemplate = { id: string; title: string; body: string; persisted: boolean }
const storedTemplates = (() => { try { return JSON.parse(localStorage.getItem('text-templates') ?? '[]') as TextTemplate[] } catch { return [] } })()
const templates = ref<TextTemplate[]>(storedTemplates.map(item => ({ ...item, persisted: true })))
const templateOpen = ref(false); const templateTitle = ref(''); const templateBody = ref(''); const persistTemplate = ref(false)
const dragActive = ref(false); let dragDepth = 0; let activeUploads = 0
const targetIds = computed(() => target.value === 'all' || target.value === 'save' ? undefined : [target.value])
async function sendText() { const value = content.value.trim(); if (!value || sending.value) return; sending.value = true; try { const message = await api.sendText(value, targetIds.value); content.value = ''; emit('sent', message) } catch (e) { notify(errorText(e), 'error') } finally { sending.value = false } }
function enqueueFiles(files: File[]) {
  const targets = targetIds.value ? [...targetIds.value] : undefined
  for (const file of files) state.uploads.push({ id: crypto.randomUUID(), file, progress: 0, status: 'queued', controller: new AbortController(), targetDeviceIds: targets })
  pumpUploads()
}
function pumpUploads() { while (activeUploads < 2) { const task = state.uploads.find(value => value.status === 'queued'); if (!task) break; void startUpload(task) } }
async function startUpload(task: UploadTask) {
  activeUploads += 1; task.status = 'uploading'
  try { const message = await api.uploadFile(task.file, task.targetDeviceIds, value => task.progress = value, task.controller?.signal); task.status = 'done'; emit('sent', message); setTimeout(() => { const index = state.uploads.indexOf(task); if (index >= 0) state.uploads.splice(index, 1) }, 1500) }
  catch (e) { if (!task.controller?.signal.aborted) { task.status = 'error'; task.error = errorText(e) } }
  finally { activeUploads -= 1; pumpUploads() }
}
function selectFiles(event: Event) { const files = [...((event.target as HTMLInputElement).files ?? [])]; open.value = false; enqueueFiles(files); (event.target as HTMLInputElement).value = '' }
function cancel(task: UploadTask) { task.status = 'cancelled'; task.controller?.abort(); const index = state.uploads.indexOf(task); if (index >= 0) state.uploads.splice(index, 1); pumpUploads() }
function handlePaste(event: ClipboardEvent) { const images = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/')); if (!images.length) return; event.preventDefault(); enqueueFiles(images); notify(`已从剪贴板加入 ${images.length} 张图片`, 'success') }
function hasDraggedFiles(event: DragEvent) { return [...(event.dataTransfer?.types ?? [])].includes('Files') }
function onDragEnter(event: DragEvent) { if (!hasDraggedFiles(event)) return; event.preventDefault(); dragDepth += 1; dragActive.value = true }
function onDragOver(event: DragEvent) { if (hasDraggedFiles(event)) event.preventDefault() }
function onDragLeave(event: DragEvent) { if (!hasDraggedFiles(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragActive.value = false }
function onDrop(event: DragEvent) { if (!hasDraggedFiles(event)) return; event.preventDefault(); const files = [...(event.dataTransfer?.files ?? [])]; dragDepth = 0; dragActive.value = false; enqueueFiles(files) }
function openTemplates() { open.value = false; templateBody.value = content.value; templateTitle.value = ''; persistTemplate.value = false; templateOpen.value = true }
function savePersistedTemplates() { localStorage.setItem('text-templates', JSON.stringify(templates.value.filter(item => item.persisted))) }
function addTemplate() {
  if (!templateTitle.value.trim() || !templateBody.value.trim()) return
  templates.value.unshift({ id: crypto.randomUUID(), title: templateTitle.value.trim(), body: templateBody.value, persisted: persistTemplate.value })
  if (persistTemplate.value) savePersistedTemplates()
  templateTitle.value = ''; templateBody.value = ''; persistTemplate.value = false
  notify('模板已添加', 'success')
}
function useTemplate(item: TextTemplate) { content.value = item.body; templateOpen.value = false }
function removeTemplate(item: TextTemplate) { templates.value = templates.value.filter(value => value.id !== item.id); if (item.persisted) savePersistedTemplates() }
onMounted(() => { document.addEventListener('dragenter', onDragEnter); document.addEventListener('dragover', onDragOver); document.addEventListener('dragleave', onDragLeave); document.addEventListener('drop', onDrop) })
onUnmounted(() => { document.removeEventListener('dragenter', onDragEnter); document.removeEventListener('dragover', onDragOver); document.removeEventListener('dragleave', onDragLeave); document.removeEventListener('drop', onDrop) })
</script>
<template>
  <div class="composer-shell">
    <div v-if="state.uploads.length" class="upload-tray"><div v-for="task in state.uploads" :key="task.id" class="upload-item"><div><strong>{{ task.file.name }}</strong><span>{{ task.status === 'error' ? task.error : task.status === 'queued' ? `${formatBytes(task.file.size)} · 等待上传` : `${formatBytes(task.file.size)} · ${Math.round(task.progress*100)}%` }}</span><div class="progress"><i :class="{ error: task.status === 'error' }" :style="{ width: `${Math.max(task.progress*100, task.status === 'error' ? 100 : 0)}%` }" /></div></div><button class="icon-button" @click="cancel(task)"><X :size="17" /></button></div></div>
    <div class="target-row"><label>发送到 <select v-model="target"><option value="all">所有设备</option><option value="save">仅保存到助手</option><option v-for="device in state.devices" :key="device.id" :value="device.id">{{ device.name }}</option></select></label></div>
    <form class="composer" @submit.prevent="sendText">
      <div class="attach-wrap"><button type="button" class="icon-button attach" aria-label="添加附件" @click="open = !open"><Paperclip :size="21" /></button><Transition name="fade"><div v-if="open" class="attach-menu"><button type="button" @click="imageInput?.click()"><Camera :size="19" /><span>拍照或相册</span></button><button type="button" @click="imageInput?.click()"><Image :size="19" /><span>选择图片</span></button><button type="button" @click="fileInput?.click()"><File :size="19" /><span>选择文件</span></button><button type="button" @click="openTemplates"><BookOpen :size="19" /><span>常用文本</span></button></div></Transition></div>
      <textarea v-model="content" rows="1" placeholder="输入或粘贴内容…" @keydown.enter.exact.prevent="sendText" @paste="handlePaste" />
      <button class="send-button" :disabled="!content.trim() || sending" aria-label="发送"><Send :size="19" /></button>
      <input ref="imageInput" class="visually-hidden" type="file" accept="image/*" multiple @change="selectFiles" /><input ref="fileInput" class="visually-hidden" type="file" multiple @change="selectFiles" />
    </form>
    <BaseDialog :open="templateOpen" title="常用文本模板" @close="templateOpen = false">
      <div class="template-list" v-if="templates.length"><article v-for="item in templates" :key="item.id"><button class="template-use" @click="useTemplate(item)"><strong>{{ item.title }}</strong><span>{{ item.body }}</span><small>{{ item.persisted ? '已保存在本设备' : '仅本次页面' }}</small></button><button class="icon-button danger-text" aria-label="删除模板" @click="removeTemplate(item)"><Trash2 :size="17" /></button></article></div>
      <form class="stack template-form" @submit.prevent="addTemplate"><div class="section-label"><span><Plus :size="15" />添加模板</span></div><label class="field"><span>名称</span><input v-model="templateTitle" maxlength="50" placeholder="例如：收货地址" /></label><label class="field"><span>内容</span><textarea v-model="templateBody" rows="4" maxlength="10000" placeholder="当前输入内容会自动带入" /></label><label class="check-row"><input v-model="persistTemplate" type="checkbox" /><span>明确保存在这台设备</span></label><p class="privacy-hint">默认只在本次页面保留。公共或临时设备上不要持久保存敏感内容。</p><button class="primary-button" :disabled="!templateTitle.trim() || !templateBody.trim()">添加模板</button></form>
    </BaseDialog>
    <Teleport to="body"><Transition name="fade"><div v-if="dragActive" class="global-drop-overlay"><div><Images :size="38" /><strong>松开以上传</strong><span>文件将加入上传队列，最多同时传输 2 个</span></div></div></Transition></Teleport>
  </div>
</template>
