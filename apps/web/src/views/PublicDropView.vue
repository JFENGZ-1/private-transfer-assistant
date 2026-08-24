<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { CheckCircle2, FileUp, Inbox, Trash2, Waves } from "lucide-vue-next";
import { api, errorText } from "../api";
import { siteAppearance } from "../appearance";
import type { Drop } from "../types";
import { formatBytes } from "../ui";

const route = useRoute();
const drop = ref<Drop>();
const files = ref<File[]>([]);
const sender = ref("");
const note = ref("");
const progress = ref(0);
const currentFile = ref(0);
const loading = ref(false);
const error = ref("");
const receipt = ref("");
const acceptedTypes = computed(() => drop.value?.allowedTypes?.join(",") ?? "");
onMounted(async () => {
  try {
    drop.value = (await api.publicDrop(String(route.params.token))).drop;
  } catch (e) {
    error.value = errorText(e);
  }
});
function choose(event: Event) {
  files.value = [...((event.target as HTMLInputElement).files ?? [])];
}
async function submit() {
  if (!files.value.length) return;
  loading.value = true;
  progress.value = 0;
  currentFile.value = 0;
  error.value = "";
  try {
    const r = await api.submitDrop(
      String(route.params.token),
      files.value,
      sender.value,
      note.value,
      (value, index) => {
        progress.value = value;
        currentFile.value = index ?? 0;
      },
    );
    receipt.value = r.receipt ?? "已送达";
    files.value = [];
  } catch (e) {
    error.value = `${currentFile.value ? `前 ${currentFile.value} 个文件已送达，` : ""}${errorText(e)}`;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <main class="public-page">
    <section class="public-card">
      <div class="public-brand"><Waves :size="22" /> {{ siteAppearance.siteTitle }}安全投递</div>
      <div v-if="receipt" class="success-state">
        <CheckCircle2 :size="42" />
        <h1>投递成功</h1>
        <p>回执：{{ receipt }}</p>
        <button class="secondary-button" @click="receipt = ''">继续投递</button>
      </div>
      <template v-else-if="drop">
        <div class="file-hero">
          <Inbox :size="34" />
          <div>
            <h1>{{ drop.name }}</h1>
            <p>你只能投递内容，无法查看收件历史</p>
          </div>
        </div>
        <form class="stack" @submit.prevent="submit">
          <label class="field"
            ><span>你的名称（可选）</span
            ><input v-model="sender" placeholder="便于收件人识别"
          /></label>
          <label class="field"
            ><span>留言（可选）</span
            ><textarea
              v-model="note"
              rows="3"
              placeholder="说明这些文件的用途"
            />
          </label>
          <label class="drop-zone"
            ><FileUp :size="27" /><strong>选择要投递的文件</strong
            ><span v-if="drop.maxFileSize"
              >单文件最大 {{ formatBytes(drop.maxFileSize) }}</span
            ><input
              type="file"
              multiple
              :accept="acceptedTypes"
              @change="choose"
          /></label>
          <ul v-if="files.length" class="file-list">
            <li v-for="(file, i) in files" :key="`${file.name}-${i}`">
              <span
                >{{ file.name }}
                <small>{{ formatBytes(file.size) }}</small></span
              ><button
                type="button"
                class="icon-button"
                @click="files.splice(i, 1)"
              >
                <Trash2 :size="17" />
              </button>
            </li>
          </ul>
          <div v-if="loading" class="progress">
            <i :style="{ width: `${progress * 100}%` }" />
          </div>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button
            class="primary-button full"
            :disabled="!files.length || loading"
          >
            {{
              loading
                ? `正在投递 ${currentFile + 1}/${files.length} · ${Math.round(progress * 100)}%`
                : "确认投递"
            }}
          </button>
        </form>
      </template>
      <div v-else class="empty-inline">
        <Inbox :size="30" />
        <h1>投递箱不可用</h1>
        <p>{{ error || "正在读取投递信息…" }}</p>
      </div>
    </section>
  </main>
</template>
