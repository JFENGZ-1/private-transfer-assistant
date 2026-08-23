<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message } from '../types'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'

const items = ref<Message[]>([]); const loading = ref(true); const error = ref('')
async function load() { try { items.value = (await api.messages({ trash: true, limit: 100 })).items } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
onMounted(() => { load(); window.addEventListener('messages-changed', load) })
onUnmounted(() => window.removeEventListener('messages-changed', load))
</script>
<template><section class="page"><header class="page-head"><div><p class="eyebrow">七天后自动清理</p><h1>回收站</h1></div></header>
  <div class="status-callout"><Trash2 :size="18" />移到回收站后，原有临时分享会立即失效，恢复消息也不会自动恢复分享。</div>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 3" :key="n" /></div><EmptyState v-else-if="error" :icon="Trash2" title="回收站读取失败" :description="error" /><EmptyState v-else-if="!items.length" :icon="Trash2" title="回收站是空的" description="删除的内容会在这里暂存，防止误操作。" />
  <div v-else class="message-list"><MessageCard v-for="message in items" :key="message.id" :message="message" trash @restore="id => items = items.filter(m => m.id !== id)" @remove="id => items = items.filter(m => m.id !== id)" /></div>
</section></template>
