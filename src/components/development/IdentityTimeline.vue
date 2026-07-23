<script setup>
/**
 * IdentityTimeline.vue - 身份历史时间线组件
 *
 * 在成员培养主页的"身份历史"标签页中展示身份变化轨迹。
 * 使用 el-timeline 按时间倒序排列，不同身份对应不同节点颜色，
 * 支持点击展开查看详情。
 *
 * Props:
 *   historyList - 身份历史记录数组
 *     每条数据格式：
 *     {
 *       id: number,
 *       date: string,           // 时间（如 "2025-09-01"）
 *       identity: string,       // 身份名称
 *       reason: string,         // 操作原因
 *       operator: string,       // 操作人
 *       contact: string,        // 培养联系人（可选）
 *       previousIdentity: string, // 调整前身份（可选，用于详情）
 *       approver: string,       // 审批人（可选，用于详情）
 *       notes: string,          // 备注（可选，用于详情）
 *     }
 */

defineProps({
  historyList: {
    type: Array,
    default: () => [],
  },
})

// ============================================================
// 身份 → 颜色映射
// 普通学生: 灰色    入党申请人: 蓝色    积极分子: 橙色
// 发展对象: 紫色    预备党员:   金色    正式党员:   红色
// ============================================================
const identityColorMap = {
  '普通学生': '#909399',
  '共青团员': '#909399',
  '入党申请人': '#409EFF',
  '积极分子': '#E6A23C',
  '发展对象': '#9B59B6',
  '预备党员': '#D4A017',
  '正式党员': '#C12C1F',
}

// 身份标签类型映射（用于 el-tag）
const identityTagMap = {
  '普通学生': 'info',
  '共青团员': 'info',
  '入党申请人': '',       // 默认蓝色
  '积极分子': 'warning',
  '发展对象': '',        // 紫色，用自定义样式
  '预备党员': 'warning',  // 金色，用自定义样式覆盖
  '正式党员': 'danger',
}

// ============================================================
// 获取身份颜色
// ============================================================
function getIdentityColor(identity) {
  return identityColorMap[identity] || '#409EFF'
}

// ============================================================
// 获取标签类型
// ============================================================
function getTagType(identity) {
  return identityTagMap[identity] || 'info'
}

// ============================================================
// 是否为最后一个节点（最新记录，当前身份）
// ============================================================
function isLatest(index) {
  return index === 0
}

// ============================================================
// 展开/收起状态管理
// ============================================================
const expandedIds = new Set()

function isExpanded(id) {
  return expandedIds.has(id)
}

function toggleExpand(id) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}
</script>

<template>
  <div class="identity-timeline">
    <!-- 空状态 -->
    <el-empty
      v-if="!historyList || historyList.length === 0"
      description="暂无身份历史记录"
      :image-size="100"
    />

    <!-- 时间线 -->
    <el-timeline v-else>
      <el-timeline-item
        v-for="(item, index) in historyList"
        :key="item.id"
        :timestamp="item.date"
        placement="top"
        :color="getIdentityColor(item.identity)"
        :hollow="!isLatest(index)"
      >
        <!-- 身份卡片 -->
        <div
          class="timeline-node"
          :class="{ expanded: isExpanded(item.id) }"
          @click="toggleExpand(item.id)"
        >
          <!-- 摘要行：点击可展开/收起 -->
          <div class="node-summary">
            <div class="summary-top">
              <el-tag
                :type="getTagType(item.identity)"
                size="small"
                :class="{ 'custom-tag': !getTagType(item.identity) }"
                :style="!getTagType(item.identity) ? { backgroundColor: getIdentityColor(item.identity), borderColor: getIdentityColor(item.identity), color: '#fff' } : {}"
              >
                {{ item.identity }}
              </el-tag>
              <span class="summary-reason">{{ item.reason }}</span>
              <el-icon class="expand-icon" :class="{ rotated: isExpanded(item.id) }">
                <ArrowDown />
              </el-icon>
            </div>
            <div class="summary-bottom">
              <span class="meta-item">
                <el-icon><User /></el-icon> {{ item.operator }}
              </span>
              <span v-if="item.contact" class="meta-item meta-contact">
                <el-icon><Phone /></el-icon> {{ item.contact }}
              </span>
            </div>
          </div>

          <!-- 展开详情 -->
          <transition name="expand-detail">
            <div v-if="isExpanded(item.id)" class="node-detail">
              <div class="detail-divider" />
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">操作时间</span>
                  <span class="detail-value">{{ item.date }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">操作人</span>
                  <span class="detail-value">{{ item.operator }}</span>
                </div>
                <div class="detail-item" v-if="item.previousIdentity">
                  <span class="detail-label">调整前身份</span>
                  <span class="detail-value">{{ item.previousIdentity }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">调整后身份</span>
                  <span class="detail-value highlight">{{ item.identity }}</span>
                </div>
                <div class="detail-item detail-full">
                  <span class="detail-label">调整原因</span>
                  <span class="detail-value">{{ item.reason }}</span>
                </div>
                <div class="detail-item" v-if="item.approver">
                  <span class="detail-label">审批人</span>
                  <span class="detail-value">{{ item.approver }}</span>
                </div>
                <div class="detail-item detail-full" v-if="item.notes">
                  <span class="detail-label">备注</span>
                  <span class="detail-value">{{ item.notes }}</span>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </el-timeline-item>
    </el-timeline>

    <!-- 图例 -->
    <div v-if="historyList && historyList.length > 0" class="timeline-legend">
      <span class="legend-title">身份图例：</span>
      <span
        v-for="(color, identity) in identityColorMap"
        :key="identity"
        class="legend-item"
      >
        <span class="legend-dot" :style="{ backgroundColor: color }"></span>
        {{ identity }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * IdentityTimeline.vue 样式
 * ============================================================ */

.identity-timeline {
  padding: 16px 0;
}

/* ---- 时间线节点卡片 ---- */
.timeline-node {
  background: var(--bg-white, #fff);
  border: 1px solid var(--border-color, #EBEEF5);
  border-radius: var(--radius-base, 8px);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    box-shadow: var(--shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.12));
    border-color: var(--party-red, #C12C1F);
  }

  &.expanded {
    border-color: var(--party-red, #C12C1F);
  }
}

/* ---- 摘要行 ---- */
.summary-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-reason {
  font-size: 14px;
  color: var(--text-primary, #2C3E50);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  flex-shrink: 0;
  transition: transform 0.3s ease;

  &.rotated {
    transform: rotate(180deg);
  }
}

.summary-bottom {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.meta-contact {
  color: var(--party-red, #C12C1F);
}

/* ---- 展开详情 ---- */
.detail-divider {
  height: 1px;
  background: var(--border-light, #F2F6FC);
  margin: 12px 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.detail-full {
    grid-column: 1 / -1;
  }
}

.detail-label {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.detail-value {
  font-size: 14px;
  color: var(--text-primary, #2C3E50);

  &.highlight {
    color: var(--party-red, #C12C1F);
    font-weight: 600;
  }
}

/* ---- 展开动画 ---- */
.expand-detail-enter-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-detail-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-detail-enter-from,
.expand-detail-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-detail-enter-to,
.expand-detail-leave-from {
  opacity: 1;
  max-height: 300px;
}

/* ---- 图例 ---- */
.timeline-legend {
  margin-top: 20px;
  padding: 12px 16px;
  background: var(--bg-page, #F5F6FA);
  border-radius: var(--radius-base, 8px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.legend-title {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  flex-shrink: 0;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-regular, #606266);
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
