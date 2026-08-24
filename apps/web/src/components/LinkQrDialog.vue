<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink } from 'lucide-vue-next'
import BaseDialog from './BaseDialog.vue'
import CopyableValue from './CopyableValue.vue'
import { copyText, notify } from '../ui'

const props = defineProps<{ open: boolean; title: string; link: string; description?: string }>()
const emit = defineEmits<{ close: [] }>()
const qrImage=ref('');const loading=ref(false)

watch(()=>[props.open,props.link] as const,async([open,link])=>{if(!open||!link){qrImage.value='';return}loading.value=true;try{qrImage.value=await QRCode.toDataURL(link,{width:640,margin:2,errorCorrectionLevel:'M',color:{dark:'#153f34',light:'#fffefa'}})}catch{notify('二维码生成失败','error')}finally{loading.value=false}},{immediate:true})
function saveQr(){if(!qrImage.value)return;const anchor=document.createElement('a');anchor.href=qrImage.value;anchor.download=`渡口投递二维码-${Date.now()}.png`;anchor.click()}
</script>

<template>
  <BaseDialog :open="open" :title="title" @close="emit('close')">
    <div class="qr-panel link-qr-panel">
      <div v-if="loading" class="qr-placeholder">正在生成二维码…</div>
      <img v-else-if="qrImage" :src="qrImage" alt="投递链接二维码" />
      <p>{{ description || '扫码即可打开投递页面。' }}</p>
      <CopyableValue label="完整链接" :value="link" />
      <div class="button-row link-action-row">
        <button class="secondary-button" type="button" @click="copyText(link)"><Copy :size="17" />复制链接</button>
        <a class="secondary-button" :href="link" target="_blank" rel="noopener"><ExternalLink :size="17" />打开</a>
        <button class="secondary-button" type="button" :disabled="!qrImage" @click="saveQr"><Download :size="17" />保存二维码</button>
      </div>
    </div>
  </BaseDialog>
</template>
