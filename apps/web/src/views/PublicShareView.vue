<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Waves,
} from "lucide-vue-next";
import { api, errorText } from "../api";
import { siteAppearance } from "../appearance";
import type { Message, Share } from "../types";
import { formatBytes, formatTime } from "../ui";
import { filePreviewKind } from "../preview";
import FilePreviewContent from "../components/FilePreviewContent.vue";

const route = useRoute();
const share = ref<Share>();
const messages = ref<Message[]>([]);
const code = ref("");
const loading = ref(true);
const error = ref("");
const previewMessageId = ref("");
const previewFailedId = ref("");
const fileCount = computed(
  () => messages.value.filter((message) => message.type === "file").length,
);
const textCount = computed(() => messages.value.length - fileCount.value);
function previewKind(message: Message) {
  return filePreviewKind(message);
}
function previewUrl(message: Message) {
  return api.publicShareItemPreviewUrl(
    String(route.params.token),
    message.id,
    code.value || undefined,
  );
}
function downloadUrl(message: Message) {
  return api.publicShareItemDownloadUrl(
    String(route.params.token),
    message.id,
    code.value || undefined,
  );
}
function togglePreview(message: Message) {
  previewFailedId.value = "";
  previewMessageId.value =
    previewMessageId.value === message.id ? "" : message.id;
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api.publicShare(
      String(route.params.token),
      code.value || undefined,
    );
    share.value = data.share;
    messages.value = data.messages;
    previewMessageId.value = "";
    previewFailedId.value = "";
  } catch (reason) {
    error.value = errorText(reason);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <main class="public-page">
    <section class="public-card" :class="{ bundle: messages.length > 1 }">
      <div class="public-brand"><Waves :size="22" /> {{ siteAppearance.siteTitle }}临时分享</div>
      <div v-if="loading" class="skeleton-stack"><i /><i /><i /></div>
      <template v-else-if="messages.length">
        <div class="file-hero">
          <FileText :size="34" />
          <div>
            <h1>
              {{
                messages.length > 1
                  ? `${messages.length} 项内容`
                  : messages[0].fileName || "文本分享"
              }}
            </h1>
            <p>
              {{
                messages.length > 1
                  ? `${textCount} 条文本 · ${fileCount} 个文件`
                  : messages[0].type === "file"
                    ? formatBytes(messages[0].size)
                    : "来自私人传输助手"
              }}
            </p>
          </div>
        </div>
        <div v-if="share" class="meta-row">
          <Clock3 :size="16" />
          {{
            share.expiresAt === 0
              ? "永久有效"
              : `${formatTime(share.expiresAt)} 到期`
          }}
          <span v-if="share.maxDownloads"
            >· 剩余
            {{ Math.max(0, share.maxDownloads - share.downloads) }} 次</span
          >
        </div>
        <div v-else class="meta-row">
          <Clock3 :size="16" />临时分享 · 有效期由发送者设定
        </div>
        <div class="shared-items">
          <article
            v-for="(message, index) in messages"
            :key="message.id"
            class="shared-item"
          >
            <header>
              <span>{{ index + 1 }}</span>
              <div>
                <strong>{{
                  message.type === "file"
                    ? message.fileName || "文件"
                    : `文本 ${index + 1}`
                }}</strong
                ><small>{{
                  message.type === "file"
                    ? formatBytes(message.size)
                    : "文本内容"
                }}</small>
              </div>
            </header>
            <div v-if="message.type === 'text'" class="shared-text">
              {{ message.content }}
            </div>
            <template v-else
              ><div class="public-actions">
                <button
                  v-if="previewKind(message)"
                  class="secondary-button full"
                  @click="togglePreview(message)"
                >
                  <component
                    :is="previewMessageId === message.id ? EyeOff : Eye"
                    :size="18"
                  />{{
                    previewMessageId === message.id ? "收起预览" : "在线预览"
                  }}</button
                ><a
                  class="primary-button full"
                  :href="downloadUrl(message)"
                  :download="message.fileName || 'download'"
                  rel="noopener"
                  ><Download :size="18" />下载文件</a
                >
              </div>
              <div
                v-if="previewMessageId === message.id && previewKind(message)"
                class="public-preview"
              >
                <p
                  v-if="previewFailedId === message.id"
                  class="preview-fallback"
                >
                  当前浏览器无法预览，请下载文件后查看。
                </p>
                <FilePreviewContent
                  v-else
                  :kind="previewKind(message)!"
                  :src="previewUrl(message)"
                  :title="message.fileName || '文件'"
                  @error="previewFailedId = message.id"
                /></div
            ></template>
          </article>
        </div>
      </template>
      <template v-else>
        <div class="empty-inline">
          <KeyRound :size="28" />
          <h1>暂时无法打开分享</h1>
          <p>{{ error }}</p>
        </div>
        <form
          v-if="error.includes('口令')"
          class="stack"
          @submit.prevent="load"
        >
          <input v-model="code" placeholder="输入提取码" /><button
            class="primary-button"
          >
            验证
          </button>
        </form>
      </template>
      <p class="public-foot">请仅下载你信任的文件</p>
    </section>
  </main>
</template>
