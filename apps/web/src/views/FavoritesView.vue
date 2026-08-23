<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Heart, Search, Tag } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message } from '../types'
import EmptyState from '../components/EmptyState.vue'
import MessageCard from '../components/MessageCard.vue'

const items = ref<Message[]>([]); const loading = ref(true); const error = ref(''); const query = ref(''); const activeTag = ref('')
const tags = computed(() => [...new Set(items.value.flatMap(m => m.tags ?? []))])
const filtered = computed(() => items.value.filter(m => (!query.value || `${m.content} ${m.fileName} ${m.note}`.toLowerCase().includes(query.value.toLowerCase())) && (!activeTag.value || m.tags?.includes(activeTag.value))))
async function load() { try { items.value = (await api.messages({ favorites: true, limit: 100 })).items } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
onMounted(() => { load(); window.addEventListener('messages-changed', load) })
onUnmounted(() => window.removeEventListener('messages-changed', load))
</script>
<template><section class="page"><header class="page-head"><div><p class="eyebrow">长期保留</p><h1>收藏</h1></div></header>
  <label class="page-search"><Search :size="18" /><input v-model="query" placeholder="搜索收藏内容" /></label>
  <div v-if="tags.length" class="chip-row scroll"><button :class="{ active: !activeTag }" @click="activeTag = ''">全部</button><button v-for="tag in tags" :key="tag" :class="{ active: activeTag === tag }" @click="activeTag = tag"><Tag :size="13" />{{ tag }}</button></div>
  <div v-if="loading" class="skeleton-list"><i v-for="n in 4" :key="n" /></div>
  <EmptyState v-else-if="error" :icon="Heart" title="收藏读取失败" :description="error" />
  <EmptyState v-else-if="!filtered.length" :icon="Heart" :title="items.length ? '没有匹配的收藏' : '还没有收藏'" description="收藏内容不受普通自动清理规则影响。" />
  <div v-else class="message-list"><MessageCard v-for="message in filtered" :key="message.id" :message="message" @update="m => Object.assign(message, m)" @remove="id => items = items.filter(m => m.id !== id)" /></div>
</section></template>
