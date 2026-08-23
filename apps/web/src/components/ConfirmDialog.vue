<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { confirmDialog, resolveConfirm } from '../ui'
import BaseDialog from './BaseDialog.vue'

const cancelButton = ref<HTMLButtonElement>()
watch(() => confirmDialog.open, open => { if (open) void nextTick(() => cancelButton.value?.focus()) })
</script>

<template>
  <BaseDialog :open="confirmDialog.open" :title="confirmDialog.title" @close="resolveConfirm(false)">
    <div class="confirm-copy">
      <span class="confirm-icon" :class="{ danger: confirmDialog.danger }"><AlertTriangle :size="22" /></span>
      <p>{{ confirmDialog.message }}</p>
    </div>
    <template #footer>
      <div class="confirm-actions">
        <button ref="cancelButton" class="secondary-button" type="button" @click="resolveConfirm(false)">{{ confirmDialog.cancelText }}</button>
        <button :class="confirmDialog.danger ? 'danger-button' : 'primary-button'" type="button" @click="resolveConfirm(true)">{{ confirmDialog.confirmText }}</button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm-copy{display:flex;align-items:flex-start;gap:12px;color:var(--muted);line-height:1.6}
.confirm-icon{display:grid;width:42px;height:42px;flex:none;place-items:center;border-radius:13px;background:var(--warning-soft);color:var(--warning)}
.confirm-icon.danger{background:var(--danger-soft);color:var(--danger)}
.confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
</style>
