<script setup lang="ts">
const props = withDefaults(defineProps<{
  expiresIn: number | null | undefined
  maxDownloads: number | null | undefined
  allowUnchanged?: boolean
  downloads?: number
}>(), { allowUnchanged: false, downloads: 0 })

const emit = defineEmits<{
  'update:expiresIn': [value: number | null | undefined]
  'update:maxDownloads': [value: number | null | undefined]
}>()

const expiryOptions: { label: string; value: number | null }[] = [
  { label: '10 分钟', value: 600 },
  { label: '1 小时', value: 3600 },
  { label: '24 小时', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '30 天', value: 2592000 },
  { label: '永久', value: null },
]
const downloadOptions: { label: string; value: number | null }[] = [
  { label: '1 次', value: 1 },
  { label: '5 次', value: 5 },
  { label: '10 次', value: 10 },
  { label: '不限', value: null },
]

function customDownloads(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isInteger(value) && value > 0) emit('update:maxDownloads', Math.min(10000, value))
}
</script>

<template>
  <fieldset class="parameter-fieldset">
    <legend>有效期</legend>
    <p v-if="allowUnchanged" class="parameter-hint">不选择则保持原到期时间；选择后从保存时重新计算。</p>
    <div class="parameter-options expiry-options">
      <button v-if="allowUnchanged" type="button" :class="{ active: expiresIn === undefined }" @click="emit('update:expiresIn', undefined)">保持不变</button>
      <button v-for="option in expiryOptions" :key="String(option.value)" type="button" :class="{ active: expiresIn === option.value }" @click="emit('update:expiresIn', option.value)">{{ option.label }}</button>
    </div>
  </fieldset>
  <fieldset class="parameter-fieldset">
    <legend>最大下载次数</legend>
    <p v-if="allowUnchanged" class="parameter-hint">当前已下载 {{ downloads }} 次；最大次数指分享累计可下载的总次数。</p>
    <div class="parameter-options download-options">
      <button v-if="allowUnchanged" type="button" :class="{ active: maxDownloads === undefined }" @click="emit('update:maxDownloads', undefined)">保持不变</button>
      <button v-for="option in downloadOptions" :key="String(option.value)" type="button" :class="{ active: maxDownloads === option.value }" @click="emit('update:maxDownloads', option.value)">{{ option.label }}</button>
    </div>
    <label class="field compact-field"><span>自定义总次数</span><input :value="typeof maxDownloads === 'number' ? maxDownloads : ''" type="number" :min="Math.max(1, props.downloads)" max="10000" inputmode="numeric" placeholder="输入 1–10000" @input="customDownloads" /></label>
  </fieldset>
</template>
