<script setup lang="ts">
/**
 * members.vue - 成员管理模块（占位页面）
 * TODO: 实现完整的成员管理功能
 */
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>

<template>
  <div class="placeholder-page">
    <div class="page-container">
      <h2 class="section-title">成员管理</h2>
      <div class="content-card">
        <el-empty description="成员管理模块开发中，敬请期待" :image-size="120" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.placeholder-page {
  padding: 24px 0 40px;
}
</style>
