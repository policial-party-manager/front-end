<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAppStore } from "@/stores/app";
import { hasPermission } from "@/config/permissions";
import { pageNews, pageNotices, type NewsArticle, type NoticeArticle } from "@/api/content";

const store = useAppStore();
const canManageContent = computed(() => hasPermission(store.currentRole, "content:manage"));
const keyword = ref("");
const appliedKeyword = ref("");
const news = ref<NewsArticle[]>([]);
const notices = ref<NoticeArticle[]>([]);
const headline = ref<NewsArticle | null>(null);
const coverFailed = ref(false);
const loading = ref(false);
const newsError = ref(false);
const noticeError = ref(false);
let requestNumber = 0;

const headlineCover = computed(() => {
  const cover = headline.value?.cover;
  return cover && !coverFailed.value && (/^https?:\/\//i.test(cover) || cover.startsWith("/")) ? cover : "";
});
const dateText = (value: string | null | undefined) => value?.slice(0, 10) || "—";

async function load(): Promise<void> {
  const currentRequest = ++requestNumber;
  loading.value = true;
  newsError.value = false;
  noticeError.value = false;
  const params = { page: 1, size: 5, keyword: appliedKeyword.value || undefined };
  const [newsResult, noticeResult] = await Promise.allSettled([pageNews(params), pageNotices(params)]);
  if (currentRequest !== requestNumber) return;
  if (newsResult.status === "fulfilled") {
    news.value = newsResult.value.records;
    if (!appliedKeyword.value) {
      headline.value = news.value[0] ?? null;
      coverFailed.value = false;
    }
  } else {
    news.value = [];
    newsError.value = true;
    if (!appliedKeyword.value) headline.value = null;
  }
  if (noticeResult.status === "fulfilled") {
    notices.value = noticeResult.value.records;
  } else {
    notices.value = [];
    noticeError.value = true;
  }
  loading.value = false;
}

function search(): void {
  appliedKeyword.value = keyword.value.trim();
  void load();
}

function reset(): void {
  keyword.value = "";
  appliedKeyword.value = "";
  void load();
}

onMounted(() => void load());
</script>

<template>
  <div class="workspace-page content-hub">
    <div class="workspace-breadcrumb">工作台 / <span>资讯公告</span></div>
    <header class="workspace-heading page-heading">
      <span class="eyebrow">NEWS & NOTICES</span>
      <div class="title-search-row">
        <h1>资讯公告</h1>
        <div class="heading-tools">
          <router-link v-if="canManageContent" class="manage-content-link" to="/content/manage">
            内容管理 <span aria-hidden="true">→</span>
          </router-link>
          <form class="search-panel" @submit.prevent="search">
            <label class="sr-only" for="content-keyword">检索新闻与公告</label>
            <el-input id="content-keyword" v-model="keyword" clearable placeholder="关键词" maxlength="80" />
            <el-button type="primary" native-type="submit" :loading="loading">搜索</el-button>
            <el-button :disabled="loading" @click="reset">重置</el-button>
          </form>
        </div>
      </div>
      <p>阅读新闻，查阅通知。两类内容各有清晰入口。</p>
    </header>

    <section class="headline" aria-label="头条新闻">
      <div class="headline-image">
        <img v-if="headlineCover" :src="headlineCover" alt="新闻封面" @error="coverFailed = true" />
        <span v-else aria-hidden="true">党</span>
      </div>
      <div class="headline-copy">
        <span class="eyebrow">HEADLINE / 头条</span>
        <template v-if="headline">
          <h2>{{ headline.title }}</h2>
          <p>{{ dateText(headline.createTime) }} · 最新党建新闻</p>
          <router-link :to="`/news/${headline.id}`">查看报道 <span aria-hidden="true">→</span></router-link>
        </template>
        <template v-else>
          <h2>聚焦校园党建动态</h2>
          <p>
            {{
              loading ? "正在获取最新报道…" : newsError ? "最新报道暂时无法加载。" : "最新报道将在发布后显示在这里。"
            }}
          </p>
        </template>
      </div>
    </section>

    <div class="content-columns">
      <section class="content-column news-column" aria-labelledby="news-heading">
        <div class="column-heading">
          <div>
            <span class="eyebrow">NEWS</span>
            <h2 id="news-heading">党建新闻</h2>
          </div>
          <router-link :to="{ path: '/news', query: appliedKeyword ? { keyword: appliedKeyword } : {} }"
            >查看全部 →</router-link
          >
        </div>
        <div v-if="loading" class="column-state" role="status">正在加载新闻…</div>
        <div v-else-if="newsError" class="column-state" role="alert">
          新闻加载失败。<button @click="load">重试</button>
        </div>
        <div v-else-if="!news.length" class="column-state">
          {{ appliedKeyword ? "没有匹配的新闻" : "暂无已发布新闻" }}
        </div>
        <ul v-else>
          <li v-for="item in news" :key="item.id">
            <router-link :to="`/news/${item.id}`">{{ item.title }}</router-link>
            <time :datetime="dateText(item.createTime)">{{ dateText(item.createTime) }}</time>
          </li>
        </ul>
      </section>

      <section class="content-column notice-column" aria-labelledby="notice-heading">
        <div class="column-heading">
          <div>
            <span class="eyebrow">NOTICES</span>
            <h2 id="notice-heading">通知公告</h2>
          </div>
          <router-link :to="{ path: '/notice', query: appliedKeyword ? { keyword: appliedKeyword } : {} }"
            >查看全部 →</router-link
          >
        </div>
        <div v-if="loading" class="column-state" role="status">正在加载公告…</div>
        <div v-else-if="noticeError" class="column-state" role="alert">
          公告加载失败。<button @click="load">重试</button>
        </div>
        <div v-else-if="!notices.length" class="column-state">{{ appliedKeyword ? "没有匹配的公告" : "暂无公告" }}</div>
        <ul v-else>
          <li v-for="item in notices" :key="item.id">
            <router-link :to="`/notice/${item.id}`">{{ item.title }}</router-link>
            <time :datetime="dateText(item.publishTime)">{{ dateText(item.publishTime) }}</time>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.content-hub {
  max-width: 1580px;
}
.page-heading {
  display: block;
  border-top: 4px solid var(--party-red);
  padding-top: 22px;
}
.title-search-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.heading-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
}
.manage-content-link {
  color: var(--party-red);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.manage-content-link:hover {
  text-decoration: underline;
}
.eyebrow {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
}
.page-heading h1 {
  margin: 4px 0 0;
  white-space: nowrap;
}
.page-heading p {
  margin-top: 8px;
}
.headline {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  min-height: 275px;
  margin-bottom: 24px;
  background: #fff;
  border: 1px solid var(--workspace-line);
}
.headline-image {
  display: grid;
  place-items: center;
  overflow: hidden;
  height: 275px;
  background:
    radial-gradient(
      circle at 50% 50%,
      transparent 0 22%,
      #ffffff20 22.2% 22.5%,
      transparent 22.7% 35%,
      #ffffff16 35.2% 35.5%,
      transparent 35.7%
    ),
    linear-gradient(125deg, #8e211d, #bb4b38);
}
.headline-image img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 275px;
  object-fit: cover;
}
.headline-image span {
  color: #f6d8b8;
  font:
    180px "Songti SC",
    "SimSun",
    serif;
  line-height: 1;
  opacity: 0.62;
}
.headline-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 32px;
}
.headline-copy h2 {
  margin: 15px 0 10px;
  font-family: "Songti SC", "SimSun", serif;
  font-size: clamp(23px, 2vw, 30px);
  line-height: 1.45;
}
.headline-copy p {
  color: #849094;
  margin: 0 0 20px;
}
.headline-copy a,
.column-heading a {
  color: var(--party-red);
}
.headline-copy a:hover,
.column-heading a:hover {
  text-decoration: underline;
}
.search-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.search-panel .el-input {
  width: 210px;
}
.search-panel :deep(.el-button + .el-button) {
  margin-left: 0;
}
.content-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}
.content-column {
  min-height: 380px;
  padding: 24px 27px;
  background: #fff;
  border: 1px solid var(--workspace-line);
  border-top: 3px solid #d3a989;
}
.notice-column {
  border-top-color: var(--party-red);
}
.column-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 10px;
}
.column-heading h2 {
  margin: 0;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 23px;
}
.column-heading a {
  white-space: nowrap;
  font-size: 12px;
}
.content-column li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 63px;
  border-bottom: 1px solid #efede8;
}
.content-column li:last-child {
  border-bottom: 0;
}
.content-column li a {
  font-size: 15px;
  line-height: 1.45;
}
.content-column li a:hover {
  color: var(--party-red);
}
.content-column time {
  color: #9da7a9;
  font-size: 12px;
  white-space: nowrap;
}
.column-state {
  display: grid;
  place-content: center;
  min-height: 230px;
  color: #849094;
  text-align: center;
}
.column-state button {
  border: 0;
  background: none;
  color: var(--party-red);
  margin-top: 6px;
}
@media (max-width: 1050px) {
  .headline {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 800px) {
  .content-columns {
    grid-template-columns: 1fr;
  }
  .headline {
    grid-template-columns: 1fr;
  }
  .headline-image {
    height: 200px;
  }
  .headline-image img {
    max-height: 200px;
  }
  .headline-copy {
    padding: 24px;
  }
}
@media (max-width: 560px) {
  .title-search-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .heading-tools {
    width: 100%;
    justify-content: space-between;
    gap: 8px;
  }
  .page-heading h1 {
    font-size: 27px;
  }
  .search-panel {
    gap: 4px;
  }
  .search-panel .el-input {
    width: min(100px, 25vw);
  }
  .search-panel :deep(.el-button) {
    height: 30px;
    padding: 0 8px;
    font-size: 12px;
  }
  .content-column {
    padding: 20px;
  }
  .content-column li {
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 10px 0;
  }
}
@media (max-width: 360px) {
  .page-heading h1 {
    font-size: 23px;
  }
  .search-panel .el-input {
    width: 76px;
  }
}
</style>
