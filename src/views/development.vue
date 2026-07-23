<script setup>
/**
 * development.vue - 党员发展模块首页
 *
 * 党员发展全过程管理 - 成员列表与培养总览
 * 后续可扩展为完整的模块首页（统计数据 + 成员列表筛选 + 批量操作）
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const store = useAppStore()

/**
 * Mock 数据：发展对象列表
 * 字段：
 *   id - 成员ID
 *   name - 姓名
 *   studentId - 学号
 *   partyBranch - 所属党支部
 *   currentIdentity - 当前党员身份
 *   contactPerson - 培养联系人
 *   updateTime - 最后更新
 */
const memberList = ref([
  { id: 1, name: '张三', studentId: '20230101001', partyBranch: '计算机学院学生第一党支部', currentIdentity: '发展对象', contactPerson: '李老师', updateTime: '2026-07-20' },
  { id: 2, name: '李四', studentId: '20230101002', partyBranch: '计算机学院学生第一党支部', currentIdentity: '积极分子', contactPerson: '赵老师', updateTime: '2026-07-18' },
  { id: 3, name: '王五', studentId: '20230101003', partyBranch: '计算机学院学生第二党支部', currentIdentity: '预备党员', contactPerson: '陈老师', updateTime: '2026-07-15' },
  { id: 4, name: '赵六', studentId: '20230101004', partyBranch: '计算机学院学生第一党支部', currentIdentity: '入党申请人', contactPerson: '李老师', updateTime: '2026-07-12' },
  { id: 5, name: '孙七', studentId: '20230101005', partyBranch: '计算机学院学生第二党支部', currentIdentity: '积极分子', contactPerson: '周老师', updateTime: '2026-07-10' },
  { id: 6, name: '周八', studentId: '20220201006', partyBranch: '计算机学院学生第一党支部', currentIdentity: '正式党员', contactPerson: '李老师', updateTime: '2026-07-08' },
])

const identityTagMap = {
  '入党申请人': 'info',
  '积极分子': 'warning',
  '发展对象': 'primary',
  '预备党员': 'success',
  '正式党员': 'danger',
}

// 可调整身份的角色
const canAdjust = computed(() => {
  return store.currentRole === 'super_admin' || store.currentRole === 'party_secretary'
})

function goDetail(id) {
  router.push(`/development/member/${id}`)
}
</script>

<template>
  <div class="development-page">
    <div class="page-container">
      <!-- 页头 -->
      <div class="page-header">
        <h2 class="section-title">党员发展</h2>
        <p class="page-desc">党员发展全过程管理——培养、考察、发展一站式管理</p>
      </div>

      <!-- 统计概览 -->
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-num">{{ memberList.length }}</span>
          <span class="stat-label">在培成员</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ memberList.filter(m => m.currentIdentity === '发展对象').length }}</span>
          <span class="stat-label">发展对象</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ memberList.filter(m => m.currentIdentity === '预备党员').length }}</span>
          <span class="stat-label">预备党员</span>
        </div>
      </div>

      <!-- 成员列表 -->
      <div class="content-card">
        <div class="card-header">
          <span class="card-title">培养成员列表</span>
          <el-button
            v-if="canAdjust"
            type="primary"
            size="small"
            @click="router.push('/development/batch')"
          >
            批量调整
          </el-button>
        </div>
        <el-table :data="memberList" style="width: 100%" stripe>
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="studentId" label="学号" width="140" />
          <el-table-column prop="partyBranch" label="所属党支部" min-width="200" />
          <el-table-column label="当前身份" width="120">
            <template #default="{ row }">
              <el-tag :type="identityTagMap[row.currentIdentity] || 'info'" size="small">
                {{ row.currentIdentity }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="contactPerson" label="培养联系人" width="120" />
          <el-table-column prop="updateTime" label="最后更新" width="140" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="goDetail(row.id)">
                查看详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.development-page {
  padding: 24px 0 40px;
}

.page-header {
  margin-bottom: 24px;
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 4px;
}

.stats-row {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
}

.stat-item {
  flex: 1;
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--party-red, #C12C1F);
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary, #909399);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);

  &::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 18px;
    background: var(--party-red, #C12C1F);
    border-radius: 2px;
    margin-right: 10px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
}

@media (max-width: 768px) {
  .stats-row {
    flex-direction: column;
  }
}
</style>
