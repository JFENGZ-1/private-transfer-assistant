<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon?: Component; title: string; description: string }>()
</script>
<template>
  <div class="empty-state">
    <component :is="icon" v-if="icon" :size="30" stroke-width="1.7" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
