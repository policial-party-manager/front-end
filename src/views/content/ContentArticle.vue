<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { getNews, getNotice, type NewsArticle, type NoticeArticle } from "@/api/content";

const route = useRoute();
const kind = computed(() => (route.path.startsWith("/notice/") ? "notice" : "news"));
const sectionName = computed(() => (kind.value === "news" ? "党建新闻" : "通知公告"));
const article = ref<NewsArticle | NoticeArticle | null>(null);
const loading = ref(false);
const error = ref(false);
let requestNumber = 0;

const publishDate = computed(() => {
  const item = article.value;
  if (!item) return "";
  return ("createTime" in item ? item.createTime : item.publishTime)?.slice(0, 16)?.replace("T", " ") || "";
});
const cover = computed(() => {
  const item = article.value;
  if (!item || !("cover" in item) || !item.cover) return "";
  return /^https?:\/\//i.test(item.cover) || item.cover.startsWith("/") ? item.cover : "";
});
const attachmentUrl = computed(() => {
  const value = article.value?.content;
  if (!value?.startsWith("file:")) return "";
  const path = value.slice(5).trim();
  return /^https?:\/\//i.test(path) || path.startsWith("/") ? path : "";
});
const bodyText = computed(() => {
  const value = article.value?.content || "";
  if (value.startsWith("file:")) return "此公告以文件形式发布。";
  const withBreaks = value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, "\n\n");
  return (
    new DOMParser()
      .parseFromString(withBreaks, "text/html")
      .body.textContent?.replace(/\n{3,}/g, "\n\n")
      .trim() || "暂无正文"
  );
});

async function load(): Promise<void> {
  const currentRequest = ++requestNumber;
  const id = Number(route.params.id);
  article.value = null;
  error.value = false;
  if (!Number.isSafeInteger(id) || id < 1) {
    loading.value = false;
    error.value = true;
    return;
  }
  loading.value = true;
  try {
    const result = kind.value === "news" ? await getNews(id) : await getNotice(id);
    if (currentRequest === requestNumber) article.value = result;
  } catch {
    if (currentRequest === requestNumber) error.value = true;
  } finally {
    if (currentRequest === requestNumber) loading.value = false;
  }
}

watch(
  () => route.fullPath,
  () => void load(),
  { immediate: true },
);
</script>

<template>
  <div class="workspace-page article-page">
    <div class="workspace-breadcrumb">
      <router-link to="/content">资讯公告</router-link> /
      <router-link :to="kind === 'news' ? '/news' : '/notice'">{{ sectionName }}</router-link> / <span>正文</span>
    </div>
    <section class="workspace-panel article-panel">
      <div v-if="loading" class="article-state" role="status">正在加载正文…</div>
      <div v-else-if="error || !article" class="article-state" role="alert">
        内容不存在或加载失败。<button @click="load">重试</button>
      </div>
      <article v-else>
        <div class="article-kicker">{{ sectionName }} / ARTICLE</div>
        <h1>{{ article.title }}</h1>
        <div class="article-meta">
          <time :datetime="publishDate">{{ publishDate }}</time
          ><span v-if="kind === 'news' && 'viewCount' in article && article.viewCount !== null"
            >浏览 {{ article.viewCount }}</span
          >
        </div>
        <img v-if="cover" class="article-cover" :src="cover" alt="新闻封面" />
        <div class="article-body">{{ bodyText }}</div>
        <p v-if="article.content?.startsWith('file:') && attachmentUrl" class="file-link">
          <a :href="attachmentUrl" target="_blank" rel="noopener noreferrer">打开公告文件 ↗</a>
        </p>
        <div class="article-foot">
          <router-link :to="kind === 'news' ? '/news' : '/notice'">← 返回{{ sectionName }}列表</router-link>
        </div>
      </article>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.article-page {
  max-width: 1150px;
}
.workspace-breadcrumb a:hover {
  color: var(--party-red);
}
.article-panel {
  min-height: 420px;
  padding: clamp(24px, 4vw, 56px);
}
.article-state {
  display: grid;
  place-content: center;
  min-height: 320px;
  color: #879295;
  text-align: center;
}
.article-state button {
  border: 0;
  background: none;
  color: var(--party-red);
  margin-top: 8px;
}
.article-kicker {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
}
h1 {
  max-width: 820px;
  margin: 18px auto 16px;
  font-family: "Songti SC", "SimSun", serif;
  font-size: clamp(25px, 3vw, 34px);
  line-height: 1.5;
  text-align: center;
}
.article-meta {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding-bottom: 23px;
  border-bottom: 1px solid var(--workspace-line);
  color: #919d9f;
  font-size: 12px;
}
.article-cover {
  display: block;
  width: min(100%, 780px);
  max-height: 400px;
  object-fit: cover;
  margin: 30px auto;
}
.article-body {
  max-width: 780px;
  margin: 32px auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #3f4a4f;
  font-size: 16px;
  line-height: 1.95;
}
.file-link {
  max-width: 780px;
  margin: 20px auto;
}
.file-link a,
.article-foot a {
  color: var(--party-red);
}
.file-link a:hover,
.article-foot a:hover {
  text-decoration: underline;
}
.article-foot {
  max-width: 780px;
  margin: 45px auto 0;
  padding-top: 22px;
  border-top: 1px solid var(--workspace-line);
}
</style>
