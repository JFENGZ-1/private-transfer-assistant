<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, KeyRound, ShieldCheck, Waves } from 'lucide-vue-next'
import { api, errorText } from '../api'
import { acceptTemporarySession, state } from '../state'

const router = useRouter()
const route = useRoute()
const password = ref('')
const mainPassword = ref('')
const adminPassword = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')
const setup = computed(() => !state.initialized)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    if (setup.value) {
      if (mainPassword.value.length < 8 || adminPassword.value.length < 8) throw new Error('两个口令都至少需要 8 位')
      if (mainPassword.value === adminPassword.value) throw new Error('主口令和管理口令不能相同')
      await api.initialize(mainPassword.value, adminPassword.value)
      state.initialized = true
      password.value = mainPassword.value
    }
    const result = await api.login(password.value)
    acceptTemporarySession(result.token)
    await router.replace(typeof route.query.next === 'string' ? route.query.next : '/app')
  } catch (reason) {
    error.value = errorText(reason)
  } finally { loading.value = false }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <div class="brand-mark"><Waves :size="27" /></div>
      <p class="eyebrow">PRIVATE TRANSFER</p>
      <h1>{{ setup ? '初次设置渡口' : '回到你的渡口' }}</h1>
      <p class="auth-lead">{{ setup ? '设置主口令与独立的管理口令。' : '输入主口令，安全进入私人传输助手。' }}</p>

      <form class="auth-form" @submit.prevent="submit">
        <template v-if="setup">
          <label class="field"><span>主口令</span><input v-model="mainPassword" :type="show ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 8 位" /></label>
          <label class="field"><span>管理口令</span><input v-model="adminPassword" :type="show ? 'text' : 'password'" autocomplete="new-password" placeholder="用于长期设备与设置" /></label>
        </template>
        <label v-else class="field"><span>主口令</span><div class="input-with-action"><KeyRound :size="18" /><input v-model="password" :type="show ? 'text' : 'password'" autofocus autocomplete="current-password" placeholder="输入主口令" /><button type="button" class="icon-button" :aria-label="show ? '隐藏口令' : '显示口令'" @click="show = !show"><EyeOff v-if="show" :size="18" /><Eye v-else :size="18" /></button></div></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary-button full" :disabled="loading">{{ loading ? '请稍候…' : setup ? '完成设置并进入' : '临时进入' }}</button>
      </form>

      <div class="auth-note"><ShieldCheck :size="17" /><span>本次为临时会话，刷新或关闭标签页后自动退出。进入后可使用管理口令设为长期设备。</span></div>
    </section>
  </main>
</template>
