<script setup>
/**
 * MemberDetail.vue - 党员发展模块 - 成员培养主页
 *
 * 页面路径：/development/member/:id
 * 布局：左侧 30% 成员基本信息卡片 + 右侧 70% 培养信息标签页
 *
 * 权限说明：
 *   - super_admin（超级管理员）：可调整身份
 *   - party_secretary（支委）：可调整身份
 *   - party_member / activist（普通成员）：不可调整身份
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
import AdjustIdentityDialog from '@/components/AdjustIdentityDialog.vue'
import IdentityTimeline from '@/components/development/IdentityTimeline.vue'

const route = useRoute()
const router = useRouter()
const userStore = useAppStore()

// ============================================================
// 权限判断
//   canAdjustIdentity: 超级管理员和支委可调整身份，普通成员不可
// ============================================================
const canAdjustIdentity = computed(() => {
  return userStore.currentRole === 'super_admin' || userStore.currentRole === 'party_secretary'
})

// ============================================================
// Mock 数据：成员详情
// ============================================================
const memberInfo = ref({
  name: '张三',                     // 姓名
  studentId: '20230101001',         // 学号
  gender: '男',                     // 性别
  college: '计算机科学与工程学院',    // 学院
  major: '软件工程',                 // 专业
  class: '软件2301班',              // 班级
  partyBranch: '计算机学院学生第一党支部', // 所属党支部
  currentIdentity: '发展对象',       // 当前党员身份
  phone: '138****6789',            // 联系电话
  email: 'zhangsan@example.com',   // 电子邮箱
})

// 身份标签颜色映射
const identityTagType = computed(() => {
  const map = {
    '入党申请人': 'info',
    '积极分子': 'warning',
    '发展对象': 'primary',
    '预备党员': 'success',
    '正式党员': 'danger',
  }
  return map[memberInfo.value.currentIdentity] || 'info'
})

// ============================================================
// Mock 数据：培养联系人
// ============================================================
const contactPerson = ref({
  name: '李老师',     // 联系人姓名
  role: '党支部书记', // 联系人职务
  phone: '139****5678',
})

// ============================================================
// Mock 数据：培养记录（至少 1 条）
// 字段：id, name(材料名称), uploadTime(上传时间), operator(操作人)
// ============================================================
const trainingRecords = ref([
  {
    id: 1,
    name: '入党积极分子培养考察登记表',
    uploadTime: '2026-03-15 14:30',
    operator: '李老师',
  },
])

// ============================================================
// Mock 数据：思想汇报（至少 3 条）
// 字段：id, title(标题), submitTime(提交时间), status(状态: pending/approved/rejected)
// ============================================================
const thoughtReports = ref([
  {
    id: 1,
    title: '2026年第一季度思想汇报——学习党的二十届三中全会精神心得',
    submitTime: '2026-03-28',
    status: 'approved',     // 已通过
  },
  {
    id: 2,
    title: '2026年第二季度思想汇报——关于党员先锋模范作用的思考',
    submitTime: '2026-06-20',
    status: 'pending',      // 待审核
  },
  {
    id: 3,
    title: '2025年第四季度思想汇报——对当前时事政治的思考与认识',
    submitTime: '2025-12-25',
    status: 'rejected',     // 已驳回
  },
])

// 思想汇报状态映射
const reportStatusMap = {
  pending: { label: '待审核', type: 'warning' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
}

// ============================================================
// Mock 数据：活动参与（至少 3 条）
// 字段：id, name(活动名称), time(活动时间), checkInStatus(签到状态)
// ============================================================
const activities = ref([
  {
    id: 1,
    name: '"学党史、悟思想"主题党日活动',
    time: '2026-07-15 09:00',
    checkInStatus: '已签到',
  },
  {
    id: 2,
    name: '红色教育基地参观学习活动',
    time: '2026-06-10 08:30',
    checkInStatus: '已签到',
  },
  {
    id: 3,
    name: '党建知识竞赛活动',
    time: '2026-05-20 14:00',
    checkInStatus: '未签到',
  },
])

// ============================================================
// Mock 数据：身份历史（4-5 条，按时间倒序）
// 字段：id, time(时间), identityName(身份名称), reason(操作原因),
//       operator(操作人), contactPerson(培养联系人，如有)
// ============================================================
const identityHistory = ref([
  {
    id: 5,
    time: '2026-06-01',
    identityName: '发展对象',
    previousIdentity: '积极分子',     // 调整前身份
    reason: '经支部委员会讨论，该同志表现突出，确定为发展对象',
    operator: '李老师',
    approver: '王书记',              // 审批人
    contactPerson: '李老师',
    notes: '该同志在积极分子期间表现优异，支部大会全票通过',  // 备注
  },
  {
    id: 4,
    time: '2025-09-15',
    identityName: '积极分子',
    previousIdentity: '入党申请人',
    reason: '入党申请审核通过，经支部大会讨论确定为入党积极分子',
    operator: '王书记',
    approver: '王书记',
    contactPerson: '赵老师',
    notes: '入党申请书材料齐全，团组织推优通过',
  },
  {
    id: 3,
    time: '2025-06-10',
    identityName: '入党申请人',
    previousIdentity: '共青团员',
    reason: '提交入党申请书，进入入党申请人考察阶段',
    operator: '王书记',
    approver: '王书记',
    contactPerson: null,    // 入党申请人阶段暂无培养联系人
    notes: null,
  },
  {
    id: 2,
    time: '2025-03-01',
    identityName: '入党申请人',
    previousIdentity: '共青团员',
    reason: '参加入党启蒙教育，表达入党意愿',
    operator: '系统',
    approver: null,
    contactPerson: null,
    notes: '系统自动记录',
  },
  {
    id: 1,
    time: '2024-09-01',
    identityName: '共青团员',
    previousIdentity: '普通学生',
    reason: '大一新生入学，团组织关系转入',
    operator: '系统',
    approver: null,
    contactPerson: null,
    notes: '系统自动记录',
  },
])

// 将 identityHistory 映射为 IdentityTimeline 组件所需的数据格式
const timelineData = computed(() => {
  return identityHistory.value.map(item => ({
    id: item.id,
    date: item.time,
    identity: item.identityName,
    reason: item.reason,
    operator: item.operator,
    contact: item.contactPerson || '',
    previousIdentity: item.previousIdentity || '',
    approver: item.approver || '',
    notes: item.notes || '',
  }))
})

// ============================================================
// 加载状态
// ============================================================
const loading = ref(false)

// ============================================================
// 弹窗控制
// ============================================================
const adjustDialogVisible = ref(false)       // 调整身份弹窗
const uploadDialogVisible = ref(false)        // 上传材料弹窗

// 传给 AdjustIdentityDialog 的成员信息（字段映射：studentId -> studentNo）
const adjustDialogMemberInfo = computed(() => ({
  id: memberInfo.value.studentId,   // 用学号作为成员 ID
  name: memberInfo.value.name,
  studentNo: memberInfo.value.studentId,
  currentIdentity: memberInfo.value.currentIdentity,
}))

// ============================================================
// 当前激活的标签页
// ============================================================
const activeTab = ref('training')

// ============================================================
// 方法：获取成员详情（当前使用 Mock 数据）
// ============================================================
async function fetchMemberDetail() {
  const memberId = route.params.id
  loading.value = true
  try {
    // TODO: 替换为真实 API 调用
    // const res = await api.getMemberDetail(memberId)
    // memberInfo.value = res.data

    // 当前使用组件内 Mock 数据，模拟加载延迟
    await new Promise((resolve) => setTimeout(resolve, 300))
    console.log(`[Mock] 获取成员 ${memberId} 的培养详情数据`)
  } catch (error) {
    ElMessage.error('获取成员详情失败')
  } finally {
    loading.value = false
  }
}

// ============================================================
// 方法：调整身份
// ============================================================
function handleAdjustIdentity() {
  adjustDialogVisible.value = true
}

// ============================================================
// 方法：调整身份成功后的回调（刷新数据）
// ============================================================
function handleAdjustSuccess() {
  // TODO: 替换为真实的刷新逻辑
  // 重新获取成员详情
  fetchMemberDetail()
}

// ============================================================
// 方法：批量调整 → 跳转到批量调整页面
// ============================================================
function handleBatchAdjust() {
  router.push('/development/batch')
}

// ============================================================
// 方法：上传材料（预留，本次仅弹窗占位）
// ============================================================
function handleUploadMaterial() {
  // TODO: 实现上传材料逻辑
  ElMessage.info('上传材料功能开发中')
  uploadDialogVisible.value = true
}

// ============================================================
// 生命周期：页面加载时获取数据
// ============================================================
onMounted(() => {
  fetchMemberDetail()
})
</script>

<template>
  <div class="member-detail-page">
    <div class="detail-layout" v-loading="loading">
      <!-- ==================== 左侧：成员基本信息卡片 ==================== -->
      <aside class="left-panel">
        <el-card class="member-card" shadow="hover">
          <!-- 头像区域 -->
          <div class="avatar-section">
            <div class="avatar-placeholder">
              <img
                src="@/assets/images/Party/党徽黄色1024X1024.png"
                alt="党徽"
                class="party-emblem"
              />
            </div>
          </div>

          <!-- 姓名 -->
          <h2 class="member-name">{{ memberInfo.name }}</h2>

          <!-- 基本信息列表 -->
          <div class="info-list">
            <div class="info-item">
              <span class="info-label">学号</span>
              <span class="info-value">{{ memberInfo.studentId }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">性别</span>
              <span class="info-value">{{ memberInfo.gender }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">学院</span>
              <span class="info-value">{{ memberInfo.college }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">专业</span>
              <span class="info-value">{{ memberInfo.major }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">班级</span>
              <span class="info-value">{{ memberInfo.class }}</span>
            </div>
            <div class="info-divider" />
            <div class="info-item">
              <span class="info-label">所属党支部</span>
              <span class="info-value">{{ memberInfo.partyBranch }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前身份</span>
              <span class="info-value">
                <el-tag :type="identityTagType" size="small">
                  {{ memberInfo.currentIdentity }}
                </el-tag>
              </span>
            </div>
            <div class="info-divider" />
            <div class="info-item">
              <span class="info-label">联系电话</span>
              <span class="info-value">{{ memberInfo.phone }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">电子邮箱</span>
              <span class="info-value">{{ memberInfo.email }}</span>
            </div>
          </div>
        </el-card>
      </aside>

      <!-- ==================== 右侧：培养信息主区域 ==================== -->
      <section class="right-panel">
        <!-- 顶部：状态栏 + 操作按钮 -->
        <div class="top-bar">
          <div class="top-bar-left">
            <span class="identity-label">
              当前身份：<el-tag :type="identityTagType" size="large">
                {{ memberInfo.currentIdentity }}
              </el-tag>
            </span>
            <span class="contact-info">
              培养联系人：{{ contactPerson.name }}（{{ contactPerson.role }}）
              &nbsp;{{ contactPerson.phone }}
            </span>
          </div>
          <div class="top-bar-right">
            <!--
              权限控制：仅超级管理员和支委可见调整身份按钮
              canAdjustIdentity 在 script 中通过 userStore.currentRole 计算
            -->
            <el-button
              v-if="canAdjustIdentity"
              type="primary"
              @click="handleAdjustIdentity"
            >
              调整身份
            </el-button>
            <el-button
              v-if="canAdjustIdentity"
              type="warning"
              @click="handleBatchAdjust"
            >
              批量调整
            </el-button>
          </div>
        </div>

        <!-- 标签页 -->
        <el-card class="tabs-card" shadow="never">
          <el-tabs v-model="activeTab" class="detail-tabs">
            <!-- ===== 培养记录 ===== -->
            <el-tab-pane label="培养记录" name="training">
              <div class="tab-header">
                <span class="tab-title">培养材料列表</span>
                <el-button type="primary" size="small" @click="handleUploadMaterial">
                  上传材料
                </el-button>
              </div>
              <el-table :data="trainingRecords" style="width: 100%" stripe>
                <el-table-column prop="name" label="材料名称" min-width="200" />
                <el-table-column prop="uploadTime" label="上传时间" width="180" />
                <el-table-column prop="operator" label="操作人" width="120" />
              </el-table>
              <el-empty
                v-if="trainingRecords.length === 0"
                description="暂无培养记录"
              />
            </el-tab-pane>

            <!-- ===== 思想汇报 ===== -->
            <el-tab-pane label="思想汇报" name="report">
              <div class="tab-header">
                <span class="tab-title">思想汇报列表</span>
              </div>
              <el-table :data="thoughtReports" style="width: 100%" stripe>
                <el-table-column prop="title" label="标题" min-width="280" />
                <el-table-column prop="submitTime" label="提交时间" width="140" />
                <el-table-column label="状态" width="120">
                  <template #default="{ row }">
                    <el-tag
                      :type="reportStatusMap[row.status]?.type || 'info'"
                      size="small"
                    >
                      {{ reportStatusMap[row.status]?.label || row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty
                v-if="thoughtReports.length === 0"
                description="暂无思想汇报"
              />
            </el-tab-pane>

            <!-- ===== 活动参与 ===== -->
            <el-tab-pane label="活动参与" name="activity">
              <div class="tab-header">
                <span class="tab-title">活动参与记录</span>
              </div>
              <el-table :data="activities" style="width: 100%" stripe>
                <el-table-column prop="name" label="活动名称" min-width="240" />
                <el-table-column prop="time" label="活动时间" width="180" />
                <el-table-column label="签到状态" width="120">
                  <template #default="{ row }">
                    <el-tag
                      :type="row.checkInStatus === '已签到' ? 'success' : 'info'"
                      size="small"
                    >
                      {{ row.checkInStatus }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty
                v-if="activities.length === 0"
                description="暂无活动记录"
              />
            </el-tab-pane>

            <!-- ===== 身份历史 ===== -->
            <el-tab-pane label="身份历史" name="history">
              <div class="tab-header">
                <span class="tab-title">身份变化轨迹</span>
              </div>
              <IdentityTimeline :history-list="timelineData" />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </section>
    </div>

    <!-- ==================== 调整身份弹窗 ==================== -->
    <AdjustIdentityDialog
      v-model:visible="adjustDialogVisible"
      :member-info="adjustDialogMemberInfo"
      @success="handleAdjustSuccess"
    />

    <!-- ==================== 上传材料弹窗（占位） ==================== -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="上传培养材料"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="dialog-placeholder">
        <el-empty description="上传材料功能开发中，敬请期待" />
      </div>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * MemberDetail.vue 样式
 * 主色调沿用党建红 #C12C1F
 * ============================================================ */

.member-detail-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

/* ---- 两栏布局 ---- */
.detail-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

/* ==================== 左侧面板 30% ==================== */
.left-panel {
  flex: 0 0 30%;
  width: 30%;
}

.member-card {
  text-align: center;

  :deep(.el-card__body) {
    padding: 32px 24px;
  }
}

/* 头像区域 */
.avatar-section {
  margin-bottom: 16px;
}

.avatar-placeholder {
  width: 100px;
  height: 100px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFF5F5, #FFE8E8);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--party-red, #C12C1F);

  .party-emblem {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }
}

.member-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);
  margin-bottom: 20px;
}

/* 信息列表 */
.info-list {
  text-align: left;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light, #F2F6FC);

  &:last-of-type {
    border-bottom: none;
  }
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
  flex-shrink: 0;
}

.info-value {
  font-size: 14px;
  color: var(--text-primary, #2C3E50);
  text-align: right;
  word-break: break-all;
}

.info-divider {
  height: 1px;
  background: var(--border-color, #EBEEF5);
  margin: 4px 0;
}

/* ==================== 右侧面板 70% ==================== */
.right-panel {
  flex: 1;
  min-width: 0;
}

/* 顶部状态栏 */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-white, #FFFFFF);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.identity-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary, #2C3E50);
  display: flex;
  align-items: center;
  gap: 8px;
}

.contact-info {
  font-size: 14px;
  color: var(--text-regular, #606266);
}

.top-bar-right {
  display: flex;
  gap: 10px;
}

/* 标签页容器 */
.tabs-card {
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));

  :deep(.el-card__body) {
    padding: 20px 24px;
  }
}

/* 标签页标题 */
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tab-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary, #2C3E50);

  &::before {
    content: '';
    display: inline-block;
    width: 3px;
    height: 16px;
    background: var(--party-red, #C12C1F);
    border-radius: 2px;
    margin-right: 8px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
}

/* ==================== 弹窗占位区域 ==================== */
.dialog-placeholder {
  padding: 20px 0;
}

/* ==================== 响应式 ==================== */
@media (max-width: 1024px) {
  .detail-layout {
    flex-direction: column;
  }

  .left-panel {
    flex: none;
    width: 100%;
  }

  .top-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .top-bar-left {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

@media (max-width: 768px) {
  .member-detail-page {
    padding: 12px;
  }

  .member-card {
    :deep(.el-card__body) {
      padding: 20px 16px;
    }
  }

  .tabs-card {
    :deep(.el-card__body) {
      padding: 12px;
    }
  }
}
</style>
