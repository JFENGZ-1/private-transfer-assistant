<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, Eye, FileText, Lock, Share2 } from 'lucide-vue-next'
import { api, errorText } from '../api'
import type { Message } from '../types'
import { copyText, notify } from '../ui'
import BaseDialog from './BaseDialog.vue'
import CopyableValue from './CopyableValue.vue'
import ShareParameterFields from './ShareParameterFields.vue'

const props=defineProps<{open:boolean;messages:Message[]}>()
const emit=defineEmits<{close:[];created:[]}>()
const expiresIn=ref<number|null>(3600);const maxDownloads=ref<number|null>(1);const code=ref('');const sharing=ref(false);const shareUrl=ref('')
const fileCount=computed(()=>props.messages.filter(message=>message.type==='file').length)
const textCount=computed(()=>props.messages.length-fileCount.value)
const hasPrivate=computed(()=>props.messages.some(message=>message.visibility==='trusted_only'))
watch(()=>props.open,open=>{if(open){expiresIn.value=3600;maxDownloads.value=1;code.value='';shareUrl.value='';sharing.value=false}})
async function createShare(){if(!props.messages.length)return;sharing.value=true;try{const share=await api.createMultiShare(props.messages.map(message=>message.id),{expiresIn:expiresIn.value,maxDownloads:maxDownloads.value,code:code.value||undefined});shareUrl.value=share.url??`${location.origin}/s/${share.token}`;emit('created')}catch(error){notify(errorText(error),'error')}finally{sharing.value=false}}
</script>

<template>
  <BaseDialog :open="open" :title="`分享 ${messages.length} 项内容`" @close="emit('close')">
    <div v-if="shareUrl" class="stack"><div class="success-callout"><Eye :size="18"/><span>组合分享已创建，链接内包含所选的全部内容。</span></div><CopyableValue label="分享链接" :value="shareUrl"/><button class="primary-button" @click="copyText(shareUrl)"><Copy :size="17"/>复制链接</button></div>
    <form v-else class="stack" @submit.prevent="createShare">
      <div class="status-callout"><Share2 :size="18"/><span><strong>已选择 {{messages.length}} 项</strong><small>{{textCount}} 条文本 · {{fileCount}} 个文件</small></span></div>
      <ShareParameterFields v-model:expires-in="expiresIn" v-model:max-downloads="maxDownloads"/>
      <label class="field"><span>提取码（可选）</span><input v-model="code" maxlength="32" placeholder="留空则无需提取码"/></label>
      <div v-if="hasPrivate" class="warning-callout"><Lock :size="18"/>所选内容包含隐私消息，持链接者可在分享有效期内访问。</div>
      <p class="parameter-hint"><FileText :size="14"/>分享页会依次展示文本，并为每个文件提供预览或下载。</p>
      <button class="primary-button" :disabled="sharing||!messages.length">{{sharing?'正在创建…':'创建组合分享'}}</button>
    </form>
  </BaseDialog>
</template>
