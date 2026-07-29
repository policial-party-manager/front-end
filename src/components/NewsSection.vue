<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";

/**
 * NewsSection - 双栏内容区组件
 *
 * 左侧：党建新闻列表
 * 右侧：通知公告列表
 * 每条列表项支持鼠标悬停变色效果，点击跳转详情页
 * 右下角"更多>>"链接
 */

const router = useRouter();
const store = useAppStore();

/** 点击新闻标题，跳转到新闻详情页 */
function goToNewsDetail(id: number): void {
  router.push(`/news/${id}`);
}

/** 点击公告标题，跳转到公告详情页 */
function goToNoticeDetail(id: number): void {
  router.push(`/notice/${id}`);
}

/** 点击"更多"按钮，跳转到新闻列表页 */
function goToNewsList(): void {
  router.push("/news");
}

/** 点击"更多"按钮，跳转到公告列表页 */
function goToNoticeList(): void {
  router.push("/notice");
}
</script>

<template>
  <div class="news-section">
    <!-- 左侧：党建新闻 -->
    <div class="content-card news-panel">
      <h3 class="section-title">党建新闻</h3>
      <ul class="news-list">
        <li v-for="item in store.newsList" :key="item.id" class="news-item" @click="goToNewsDetail(item.id)">
          <span class="news-title" :title="item.title">{{ item.title }}</span>
          <span class="news-date">{{ item.date }}</span>
        </li>
      </ul>
      <div class="panel-footer">
        <a class="more-link" @click.prevent="goToNewsList">更多 &raquo;</a>
      </div>
    </div>

    <!-- 右侧：通知公告 -->
    <div class="content-card news-panel">
      <h3 class="section-title">通知公告</h3>
      <ul class="news-list">
        <li v-for="item in store.noticeList" :key="item.id" class="news-item" @click="goToNoticeDetail(item.id)">
          <span class="news-title" :title="item.title">{{ item.title }}</span>
          <span class="news-date">{{ item.date }}</span>
        </li>
      </ul>
      <div class="panel-footer">
        <a class="more-link" @click.prevent="goToNoticeList">更多 &raquo;</a>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.news-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.news-panel {
  display: flex;
  flex-direction: column;
}

.news-list {
  flex: 1;
}

.news-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s;

  /* 悬停变色效果 */
  &:hover {
    padding-left: 8px;
    padding-right: 4px;

    .news-title {
      color: var(--party-red);
    }
  }

  &:last-child {
    border-bottom: none;
  }
}

.news-title {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: color 0.2s;
  padding-right: 16px;
}

.news-date {
  font-size: 13px;
  color: var(--text-placeholder);
  white-space: nowrap;
  flex-shrink: 0;
}

.panel-footer {
  text-align: right;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  margin-top: auto;
}

/* 响应式 */
@media (max-width: 768px) {
  .news-section {
    grid-template-columns: 1fr;
  }
}
</style>
