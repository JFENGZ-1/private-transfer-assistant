<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{ open: boolean; title: string; wide?: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="dialog-backdrop" @click.self="$emit('close')">
        <section class="dialog-card" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="dialog-head">
            <h2>{{ title }}</h2>
            <button class="icon-button" aria-label="关闭" @click="$emit('close')"><X :size="20" /></button>
          </header>
          <div class="dialog-body"><slot /></div>
          <footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
