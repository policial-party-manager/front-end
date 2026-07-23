<script setup>
/**
 * App.vue - 根组件
 * 使用 router-view 渲染匹配的路由组件
 */
</script>

<template>
  <router-view />
</template>

<style lang="scss">
/* 全局 Element Plus 样式覆盖 */
.el-dropdown-menu__item {
  &.is-active-role {
    color: var(--party-red) !important;
    font-weight: 600;
  }
}
</style>
