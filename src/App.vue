<script setup lang="ts">
/**
 * App.vue - 根组件
 *
 * 全局布局：顶部导航栏 + 页面主体 + 底部版权 + 智能助手悬浮按钮
 * 导航栏和底部栏在所有页面中保持一致，方便用户随时切换模块
 *
 * 登录页（/login）为全屏独立页面，隐藏全局外壳
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import TopNav from "@/components/TopNav.vue";
import SideNav from "@/components/SideNav.vue";
import FooterBar from "@/components/FooterBar.vue";
import SmartAssistant from "@/components/SmartAssistant.vue";
import { useAppStore } from "@/stores/app";
import { getRouteViewKey } from "@/utils/route-view";

const route = useRoute();
const store = useAppStore();

// 登录页隐藏全局外壳，保持全屏居中
const isLoginPage = computed(() => route.path === "/login");
const routeViewKey = computed(() => getRouteViewKey(route, store.currentRole));
const sidebarOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);
</script>

<template>
  <div v-if="!isLoginPage" class="app-layout">
    <TopNav @toggle-menu="sidebarOpen = !sidebarOpen" />
    <div class="app-body">
      <button
        v-if="sidebarOpen"
        type="button"
        class="sidebar-backdrop"
        aria-label="关闭业务导航"
        @click="sidebarOpen = false"
      ></button>
      <div class="sidebar-wrapper" :class="{ open: sidebarOpen, collapsed: store.sidebarCollapsed }">
        <SideNav @navigate="sidebarOpen = false" />
      </div>
      <div class="app-content">
        <main class="app-main">
          <router-view v-slot="{ Component }">
            <component :is="Component" :key="routeViewKey" />
          </router-view>
        </main>
        <FooterBar />
      </div>
    </div>

    <!-- 智能助手悬浮按钮 -->
    <SmartAssistant />
  </div>
  <router-view v-else />
</template>

<style lang="scss">
.app-layout {
  min-height: 100vh;
}
.app-body {
  display: flex;
  min-height: calc(100vh - 66px);
}
.app-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
  min-width: 0;
}
.sidebar-backdrop {
  display: none;
}
.sidebar-wrapper {
  flex: none;
  width: var(--workspace-sidebar-width);
  transition: width 0.2s;
}
@media (min-width: 681px) {
  .sidebar-wrapper.collapsed {
    width: 68px;
  }
}
@media (max-width: 680px) {
  .sidebar-wrapper {
    position: fixed;
    top: 66px;
    bottom: 0;
    left: 0;
    width: var(--workspace-sidebar-width);
    z-index: 950;
    transform: translateX(-105%);
    transition: transform 0.2s;
    box-shadow: 8px 15px 30px rgba(23, 35, 41, 0.14);
  }
  .sidebar-wrapper.open {
    transform: none;
  }
  .sidebar-backdrop {
    display: block;
    position: fixed;
    z-index: 940;
    inset: 66px 0 0;
    border: 0;
    background: rgba(22, 30, 33, 0.34);
  }
}
</style>
