<script setup lang="ts">
/**
 * index.vue - 首页主文件
 *
 * 党建云平台——党员发展全过程管理系统 首页
 * 组件结构（从上到下）：
 *   1. StatCards - 统计卡片行
 *   2. CarouselBanner - 轮播图区域
 *   3. NewsSection - 双栏内容区（党建新闻 + 通知公告）
 *   4. QuickEntries - 快捷入口
 *
 * 注：TopNav / FooterBar / SmartAssistant 已提升至 App.vue 全局布局
 */

import StatCards from '@/components/StatCards.vue'
import CarouselBanner from '@/components/CarouselBanner.vue'
import NewsSection from '@/components/NewsSection.vue'
import QuickEntries from '@/components/QuickEntries.vue'
</script>

<template>
  <div class="home-page">
    <div class="page-container">
      <!-- 1. 统计卡片行 -->
      <section class="page-section">
        <StatCards />
      </section>

      <!-- 2. 轮播图区域 -->
      <section class="page-section">
        <CarouselBanner />
      </section>

      <!-- 3. 双栏内容区 -->
      <section class="page-section">
        <NewsSection />
      </section>

      <!-- 4. 快捷入口 -->
      <section class="page-section">
        <QuickEntries />
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.home-page {
  padding: 24px 0 40px;
}

.page-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .home-page {
    padding: 16px 0 24px;
  }
}
</style>
