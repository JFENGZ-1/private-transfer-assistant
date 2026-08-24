<script setup lang="ts">
const props = withDefaults(defineProps<{
  expiresIn: number | undefined
  maxUploads: number | null
  maxFileSizeMb: number | null
  allowedTypes: string[]
  allowUnchangedExpiry?: boolean
  uploads?: number
}>(), { allowUnchangedExpiry: false, uploads: 0 })

const emit = defineEmits<{
  'update:expiresIn': [value: number | undefined]
  'update:maxUploads': [value: number | null]
  'update:maxFileSizeMb': [value: number | null]
  'update:allowedTypes': [value: string[]]
}>()

const expiryOptions = [
  { label: '1 小时', value: 3600 },
  { label: '24 小时', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '30 天', value: 2592000 },
]
const uploadOptions: { label: string; value: number | null }[] = [
  { label: '1 次', value: 1 }, { label: '5 次', value: 5 }, { label: '10 次', value: 10 }, { label: '不限', value: null },
]
const sizeOptions: { label: string; value: number | null }[] = [
  { label: '50 MB', value: 50 }, { label: '100 MB', value: 100 }, { label: '500 MB', value: 500 }, { label: '跟随服务器', value: null },
]
const typeOptions = [
  { label: '全部文件', value: [] },
  { label: '仅图片', value: ['image/*'] },
  { label: '图片与视频', value: ['image/*', 'video/*'] },
  { label: '仅 PDF', value: ['application/pdf'] },
]

const sameTypes = (left: string[], right: string[]) => left.length === right.length && left.every(value => right.includes(value))
function customUploads(event: Event) { const value=Number((event.target as HTMLInputElement).value);if(Number.isInteger(value)&&value>0)emit('update:maxUploads',Math.min(10000,value)) }
function customSize(event: Event) { const value=Number((event.target as HTMLInputElement).value);if(Number.isFinite(value)&&value>0)emit('update:maxFileSizeMb',Math.min(20480,value)) }
</script>

<template>
  <fieldset class="parameter-fieldset">
    <legend>有效期</legend>
    <p v-if="allowUnchangedExpiry" class="parameter-hint">不选择则保持原到期时间；选择后从保存时重新计算。</p>
    <div class="parameter-options expiry-options">
      <button v-if="allowUnchangedExpiry" type="button" :class="{ active: expiresIn === undefined }" @click="emit('update:expiresIn', undefined)">保持不变</button>
      <button v-for="option in expiryOptions" :key="option.value" type="button" :class="{ active: expiresIn === option.value }" @click="emit('update:expiresIn', option.value)">{{ option.label }}</button>
    </div>
  </fieldset>
  <fieldset class="parameter-fieldset">
    <legend>最大投递次数</legend>
    <p v-if="uploads" class="parameter-hint">当前已投递 {{ uploads }} 次，设置的是累计总次数。</p>
    <div class="parameter-options download-options">
      <button v-for="option in uploadOptions" :key="String(option.value)" type="button" :class="{ active: maxUploads === option.value }" @click="emit('update:maxUploads', option.value)">{{ option.label }}</button>
    </div>
    <label class="field compact-field"><span>自定义总次数</span><input :value="typeof maxUploads === 'number' ? maxUploads : ''" type="number" :min="Math.max(1, props.uploads)" max="10000" inputmode="numeric" placeholder="输入 1–10000" @input="customUploads" /></label>
  </fieldset>
  <fieldset class="parameter-fieldset">
    <legend>单文件大小</legend>
    <div class="parameter-options download-options">
      <button v-for="option in sizeOptions" :key="String(option.value)" type="button" :class="{ active: maxFileSizeMb === option.value }" @click="emit('update:maxFileSizeMb', option.value)">{{ option.label }}</button>
    </div>
    <label class="field compact-field"><span>自定义 MB</span><input :value="typeof maxFileSizeMb === 'number' ? maxFileSizeMb : ''" type="number" min="1" max="20480" inputmode="numeric" placeholder="输入 1–20480" @input="customSize" /></label>
  </fieldset>
  <fieldset class="parameter-fieldset">
    <legend>允许的文件类型</legend>
    <div class="parameter-options expiry-options">
      <button v-for="option in typeOptions" :key="option.label" type="button" :class="{ active: sameTypes(allowedTypes, option.value) }" @click="emit('update:allowedTypes', [...option.value])">{{ option.label }}</button>
    </div>
  </fieldset>
</template>
