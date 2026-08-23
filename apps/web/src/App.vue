<script setup lang="ts">
import { RouterView } from 'vue-router'
import { state } from './state'
import ConfirmDialog from './components/ConfirmDialog.vue'
</script>

<template>
  <div class="app-root">
    <div v-if="state.offline" class="offline-bar" role="status">已离线，上传与同步将在联网后恢复</div>
    <RouterView />
    <ConfirmDialog />
  </div>
</template>
