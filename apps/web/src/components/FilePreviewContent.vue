<script setup lang="ts">
import type { FilePreviewKind } from '../preview'
import PdfPreview from './PdfPreview.vue'

defineProps<{kind:FilePreviewKind;src:string;title:string}>()
const emit=defineEmits<{error:[]}>()
</script>

<template>
  <img v-if="kind==='image'" class="inline-preview-media" :src="src" :alt="title" @error="emit('error')"/>
  <video v-else-if="kind==='video'" class="inline-preview-media" :src="src" controls playsinline preload="metadata" @error="emit('error')"/>
  <audio v-else-if="kind==='audio'" class="inline-preview-audio" :src="src" controls preload="metadata" @error="emit('error')"/>
  <PdfPreview v-else-if="kind==='pdf'" :src="src" :title="title" @error="emit('error')"/>
  <iframe v-else class="inline-preview-frame" :src="src" :title="`${title}预览`" sandbox="" @error="emit('error')"/>
</template>
