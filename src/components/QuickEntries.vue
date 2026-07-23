<script setup>
import { useAppStore } from '@/stores/app'

/**
 * QuickEntries - 快捷入口组件
 *
 * 4个图标入口按钮：思想汇报、下载专区、党校学习、培养档案
 * 每个入口包含图标 + 文字，悬停有缩放效果
 */

const store = useAppStore()
</script>

<template>
  <div class="quick-entries">
    <div
      v-for="entry in store.quickEntries"
      :key="entry.key"
      class="entry-card"
    >
      <div class="entry-icon" :style="{ background: entry.color }">
        <el-icon :size="28" color="#fff">
          <component :is="entry.icon" />
        </el-icon>
      </div>
      <span class="entry-label">{{ entry.label }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.quick-entries {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  background: var(--bg-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;

  &:hover {
    transform: translateY(-4px) scale(1.03);
    box-shadow: var(--shadow-hover);
  }

  &:active {
    transform: translateY(-2px) scale(1.01);
  }
}

.entry-icon {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;

  .entry-card:hover & {
    transform: rotate(-5deg) scale(1.1);
  }
}

.entry-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

/* 响应式 */
@media (max-width: 768px) {
  .quick-entries {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .quick-entries {
    gap: 12px;
  }

  .entry-card {
    padding: 20px 12px;
  }

  .entry-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
  }
}
</style>
