<script setup lang="ts">
import { computed } from 'vue'
import { parseSnippet } from '../highlight'

const props = defineProps<{ text: string }>()
const parts = computed(() => parseSnippet(props.text))
</script>
<template><span><template v-for="(part,index) in parts" :key="index"><mark v-if="part.highlighted">{{part.text}}</mark><template v-else>{{part.text}}</template></template></span></template>
