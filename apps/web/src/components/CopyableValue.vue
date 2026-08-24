<script setup lang="ts">
withDefaults(defineProps<{ label?: string; value: string; hint?: string }>(), {
  label: '链接',
  hint: '如果自动复制不可用，可长按或拖动选择上方内容手动复制。',
})
</script>

<template>
  <div class="copyable-value">
    <span>{{ label }}</span>
    <p tabindex="0">{{ value }}</p>
    <small>{{ hint }}</small>
  </div>
</template>
