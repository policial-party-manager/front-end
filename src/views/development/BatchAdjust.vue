<script setup>
/**
 * BatchAdjust.vue - 批量身份调整页面
 *
 * 路由：/development/batch
 * 功能：管理员/支委批量调整多名成员的身份状态
 *
 * 权限说明：
 *   - super_admin（超级管理员）：查看全院成员
 *   - party_secretary（支委）：仅查看本支部成员
 *
 * 操作流程：
 *   第一步：勾选目标成员（支持筛选 + 分页）
 *   第二步：设置目标身份 + 调整原因 + 培养联系人
 *   第三步：确认执行 → 二次确认 → 跳转回列表
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const store = useAppStore()

// ============================================================
// 权限：超级管理员看全部，支委仅看本支部
// 当前使用 Mock 模拟，通过过滤模拟数据实现
// TODO: 接入真实接口后，由后端根据角色返回不同数据范围
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === 'super_admin')
// 支委所属支部（Mock：假设当前支委属于"计算机学院学生第一党支部"）
const branchOfSecretary = '计算机学院学生第一党支部'

// ============================================================
// Mock 数据：成员列表（20+ 条，覆盖 4 个支部、5 种身份）
// 字段：
//   id          - 成员 ID
//   studentId   - 学号
//   name        - 姓名
//   gender      - 性别
//   partyBranch - 所属党支部
//   currentIdentity - 当前党员身份
// ============================================================
const allMembers = ref([
  { id: 1,  studentId: '20230101001', name: '张三', gender: '男', partyBranch: '计算机学院学生第一党支部', currentIdentity: '发展对象' },
  { id: 2,  studentId: '20230101002', name: '李四', gender: '女', partyBranch: '计算机学院学生第一党支部', currentIdentity: '积极分子' },
  { id: 3,  studentId: '20230101003', name: '王五', gender: '男', partyBranch: '计算机学院学生第一党支部', currentIdentity: '入党申请人' },
  { id: 4,  studentId: '20230101004', name: '赵六', gender: '女', partyBranch: '计算机学院学生第一党支部', currentIdentity: '积极分子' },
  { id: 5,  studentId: '20230101005', name: '孙七', gender: '男', partyBranch: '计算机学院学生第一党支部', currentIdentity: '入党申请人' },
  { id: 6,  studentId: '20220201001', name: '周八', gender: '女', partyBranch: '计算机学院学生第一党支部', currentIdentity: '预备党员' },
  { id: 7,  studentId: '20220201002', name: '吴九', gender: '男', partyBranch: '计算机学院学生第二党支部', currentIdentity: '发展对象' },
  { id: 8,  studentId: '20220201003', name: '郑十', gender: '女', partyBranch: '计算机学院学生第二党支部', currentIdentity: '积极分子' },
  { id: 9,  studentId: '20220201004', name: '陈一', gender: '男', partyBranch: '计算机学院学生第二党支部', currentIdentity: '入党申请人' },
  { id: 10, studentId: '20220201005', name: '刘二', gender: '女', partyBranch: '计算机学院学生第二党支部', currentIdentity: '正式党员' },
  { id: 11, studentId: '20220201006', name: '黄三', gender: '男', partyBranch: '计算机学院学生第二党支部', currentIdentity: '积极分子' },
  { id: 12, studentId: '20210101001', name: '杨四', gender: '女', partyBranch: '软件学院学生党支部',     currentIdentity: '发展对象' },
  { id: 13, studentId: '20210101002', name: '朱五', gender: '男', partyBranch: '软件学院学生党支部',     currentIdentity: '入党申请人' },
  { id: 14, studentId: '20210101003', name: '马六', gender: '女', partyBranch: '软件学院学生党支部',     currentIdentity: '积极分子' },
  { id: 15, studentId: '20210101004', name: '胡七', gender: '男', partyBranch: '软件学院学生党支部',     currentIdentity: '预备党员' },
  { id: 16, studentId: '20210101005', name: '林八', gender: '女', partyBranch: '软件学院学生党支部',     currentIdentity: '正式党员' },
  { id: 17, studentId: '20200101001', name: '何九', gender: '男', partyBranch: '网络空间安全学院学生党支部', currentIdentity: '积极分子' },
  { id: 18, studentId: '20200101002', name: '罗十', gender: '女', partyBranch: '网络空间安全学院学生党支部', currentIdentity: '发展对象' },
  { id: 19, studentId: '20200101003', name: '梁一', gender: '男', partyBranch: '网络空间安全学院学生党支部', currentIdentity: '入党申请人' },
  { id: 20, studentId: '20200101004', name: '宋二', gender: '女', partyBranch: '网络空间安全学院学生党支部', currentIdentity: '正式党员' },
  { id: 21, studentId: '20200101005', name: '唐三', gender: '男', partyBranch: '网络空间安全学院学生党支部', currentIdentity: '积极分子' },
  { id: 22, studentId: '20230101006', name: '许四', gender: '女', partyBranch: '计算机学院学生第一党支部', currentIdentity: '入党申请人' },
])

// ============================================================
// 权限过滤：支委仅看本支部成员
// ============================================================
const filteredByRole = computed(() => {
  // TODO: 接入真实接口后，后端根据角色返回数据
  // 当前使用 Mock 数据模拟权限过滤
  if (isSuperAdmin.value) {
    return allMembers.value
  }
  // 支委仅查看本支部
  return allMembers.value.filter(m => m.partyBranch === branchOfSecretary)
})

// ============================================================
// 筛选条件
// ============================================================
const filterBranch = ref('')        // 支部筛选
const filterIdentity = ref('')      // 身份筛选
const filterKeyword = ref('')       // 关键词搜索（姓名/学号）

// ============================================================
// 筛选后的数据（权限过滤 + 用户筛选）
// ============================================================
const filteredMembers = computed(() => {
  let list = filteredByRole.value

  // 支部筛选
  if (filterBranch.value) {
    list = list.filter(m => m.partyBranch === filterBranch.value)
  }
  // 身份筛选
  if (filterIdentity.value) {
    list = list.filter(m => m.currentIdentity === filterIdentity.value)
  }
  // 关键词搜索
  if (filterKeyword.value.trim()) {
    const kw = filterKeyword.value.trim().toLowerCase()
    list = list.filter(m =>
      m.name.toLowerCase().includes(kw) ||
      m.studentId.toLowerCase().includes(kw)
    )
  }
  return list
})

// ============================================================
// 支部列表（从 Mock 数据中提取）
// ============================================================
const branchOptions = computed(() => {
  const branches = [...new Set(allMembers.value.map(m => m.partyBranch))]
  return branches.map(b => ({ value: b, label: b }))
})

// ============================================================
// 身份列表
// ============================================================
const identityOptions = [
  { value: '入党申请人', label: '入党申请人' },
  { value: '积极分子',   label: '积极分子' },
  { value: '发展对象',   label: '发展对象' },
  { value: '预备党员',   label: '预备党员' },
  { value: '正式党员',   label: '正式党员' },
]

// 身份标签颜色
const identityTagMap = {
  '入党申请人': 'info',
  '积极分子':   'warning',
  '发展对象':   'primary',
  '预备党员':   'success',
  '正式党员':   'danger',
}

// ============================================================
// Mock 数据：培养联系人候选（同 AdjustIdentityDialog）
// TODO: 替换为接口获取
// ============================================================
const teacherList = ref([
  { id: 1, name: '李老师', title: '党支部书记' },
  { id: 2, name: '赵老师', title: '组织委员' },
  { id: 3, name: '陈老师', title: '宣传委员' },
  { id: 4, name: '周老师', title: '辅导员' },
  { id: 5, name: '王书记', title: '党委副书记' },
  { id: 6, name: '刘老师', title: '支部委员' },
])

// ============================================================
// 表格选中相关
// ============================================================
const selectedIds = ref([])  // 已选成员 ID 列表

// 当前页所有成员的 ID（用于全选判断）
const currentPageIds = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const pageData = filteredMembers.value.slice(start, start + pageSize.value)
  return pageData.map(m => m.id)
})

// 是否已全选当前页
const isCurrentPageAllSelected = computed(() => {
  return currentPageIds.value.length > 0 &&
    currentPageIds.value.every(id => selectedIds.value.includes(id))
})

// 是否半选（跨页有选中）
const isIndeterminate = computed(() => {
  const hasSelected = currentPageIds.value.some(id => selectedIds.value.includes(id))
  return hasSelected && !isCurrentPageAllSelected.value
})

// 已选成员对象列表
const selectedMembers = computed(() => {
  return allMembers.value.filter(m => selectedIds.value.includes(m.id))
})

// 全选切换
function handleSelectAll(val) {
  if (val) {
    // 全选当前页：合并去重
    const set = new Set(selectedIds.value)
    currentPageIds.value.forEach(id => set.add(id))
    selectedIds.value = [...set]
  } else {
    // 取消全选当前页
    const pageSet = new Set(currentPageIds.value)
    selectedIds.value = selectedIds.value.filter(id => !pageSet.has(id))
  }
}

// 翻页时不清空已选（跨页保留选中）
// 注意：el-table 的 reserve-selection 需要 row-key，此处使用自定义逻辑

// ============================================================
// 分页
// ============================================================
const currentPage = ref(1)
const pageSize = ref(10)

// 筛选条件变更时回到第一页（通过 watch 实现，此处用 computed 简化）

// ============================================================
// 第二步：设置目标信息
// ============================================================
const targetIdentity = ref('')       // 目标身份
const adjustReason = ref('')          // 调整原因
const contactPersonIds = ref([])     // 培养联系人 ID 列表

const contactMaxReached = computed(() => contactPersonIds.value.length >= 2)

// ============================================================
// 提交状态
// ============================================================
const submitting = ref(false)

// ============================================================
// 按钮禁用判断
// ============================================================
const canConfirm = computed(() => {
  return selectedIds.value.length > 0 && targetIdentity.value && adjustReason.value.trim().length >= 10
})

// ============================================================
// 重置筛选
// ============================================================
function handleResetFilter() {
  filterBranch.value = ''
  filterIdentity.value = ''
  filterKeyword.value = ''
  currentPage.value = 1
}

// ============================================================
// 筛选条件变更时回到第一页
// ============================================================
function onFilterChange() {
  currentPage.value = 1
}

// ============================================================
// 确认调整
// ============================================================
async function handleConfirm() {
  if (!canConfirm.value) return

  // 二次确认
  try {
    await confirmBatchAdjust()
  } catch {
    return // 用户取消
  }

  submitting.value = true
  try {
    // TODO: 替换为真实 API 调用
    // await api.batchAdjustIdentity({
    //   memberIds: selectedIds.value,
    //   targetIdentity: targetIdentity.value,
    //   reason: adjustReason.value,
    //   contactPersons: contactPersonIds.value,
    // })

    // 模拟接口延迟
    await new Promise(resolve => setTimeout(resolve, 800))

    ElMessage.success(`成功将 ${selectedIds.value.length} 位成员调整为【${targetIdentity.value}】`)
    // 跳转回党员发展列表页
    router.push('/development')
  } catch (error) {
    ElMessage.error('批量调整失败，请重试')
  } finally {
    submitting.value = false
  }
}

// ============================================================
// 二次确认弹窗
// ============================================================
async function confirmBatchAdjust() {
  const count = selectedIds.value.length
  const names = selectedMembers.value.map(m => m.name).join('、')
  const contactNames = contactPersonIds.value.length > 0
    ? contactPersonIds.value.map(id => {
        const t = teacherList.value.find(item => item.id === id)
        return t ? t.name : ''
      }).filter(Boolean).join('、')
    : '未指定（沿用现有联系人）'

  const message = `
    <div style="line-height: 2.2; font-size: 14px;">
      <p>即将将 <strong style="color: #C12C1F; font-size: 16px;">${count}</strong> 位成员
         调整为 <strong style="color: #C12C1F; font-size: 16px;">【${targetIdentity.value}】</strong></p>
      <p><strong>成员列表：</strong>${names}</p>
      <p><strong>调整原因：</strong>${adjustReason.value}</p>
      <p><strong>培养联系人：</strong>${contactNames}</p>
      <p style="margin-top: 12px; color: var(--text-secondary);">请仔细核对以上信息，确认后不可撤销。</p>
    </div>
  `

  await ElMessageBox.confirm(message, '确认批量调整身份', {
    confirmButtonText: '确认调整',
    cancelButtonText: '取消',
    type: 'warning',
    dangerouslyUseHTMLString: true,
    confirmButtonClass: 'el-button--danger',
  })
}

// ============================================================
// 取消：返回列表
// ============================================================
function handleCancel() {
  router.push('/development')
}

// ============================================================
// 生命周期
// ============================================================
onMounted(() => {
  // TODO: 接入真实接口后，获取成员列表
  // const res = await api.getMemberList({ role: store.currentRole })
  // allMembers.value = res.data
  console.log(`[Mock] 批量调整页面加载，当前角色：${store.currentRole}，可查看成员数：${filteredByRole.value.length}`)
})
</script>

<template>
  <div class="batch-adjust-page">
    <div class="page-inner">
      <!-- 页头 -->
      <div class="page-header">
        <h2 class="section-title">批量调整身份</h2>
        <p class="page-desc">
          勾选需要调整的成员，设置目标身份后一键批量调整
          <span v-if="!isSuperAdmin" class="role-hint">
            （当前仅显示{{ branchOfSecretary }}成员）
          </span>
        </p>
      </div>

      <!-- ==================== 第一步：选择成员 ==================== -->
      <div class="content-card step-card">
        <div class="step-title">第一步：选择成员</div>

        <!-- 筛选条件 -->
        <div class="filter-bar">
          <div class="filter-left">
            <el-select
              v-model="filterBranch"
              placeholder="所属支部"
              clearable
              style="width: 200px"
              @change="onFilterChange"
            >
              <el-option
                v-for="item in branchOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-select
              v-model="filterIdentity"
              placeholder="当前身份"
              clearable
              style="width: 160px"
              @change="onFilterChange"
            >
              <el-option
                v-for="item in identityOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-input
              v-model="filterKeyword"
              placeholder="搜索姓名 / 学号"
              clearable
              style="width: 240px"
              @input="onFilterChange"
              @clear="onFilterChange"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <div class="filter-right">
            <el-button @click="handleResetFilter">重置</el-button>
          </div>
        </div>

        <!-- 成员表格 -->
        <el-table
          ref="tableRef"
          :data="filteredMembers"
          style="width: 100%"
          stripe
          row-key="id"
          @selection-change="(rows) => { /* 保留手动勾选 */ }"
        >
          <el-table-column type="selection" width="50" :reserve-selection="false" />

          <!-- 自定义全选列头：实现跨页全选/取消 -->
          <!-- 使用 el-table 原生 selection 即可，结合手动选中 -->
          <el-table-column prop="studentId" label="学号" width="140" />
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="gender" label="性别" width="70" />
          <el-table-column prop="partyBranch" label="所在支部" min-width="200" />
          <el-table-column label="当前身份" width="120">
            <template #default="{ row }">
              <el-tag :type="identityTagMap[row.currentIdentity] || 'info'" size="small">
                {{ row.currentIdentity }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 + 选中统计 -->
        <div class="table-footer">
          <div class="footer-left">
            <span class="selected-count">
              已选 <strong>{{ selectedIds.length }}</strong> 人
            </span>
            <span class="selected-hint" v-if="selectedIds.length > 0">
              （{{ selectedMembers.map(m => m.name).join('、') }}）
            </span>
          </div>
          <div class="footer-right">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[10, 20, 50]"
              :total="filteredMembers.length"
              layout="total, sizes, prev, pager, next, jumper"
              small
            />
          </div>
        </div>
      </div>

      <!-- ==================== 第二步：设置目标信息 ==================== -->
      <div class="content-card step-card">
        <div class="step-title">第二步：设置目标信息</div>

        <div class="config-form">
          <div class="form-row">
            <label class="form-label required">目标身份</label>
            <el-select
              v-model="targetIdentity"
              placeholder="请选择目标身份"
              style="width: 280px"
            >
              <el-option
                v-for="item in identityOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>

          <div class="form-row">
            <label class="form-label required">调整原因</label>
            <el-input
              v-model="adjustReason"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="请填写调整原因（至少 10 个字），如：经支部大会讨论，确定该批同志为发展对象"
              style="width: 560px"
            />
          </div>

          <div class="form-row">
            <label class="form-label">培养联系人</label>
            <el-select
              v-model="contactPersonIds"
              placeholder="请选择培养联系人（选填，最多 2 人）"
              multiple
              style="width: 400px"
            >
              <el-option
                v-for="teacher in teacherList"
                :key="teacher.id"
                :label="`${teacher.name}（${teacher.title}）`"
                :value="teacher.id"
                :disabled="!contactPersonIds.includes(teacher.id) && contactMaxReached"
              />
            </el-select>
            <span class="form-hint">最多选择 2 人，留空则沿用各成员现有联系人</span>
          </div>
        </div>
      </div>

      <!-- ==================== 第三步：确认执行 ==================== -->
      <div class="action-bar">
        <el-button @click="handleCancel">取消</el-button>
        <el-button
          type="danger"
          :loading="submitting"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          确认调整
        </el-button>
        <span class="action-hint" v-if="!canConfirm && selectedIds.length > 0">
          {{ !targetIdentity ? '请选择目标身份' : '请填写调整原因（至少 10 个字）' }}
        </span>
        <span class="action-hint" v-else-if="selectedIds.length === 0">
          请先勾选需要调整身份的成员
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * BatchAdjust.vue 样式
 * ============================================================ */

.batch-adjust-page {
  padding: 24px 0 40px;
}

.page-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ---- 页头 ---- */
.page-header {
  margin-bottom: 24px;
}

.page-desc {
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin-top: 4px;
}

.role-hint {
  color: var(--party-red, #C12C1F);
  font-size: 13px;
}

/* ---- 步骤卡片 ---- */
.step-card {
  margin-bottom: 20px;
}

.step-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light, #F2F6FC);

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

/* ---- 筛选栏 ---- */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

/* ---- 表格底部 ---- */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selected-count {
  font-size: 14px;
  color: var(--text-primary, #2C3E50);

  strong {
    color: var(--party-red, #C12C1F);
    font-size: 16px;
  }
}

.selected-hint {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 配置表单 ---- */
.config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.form-label {
  width: 100px;
  text-align: right;
  font-size: 14px;
  color: var(--text-primary, #2C3E50);
  padding-top: 6px;
  flex-shrink: 0;

  &.required::after {
    content: ' *';
    color: var(--party-red, #C12C1F);
  }
}

.form-hint {
  font-size: 12px;
  color: var(--text-placeholder, #C0C4CC);
  align-self: center;
  margin-left: 4px;
}

/* ---- 操作栏 ---- */
.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 24px;
}

.action-hint {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .page-inner {
    padding: 0 12px;
  }

  .filter-left {
    flex-direction: column;
    width: 100%;

    .el-select, .el-input {
      width: 100% !important;
    }
  }

  .form-row {
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    text-align: left;
    width: auto;
    padding-top: 0;
  }

  .table-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
