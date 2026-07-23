<script setup>
/**
 * SmartAssistant - 智能助手悬浮按钮（加分项）
 *
 * 右下角悬浮按钮，仅做UI展示，不实现实际功能
 * 悬停有脉冲动画效果
 * 点击提示"功能开发中"
 */

function handleClick() {
  // 功能预留，后续可接入AI对话能力
  console.log('智能助手功能开发中...')
}
</script>

<template>
  <div class="smart-assistant" title="智能助手" @click="handleClick">
    <div class="assistant-pulse"></div>
    <div class="assistant-btn">
      <el-icon :size="24" color="#fff"><ChatDotRound /></el-icon>
    </div>
    <span class="assistant-tip">智能助手</span>
  </div>
</template>

<style lang="scss" scoped>
.smart-assistant {
  position: fixed;
  right: 28px;
  bottom: 80px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.assistant-btn {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C12C1F, #E84646);
  box-shadow: 0 4px 16px rgba(193, 44, 31, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;
  z-index: 2;

  .smart-assistant:hover & {
    transform: scale(1.1);
  }
}

/* 脉冲动画 */
.assistant-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(193, 44, 31, 0.3);
  transform: translate(-50%, -50%);
  animation: pulse 2s ease-in-out infinite;
  z-index: 1;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 0;
  }
}

.assistant-tip {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}
</style>
