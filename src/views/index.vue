<script setup>
/**
 * index.vue - 首页主文件
 *
 * 党建云平台——党员发展全过程管理系统 首页
 * 组件结构（从上到下）：
 *   1. TopNav - 顶部导航栏
 *   2. StatCards - 统计卡片行
 *   3. CarouselBanner - 轮播图区域
 *   4. NewsSection - 双栏内容区（党建新闻 + 通知公告）
 *   5. QuickEntries - 快捷入口
 *   6. FooterBar - 底部版权信息
 *   7. SmartAssistant - 智能助手悬浮按钮
 */

import TopNav from '@/components/TopNav.vue'
import StatCards from '@/components/StatCards.vue'
import CarouselBanner from '@/components/CarouselBanner.vue'
import NewsSection from '@/components/NewsSection.vue'
import QuickEntries from '@/components/QuickEntries.vue'
import FooterBar from '@/components/FooterBar.vue'
import SmartAssistant from '@/components/SmartAssistant.vue'
</script>

<template>
  <div class="home-page">
    <!-- 1. 顶部导航栏（sticky 固定） -->
    <TopNav />

    <!-- 页面主体 -->
    <main class="page-main">
      <div class="page-container">
        <!-- 2. 统计卡片行 -->
        <section class="page-section">
          <StatCards />
        </section>

        <!-- 3. 轮播图区域 -->
        <section class="page-section">
          <CarouselBanner />
        </section>

        <!-- 4. 双栏内容区 -->
        <section class="page-section">
          <NewsSection />
        </section>

        <!-- 5. 快捷入口 -->
        <section class="page-section">
          <QuickEntries />
        </section>
      </div>
    </main>

    <!-- 6. 底部版权信息 -->
    <FooterBar />

    <!-- 7. 智能助手悬浮按钮 -->
    <SmartAssistant />
  </div>
</template>

<style lang="scss" scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-main {
  flex: 1;
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
  .page-main {
    padding: 16px 0 24px;
  }

  .page-container {
    padding: 0 12px;
  }

  .page-section {
    margin-bottom: 16px;
  }
}
</style>
