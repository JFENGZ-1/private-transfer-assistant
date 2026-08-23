<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Clock3, Download, FileText, KeyRound, Waves } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message, Share } from '../types'
import { formatBytes, formatTime } from '../ui'

const route = useRoute()
const share = ref<Share>()
const message = ref<Message>()
const code = ref('')
const loading = ref(true)
const error = ref('')
async function load() {
  loading.value = true; error.value = ''
  try { const data = await api.publicShare(String(route.params.token), code.value || undefined); share.value = data.share; message.value = data.message }
  catch (reason) { error.value = errorText(reason) }
  finally { loading.value = false }
}
onMounted(load)
</script>
<template>
  <main class="public-page"><section class="public-card">
    <div class="public-brand"><Waves :size="22" /> 渡口临时分享</div>
    <div v-if="loading" class="skeleton-stack"><i /><i /><i /></div>
    <template v-else-if="message">
      <div class="file-hero"><FileText :size="34" /><div><h1>{{ message.fileName || '文本分享' }}</h1><p>{{ message.type === 'file' ? formatBytes(message.size) : '来自私人传输助手' }}</p></div></div>
      <div v-if="message.type === 'text'" class="shared-text">{{ message.content }}</div>
      <div v-if="share" class="meta-row"><Clock3 :size="16" /> {{ formatTime(share.expiresAt) }} 到期 <span v-if="share.maxDownloads">· 剩余 {{ Math.max(0, share.maxDownloads - share.downloads) }} 次</span></div>
      <div v-else class="meta-row"><Clock3 :size="16" />临时分享 · 有效期由发送者设定</div>
      <a v-if="message.type === 'file'" class="primary-button full" :href="api.publicShareDownloadUrl(String(route.params.token), code || undefined)"><Download :size="18" />下载文件</a>
    </template>
    <template v-else>
      <div class="empty-inline"><KeyRound :size="28" /><h1>暂时无法打开分享</h1><p>{{ error }}</p></div>
      <form v-if="error.includes('口令')" class="stack" @submit.prevent="load"><input v-model="code" placeholder="输入提取码" /><button class="primary-button">验证</button></form>
    </template>
    <p class="public-foot">请仅下载你信任的文件</p>
  </section></main>
</template>
