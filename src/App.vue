<script setup lang="ts">
/**
 * App.vue - 根组件
 *
 * 全局布局：顶部导航栏 + 页面主体 + 底部版权 + 智能助手悬浮按钮
 * 导航栏和底部栏在所有页面中保持一致，方便用户随时切换模块
 */
import TopNav from '@/components/TopNav.vue'
import FooterBar from '@/components/FooterBar.vue'
import SmartAssistant from '@/components/SmartAssistant.vue'
</script>

<template>
  <div class="app-layout">
    <!-- 顶部导航栏（sticky 固定，所有页面可见） -->
    <TopNav />

    <!-- 页面主体 -->
    <main class="app-main">
      <router-view />
    </main>

    <!-- 底部版权信息 -->
    <FooterBar />

    <!-- 智能助手悬浮按钮 -->
    <SmartAssistant />
  </div>
</template>

<style lang="scss">
/* 全局 Element Plus 样式覆盖 */
.el-dropdown-menu__item {
  &.is-active-role {
    color: var(--party-red) !important;
    font-weight: 600;
  }
}

/* 全局布局：flex 纵向排列，保证 footer 始终在页面底部 */
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
}
</style>
