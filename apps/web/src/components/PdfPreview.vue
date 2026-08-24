<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-vue-next'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const props = defineProps<{src:string;title:string}>()
const emit = defineEmits<{error:[]}>()

const host = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const loading = ref(true)
const rendering = ref(false)
const pageNumber = ref(1)
const pageCount = ref(0)
let loadingTask:PDFDocumentLoadingTask|undefined
let documentProxy:PDFDocumentProxy|undefined
let renderTask:RenderTask|undefined
let resizeObserver:ResizeObserver|undefined
let loadGeneration = 0
let renderGeneration = 0

function cancelled(error:unknown){return error instanceof Error&&error.name==='RenderingCancelledException'}

async function renderPage(){
  const pdf=documentProxy,target=canvas.value,container=host.value
  if(!pdf||!target||!container)return
  const generation=++renderGeneration
  renderTask?.cancel()
  rendering.value=true
  try{
    const page=await pdf.getPage(pageNumber.value)
    if(generation!==renderGeneration)return
    const base=page.getViewport({scale:1})
    const availableWidth=Math.max(240,container.clientWidth-24)
    const displayScale=Math.min(2.5,availableWidth/base.width)
    const viewport=page.getViewport({scale:displayScale})
    const outputScale=Math.min(2,Math.max(1,window.devicePixelRatio||1))
    target.width=Math.max(1,Math.floor(viewport.width*outputScale))
    target.height=Math.max(1,Math.floor(viewport.height*outputScale))
    target.style.width=`${Math.floor(viewport.width)}px`
    target.style.height=`${Math.floor(viewport.height)}px`
    renderTask=page.render({canvas:target,viewport,transform:outputScale===1?undefined:[outputScale,0,0,outputScale,0,0],background:'#fff'})
    await renderTask.promise
  }catch(error){
    if(!cancelled(error)&&generation===renderGeneration)emit('error')
  }finally{
    if(generation===renderGeneration)rendering.value=false
  }
}

async function loadPdf(){
  const generation=++loadGeneration
  renderGeneration+=1
  renderTask?.cancel()
  await loadingTask?.destroy().catch(()=>undefined)
  documentProxy=undefined
  pageNumber.value=1
  pageCount.value=0
  loading.value=true
  try{
    const pdfjs=await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl
    loadingTask=pdfjs.getDocument({url:props.src,withCredentials:true})
    const pdf=await loadingTask.promise
    if(generation!==loadGeneration){await pdf.destroy();return}
    documentProxy=pdf
    pageCount.value=pdf.numPages
    await nextTick()
    await renderPage()
  }catch(error){
    if(generation===loadGeneration&&!cancelled(error))emit('error')
  }finally{
    if(generation===loadGeneration)loading.value=false
  }
}

async function changePage(offset:number){
  const next=Math.min(pageCount.value,Math.max(1,pageNumber.value+offset))
  if(next===pageNumber.value)return
  pageNumber.value=next
  await renderPage()
}

onMounted(()=>{
  resizeObserver=new ResizeObserver(()=>{if(documentProxy)void renderPage()})
  if(host.value)resizeObserver.observe(host.value)
  void loadPdf()
})
watch(()=>props.src,()=>void loadPdf())
onBeforeUnmount(()=>{
  loadGeneration+=1
  renderGeneration+=1
  resizeObserver?.disconnect()
  renderTask?.cancel()
  void loadingTask?.destroy()
})
</script>

<template>
  <section ref="host" class="pdf-preview" :aria-label="`${title} PDF 预览`">
    <div v-if="loading" class="pdf-preview-status"><LoaderCircle :size="22" class="spin"/>正在加载 PDF…</div>
    <template v-else>
      <div v-if="pageCount>1" class="pdf-preview-toolbar">
        <button type="button" :disabled="pageNumber<=1||rendering" aria-label="上一页" @click="changePage(-1)"><ChevronLeft :size="18"/></button>
        <span>{{ pageNumber }} / {{ pageCount }}</span>
        <button type="button" :disabled="pageNumber>=pageCount||rendering" aria-label="下一页" @click="changePage(1)"><ChevronRight :size="18"/></button>
      </div>
      <div class="pdf-preview-page" :class="{rendering}">
        <canvas ref="canvas"/>
        <div v-if="rendering" class="pdf-preview-rendering"><LoaderCircle :size="20" class="spin"/>正在渲染…</div>
      </div>
    </template>
  </section>
</template>
