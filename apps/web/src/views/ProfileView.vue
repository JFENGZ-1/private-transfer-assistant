<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Archive, ChevronRight, Clock3, HardDrive, Laptop, LockKeyhole, LogOut, Settings, ShieldCheck, Trash2 } from 'lucide-vue-next'
import { api, errorText, setTemporaryToken } from '../api'
import { clearSession, isTrusted, refreshPrincipal, state } from '../state'
import BaseDialog from '../components/BaseDialog.vue'
import { formatBytes, notify } from '../ui'

const route = useRoute(); const router = useRouter(); const upgradeOpen = ref(false); const adminPassword = ref(''); const deviceName = ref(''); const loading = ref(false); const error = ref('')
const currentDevice = computed(() => state.devices.find(d => d.id === state.principal?.deviceId))
onMounted(() => { if (route.query.upgrade === '1') upgradeOpen.value = true })
async function promote() { loading.value = true; error.value = ''; try { await api.promote(adminPassword.value, deviceName.value || '我的设备'); setTemporaryToken(); await refreshPrincipal(); state.devices = (await api.devices()).items; upgradeOpen.value = false; notify('已设为长期设备', 'success') } catch (e) { error.value = errorText(e) } finally { loading.value = false } }
async function logout() { try { await api.logout() } finally { clearSession(); router.replace('/login') } }
</script>
<template><section class="page profile-page"><header class="page-head"><div><p class="eyebrow">当前身份</p><h1>我的</h1></div></header>
  <section class="device-identity"><div class="device-avatar"><Laptop :size="27" /></div><div><h2>{{ isTrusted ? currentDevice?.name || '长期设备' : '临时设备' }}</h2><p v-if="isTrusted"><ShieldCheck :size="14" />持续登录 · 可查看隐私内容</p><p v-else><Clock3 :size="14" />刷新或关闭页面后退出</p></div></section>
  <button v-if="!isTrusted" class="upgrade-card" @click="upgradeOpen = true"><span><LockKeyhole :size="21" /><span><strong>设为长期设备</strong><small>需要输入独立的管理口令</small></span></span><ChevronRight :size="20" /></button>
  <div class="settings-list"><RouterLink to="/app/trash"><span><Trash2 :size="19" />回收站</span><ChevronRight :size="18" /></RouterLink><RouterLink v-if="isTrusted" to="/app/settings"><span><Settings :size="19" />系统设置</span><ChevronRight :size="18" /></RouterLink><div><span><HardDrive :size="19" />已用存储</span><small>{{ formatBytes(state.settings?.storage?.used) }}</small></div><a v-if="isTrusted" :href="api.exportBackup()"><span><Archive :size="19" />导出备份</span><ChevronRight :size="18" /></a></div>
  <button class="logout-button" @click="logout"><LogOut :size="18" />退出当前设备</button>
  <BaseDialog :open="upgradeOpen" title="设为长期设备" @close="upgradeOpen = false"><form class="stack" @submit.prevent="promote"><p class="muted">长期设备可保持登录、访问设置页，并查看开启隐私锁的内容。</p><label class="field"><span>设备名称</span><input v-model="deviceName" placeholder="例如：我的 iPhone" /></label><label class="field"><span>管理口令</span><input v-model="adminPassword" type="password" autocomplete="current-password" /></label><p v-if="error" class="form-error">{{ error }}</p><button class="primary-button" :disabled="loading">{{ loading ? '正在授权…' : '确认设为长期设备' }}</button></form></BaseDialog>
</section></template>
