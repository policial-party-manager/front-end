<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "@/stores/app";

/**
 * StatCards - 统计卡片行组件
 *
 * 展示4张统计卡片：总成员数、积极分子、发展对象、本周活动
 * 卡片鼠标悬停有上浮效果
 * 数据来源于 Pinia store，根据角色展示不同数据
 */

const store = useAppStore();

const cards = computed(() => [
  {
    key: "totalMembers",
    label: "总成员数",
    value: store.statData.totalMembers,
    unit: "人",
    icon: "User",
    color: "#C12C1F",
    bgColor: "rgba(193, 44, 31, 0.1)",
  },
  {
    key: "activists",
    label: "积极分子",
    value: store.statData.activists,
    unit: "人",
    icon: "Star",
    color: "#E84646",
    bgColor: "rgba(232, 70, 70, 0.1)",
  },
  {
    key: "developmentCandidates",
    label: "发展对象",
    value: store.statData.developmentCandidates,
    unit: "人",
    icon: "Medal",
    color: "#D4513A",
    bgColor: "rgba(212, 81, 58, 0.1)",
  },
  {
    key: "weeklyActivities",
    label: "本周活动",
    value: store.statData.weeklyActivities,
    unit: "场",
    icon: "Calendar",
    color: "#B8302A",
    bgColor: "rgba(184, 48, 42, 0.1)",
  },
]);
</script>

<template>
  <!--
    角色说明：统计卡片数据根据当前角色动态变化。
    - 超级管理员：展示全平台数据（当前默认）
    - 其他角色：展示对应范围数据
    数据逻辑见 stores/app.js 中的 statData
  -->
  <div class="stat-cards">
    <div v-for="card in cards" :key="card.key" class="stat-card">
      <div class="card-icon" :style="{ background: card.bgColor, color: card.color }">
        <el-icon :size="28">
          <component :is="card.icon" />
        </el-icon>
      </div>
      <div class="card-info">
        <div class="card-value" :style="{ color: card.color }">
          {{ card.value }}
          <span class="card-unit">{{ card.unit }}</span>
        </div>
        <div class="card-label">{{ card.label }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: var(--bg-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* 鼠标悬停上浮效果 */
  &:hover {
    transform: translateY(-6px);
    box-shadow: var(--shadow-hover);
  }
}

.card-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.card-unit {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 2px;
}

.card-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* 响应式 */
@media (max-width: 1200px) {
  .stat-cards {
    gap: 16px;
  }

  .stat-card {
    padding: 20px;
  }

  .card-value {
    font-size: 28px;
  }
}

@media (max-width: 992px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 576px) {
  .stat-cards {
    grid-template-columns: 1fr;
  }

  .stat-card {
    padding: 16px;
  }

  .card-value {
    font-size: 24px;
  }
}
</style>
