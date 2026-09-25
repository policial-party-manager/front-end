<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { pageNews, pageNotices } from "@/api/content";

interface ListRow {
  id: number;
  title: string;
  date: string;
}

const route = useRoute();
const router = useRouter();
const kind = computed(() => (route.path === "/notice" ? "notice" : "news"));
const title = computed(() => (kind.value === "news" ? "党建新闻" : "通知公告"));
const keyword = ref("");
const rows = ref<ListRow[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref(false);
const pageSize = 10;
let requestNumber = 0;

const queryKeyword = computed(() => (typeof route.query.keyword === "string" ? route.query.keyword.trim() : ""));
const currentPage = computed(() => {
  const value = Number(route.query.page);
  return Number.isInteger(value) && value > 0 ? value : 1;
});

async function load(): Promise<void> {
  const currentRequest = ++requestNumber;
  loading.value = true;
  error.value = false;
  try {
    const params = { page: currentPage.value, size: pageSize, keyword: queryKeyword.value || undefined };
    if (kind.value === "news") {
      const result = await pageNews(params);
      if (currentRequest !== requestNumber) return;
      rows.value = result.records.map((item) => ({
        id: item.id,
        title: item.title,
        date: item.createTime?.slice(0, 10) || "—",
      }));
      total.value = result.total;
    } else {
      const result = await pageNotices(params);
      if (currentRequest !== requestNumber) return;
      rows.value = result.records.map((item) => ({
        id: item.id,
        title: item.title,
        date: item.publishTime?.slice(0, 10) || "—",
      }));
      total.value = result.total;
    }
  } catch {
    if (currentRequest !== requestNumber) return;
    rows.value = [];
    total.value = 0;
    error.value = true;
  } finally {
    if (currentRequest === requestNumber) loading.value = false;
  }
}

function search(): void {
  const nextKeyword = keyword.value.trim();
  if (nextKeyword === queryKeyword.value && currentPage.value === 1) {
    void load();
    return;
  }
  void router.push({ path: route.path, query: nextKeyword ? { keyword: nextKeyword } : {} });
}

function reset(): void {
  keyword.value = "";
  if (!queryKeyword.value && currentPage.value === 1) {
    void load();
    return;
  }
  void router.push({ path: route.path });
}

function setPage(page: number): void {
  void router.push({
    path: route.path,
    query: { ...(queryKeyword.value ? { keyword: queryKeyword.value } : {}), page: String(page) },
  });
}

watch(
  [kind, queryKeyword, currentPage],
  () => {
    keyword.value = queryKeyword.value;
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <div class="workspace-page article-list-page">
    <div class="workspace-breadcrumb">
      <router-link to="/content">资讯公告</router-link> / <span>{{ title }}</span>
    </div>
    <div class="workspace-heading">
      <div>
        <h1>{{ title }}</h1>
        <p>查看已发布的{{ title }}，支持关键词检索。</p>
      </div>
    </div>
    <section class="workspace-panel list-panel">
      <form class="list-search" @submit.prevent="search">
        <label for="list-keyword">关键词</label>
        <el-input id="list-keyword" v-model="keyword" clearable maxlength="80" placeholder="搜索标题或正文" />
        <el-button type="primary" native-type="submit" :loading="loading">搜索</el-button>
        <el-button :disabled="loading" @click="reset">重置</el-button>
      </form>
      <div class="list-summary">
        <strong>{{ title }}</strong
        ><span v-if="!loading && !error">共 {{ total }} 条</span>
      </div>
      <div v-if="loading" class="list-state" role="status">正在加载…</div>
      <div v-else-if="error" class="list-state" role="alert">内容加载失败。<button @click="load">重试</button></div>
      <div v-else-if="!rows.length" class="list-state">{{ queryKeyword ? "没有匹配的内容" : "暂无已发布内容" }}</div>
      <ul v-else class="article-rows">
        <li v-for="(item, index) in rows" :key="item.id">
          <span class="row-index">{{ String((currentPage - 1) * pageSize + index + 1).padStart(2, "0") }}</span>
          <router-link :to="`/${kind}/${item.id}`">{{ item.title }}</router-link>
          <time :datetime="item.date">{{ item.date }}</time>
        </li>
      </ul>
      <div v-if="total > pageSize" class="list-footer">
        <el-pagination
          :current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          background
          @current-change="setPage"
        />
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.article-list-page {
  max-width: 1180px;
}
.workspace-breadcrumb a:hover {
  color: var(--party-red);
}
.list-panel {
  padding: 24px 28px 28px;
}
.list-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 16px 18px;
  background: #f8f7f3;
}
.list-search label {
  margin-right: 8px;
  color: #68777b;
}
.list-search .el-input {
  width: min(340px, 100%);
}
.list-search :deep(.el-button + .el-button) {
  margin-left: 0;
}
.list-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #3e4c50;
  padding: 22px 2px 13px;
}
.list-summary strong {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 21px;
}
.list-summary span {
  color: #939e9f;
  font-size: 12px;
}
.article-rows li {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 110px;
  gap: 16px;
  align-items: center;
  min-height: 66px;
  padding: 8px 10px;
  border-bottom: 1px solid #ecece7;
}
.article-rows li:nth-child(even) {
  background: #fbfbf9;
}
.article-rows li:hover {
  background: #f9f1ef;
}
.row-index {
  color: #aab1b0;
  font:
    16px Georgia,
    serif;
}
.article-rows a {
  font-size: 15px;
  line-height: 1.5;
}
.article-rows a:hover {
  color: var(--party-red);
}
.article-rows time {
  color: #8f9a9d;
  font-size: 12px;
  text-align: right;
}
.list-state {
  display: grid;
  place-content: center;
  min-height: 260px;
  color: #879295;
  text-align: center;
}
.list-state button {
  color: var(--party-red);
  border: 0;
  background: none;
  margin-top: 8px;
}
.list-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 22px;
}
@media (max-width: 600px) {
  .list-panel {
    padding: 16px;
  }
  .article-rows li {
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 5px 10px;
  }
  .article-rows time {
    grid-column: 2;
    text-align: left;
  }
}
</style>
