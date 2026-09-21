<script setup lang="ts">
/**
 * App.vue - 根组件
 *
 * 全局布局：顶部导航栏 + 页面主体 + 底部版权 + 智能助手悬浮按钮
 * 导航栏和底部栏在所有页面中保持一致，方便用户随时切换模块
 *
 * 登录页（/login）为全屏独立页面，隐藏全局外壳
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import TopNav from "@/components/TopNav.vue";
import FooterBar from "@/components/FooterBar.vue";
import SmartAssistant from "@/components/SmartAssistant.vue";

const route = useRoute();

// 登录页隐藏全局外壳，保持全屏居中
const isLoginPage = computed(() => route.path === "/login");
</script>

<template>
  <div v-if="!isLoginPage" class="app-layout">
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
  <router-view v-else />
</template>

<style lang="scss">
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
