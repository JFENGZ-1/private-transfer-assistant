<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, FileUp, Send, Share2 } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { api, errorText } from '../api'
import { state } from '../state'
import type { Message } from '../types'
import { formatBytes } from '../ui'

const route=useRoute();const router=useRouter();const text=ref([route.query.title,route.query.text,route.query.url].filter(Boolean).join('\n'));const files=ref<File[]>([]);const target=ref('all');const sending=ref(false);const progress=ref(0);const done=ref(false);const error=ref('');const targetIds=computed(()=>target.value==='all'?undefined:[target.value])
function choose(e:Event){files.value=[...((e.target as HTMLInputElement).files??[])]}
async function send(){sending.value=true;error.value='';try{const sent:Message[]=[];if(text.value.trim())sent.push(await api.sendText(text.value.trim(),targetIds.value));for(const file of files.value)sent.push(await api.uploadFile(file,targetIds.value,v=>progress.value=v));done.value=true}catch(e){error.value=errorText(e)}finally{sending.value=false}}
</script>
<template><section class="share-target page"><header class="page-head"><div><p class="eyebrow">PWA 系统分享</p><h1>发送到渡口</h1></div></header><div v-if="done" class="success-state"><CheckCircle2 :size="42"/><h2>内容已送达</h2><p>可以返回原应用，或查看传输助手。</p><button class="primary-button" @click="router.replace('/app')">查看助手</button></div><form v-else class="settings-card stack" @submit.prevent="send"><label class="field"><span>分享文本</span><textarea v-model="text" rows="5" placeholder="文本或链接" /></label><label class="drop-zone"><FileUp :size="25"/><strong>添加文件</strong><span>发送前可以检查与删除</span><input type="file" multiple @change="choose"/></label><ul v-if="files.length" class="file-list"><li v-for="file in files" :key="file.name"><span>{{file.name}} <small>{{formatBytes(file.size)}}</small></span></li></ul><label class="field"><span>发送到</span><select v-model="target"><option value="all">所有设备</option><option v-for="device in state.devices" :key="device.id" :value="device.id">{{device.name}}</option></select></label><div v-if="sending&&files.length" class="progress"><i :style="{width:`${progress*100}%`}"/></div><p v-if="error" class="form-error">{{error}}</p><button class="primary-button" :disabled="sending||(!text.trim()&&!files.length)"><Send :size="18"/>{{sending?'发送中…':'确认发送'}}</button></form></section></template>
