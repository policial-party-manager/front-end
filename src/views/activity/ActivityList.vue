<script setup lang="ts">
/**
 * ActivityList.vue - 活动管理列表页
 *
 * 功能：
 *   - 活动列表展示（分页、搜索筛选）
 *   - 基于角色和活动状态的操作按钮
 *   - 新建活动入口（超级管理员/支委可见）
 *
 * 权限说明：
 *   - super_admin（超级管理员）：查看全部活动
 *   - party_secretary（支委）：仅查看本支部活动
 *     【Mock 模拟】支委所属支部硬编码为"计算机学院学生第一党支部"
 *     TODO: 接入真实接口后，由后端根据当前登录用户的支部进行数据过滤
 *   - party_member / activist（普通成员）：仅查看状态为"报名中"的活动
 */
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search, RefreshRight, Plus } from "@element-plus/icons-vue";

const router = useRouter();
const store = useAppStore();

// ============================================================
// 类型定义
// ============================================================
type ActivityType = "组织生活" | "主题党日" | "党课学习" | "二课活动" | "志愿服务" | "其他";
type ActivityStatus = "未开始" | "报名中" | "进行中" | "已结束" | "已归档";

interface Activity {
  id: number;
  name: string;
  type: ActivityType;
  branch: string;
  activityTime: string;
  signInTime: string;
  status: ActivityStatus;
}

// ============================================================
// 角色权限判断
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
const isSecretary = computed(() => store.currentRole === "party_secretary");
const isAdmin = computed(() => isSuperAdmin.value || isSecretary.value);
const isRegularMember = computed(() => store.currentRole === "party_member" || store.currentRole === "activist");

// 支委所属支部（Mock 模拟）
// TODO: 接入真实接口后，从用户信息中获取所属支部
const branchOfSecretary = "计算机学院学生第一党支部";

// ============================================================
// Mock 数据：全部活动（15 条，覆盖不同活动类型和状态）
// TODO: 替换为真实 API 调用
// ============================================================
const allActivities = ref<Activity[]>([
  {
    id: 1,
    name: "学习贯彻党的二十届三中全会精神主题党日",
    type: "主题党日",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-08-15 14:00",
    signInTime: "2026-08-15 13:30",
    status: "已结束",
  },
  {
    id: 2,
    name: "习近平新时代中国特色社会主义思想专题党课",
    type: "党课学习",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-08-20 09:00",
    signInTime: "2026-08-20 08:30",
    status: "报名中",
  },
  {
    id: 3,
    name: "2026年第三季度支部组织生活会",
    type: "组织生活",
    branch: "计算机学院学生第二党支部",
    activityTime: "2026-09-01 15:00",
    signInTime: "2026-09-01 14:30",
    status: "未开始",
  },
  {
    id: 4,
    name: "社区志愿服务活动——关爱空巢老人",
    type: "志愿服务",
    branch: "软件学院学生党支部",
    activityTime: "2026-08-10 08:00",
    signInTime: "2026-08-10 07:30",
    status: "进行中",
  },
  {
    id: 5,
    name: "大学生创新创业经验分享会",
    type: "二课活动",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-06-20 14:00",
    signInTime: "2026-06-20 13:30",
    status: "已归档",
  },
  {
    id: 6,
    name: "民主评议党员组织生活会",
    type: "组织生活",
    branch: "网络空间安全学院学生党支部",
    activityTime: "2026-07-30 10:00",
    signInTime: "2026-07-30 09:30",
    status: "已结束",
  },
  {
    id: 7,
    name: "党史学习专题党课——从一大到二十大",
    type: "党课学习",
    branch: "计算机学院学生第二党支部",
    activityTime: "2026-09-10 14:00",
    signInTime: "2026-09-10 13:30",
    status: "未开始",
  },
  {
    id: 8,
    name: "庆祝建党105周年主题党日活动",
    type: "主题党日",
    branch: "软件学院学生党支部",
    activityTime: "2026-08-01 09:00",
    signInTime: "2026-08-01 08:30",
    status: "报名中",
  },
  {
    id: 9,
    name: "校园环保志愿服务行动",
    type: "志愿服务",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-05-15 09:00",
    signInTime: "2026-05-15 08:30",
    status: "已归档",
  },
  {
    id: 10,
    name: '"代码筑梦"编程公益课堂',
    type: "二课活动",
    branch: "网络空间安全学院学生党支部",
    activityTime: "2026-08-25 10:00",
    signInTime: "2026-08-25 09:30",
    status: "报名中",
  },
  {
    id: 11,
    name: "学习党章党规组织生活会",
    type: "组织生活",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-08-12 15:00",
    signInTime: "2026-08-12 14:30",
    status: "进行中",
  },
  {
    id: 12,
    name: "传承红色基因主题党日——参观革命纪念馆",
    type: "主题党日",
    branch: "网络空间安全学院学生党支部",
    activityTime: "2026-09-20 08:00",
    signInTime: "2026-09-20 07:30",
    status: "未开始",
  },
  {
    id: 13,
    name: "党风廉政教育专题党课",
    type: "党课学习",
    branch: "软件学院学生党支部",
    activityTime: "2026-07-25 14:00",
    signInTime: "2026-07-25 13:30",
    status: "已结束",
  },
  {
    id: 14,
    name: "迎新志愿者服务活动",
    type: "志愿服务",
    branch: "计算机学院学生第二党支部",
    activityTime: "2026-08-28 07:00",
    signInTime: "2026-08-28 06:30",
    status: "报名中",
  },
  {
    id: 15,
    name: "心理素质拓展团体活动",
    type: "其他",
    branch: "计算机学院学生第一党支部",
    activityTime: "2026-08-18 14:00",
    signInTime: "2026-08-18 13:30",
    status: "进行中",
  },
]);

// ============================================================
// 权限过滤数据
//   - 超级管理员：全部活动
//   - 支委：仅本支部活动（Mock: 计算机学院学生第一党支部）
//     TODO: 接入真实接口后，后端根据角色返回数据
//   - 普通成员（party_member / activist）：仅"报名中"的活动
// ============================================================
const activitiesByRole = computed<Activity[]>(() => {
  if (isSuperAdmin.value) return allActivities.value;
  if (isSecretary.value) {
    return allActivities.value.filter((a) => a.branch === branchOfSecretary);
  }
  // 普通成员：仅可见报名中的活动
  return allActivities.value.filter((a) => a.status === "报名中");
});

// ============================================================
// 筛选选项
// ============================================================
const activityTypeOptions = [
  { value: "", label: "全部" },
  { value: "组织生活", label: "组织生活" },
  { value: "主题党日", label: "主题党日" },
  { value: "党课学习", label: "党课学习" },
  { value: "二课活动", label: "二课活动" },
  { value: "志愿服务", label: "志愿服务" },
  { value: "其他", label: "其他" },
];

const activityStatusOptions = [
  { value: "", label: "全部" },
  { value: "未开始", label: "未开始" },
  { value: "报名中", label: "报名中" },
  { value: "进行中", label: "进行中" },
  { value: "已结束", label: "已结束" },
  { value: "已归档", label: "已归档" },
];

// ============================================================
// 颜色映射
// ============================================================

/** 活动类型 → 标签颜色 */
const activityTypeColorMap: Record<string, string> = {
  组织生活: "#C12C1F",
  主题党日: "#E6A23C",
  党课学习: "#409EFF",
  二课活动: "#67C23A",
  志愿服务: "#E84646",
  其他: "#909399",
};

/** 活动状态 → 标签颜色 */
const activityStatusColorMap: Record<string, string> = {
  未开始: "#909399",
  报名中: "#409EFF",
  进行中: "#67C23A",
  已结束: "#E6A23C",
  已归档: "#909399",
};

// ============================================================
// 用户输入的筛选条件（未点击搜索前不生效）
// ============================================================
const filterType = ref("");
const filterStatus = ref("");
const filterTimeRange = ref<[string, string] | null>(null);
const filterKeyword = ref("");

// ============================================================
// 已应用的筛选条件（点击搜索后才赋值）
// ============================================================
const appliedType = ref("");
const appliedStatus = ref("");
const appliedTimeRange = ref<[string, string] | null>(null);
const appliedKeyword = ref("");

// ============================================================
// 加载 & 分页
// ============================================================
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);

// ============================================================
// 筛选后的数据（权限过滤 + 已应用筛选条件）
// ============================================================
const filteredActivities = computed<Activity[]>(() => {
  let list = activitiesByRole.value;

  // 活动类型筛选
  if (appliedType.value) {
    list = list.filter((a) => a.type === appliedType.value);
  }

  // 活动状态筛选
  if (appliedStatus.value) {
    list = list.filter((a) => a.status === appliedStatus.value);
  }

  // 时间范围筛选
  if (appliedTimeRange.value) {
    const [start, end] = appliedTimeRange.value;
    list = list.filter((a) => {
      const activityTime = a.activityTime;
      return activityTime >= start && activityTime <= end;
    });
  }

  // 关键词搜索（活动名称模糊匹配）
  if (appliedKeyword.value.trim()) {
    const kw = appliedKeyword.value.trim().toLowerCase();
    list = list.filter((a) => a.name.toLowerCase().includes(kw));
  }

  return list;
});

// ============================================================
// 分页数据
// ============================================================
const totalFiltered = computed(() => filteredActivities.value.length);

const pagedActivities = computed<Activity[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredActivities.value.slice(start, start + pageSize.value);
});

// ============================================================
// 当已应用的筛选条件变化时，重置到第 1 页
// ============================================================
watch([appliedType, appliedStatus, appliedTimeRange, appliedKeyword], () => {
  currentPage.value = 1;
});

// ============================================================
// 搜索：应用当前筛选条件（模拟接口延迟）
// ============================================================
async function handleSearch(): Promise<void> {
  loading.value = true;
  try {
    // TODO: 替换为真实 API 调用
    // const res = await api.getActivityList({
    //   type: filterType.value,
    //   status: filterStatus.value,
    //   startTime: filterTimeRange.value?.[0] || '',
    //   endTime: filterTimeRange.value?.[1] || '',
    //   keyword: filterKeyword.value,
    //   page: currentPage.value,
    //   pageSize: pageSize.value,
    // })

    // 模拟接口延迟
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 应用筛选条件
    appliedType.value = filterType.value;
    appliedStatus.value = filterStatus.value;
    appliedTimeRange.value = filterTimeRange.value;
    appliedKeyword.value = filterKeyword.value;

    console.log("[Mock] 活动搜索完成：", {
      type: appliedType.value || "全部",
      status: appliedStatus.value || "全部",
      timeRange: appliedTimeRange.value || "不限",
      keyword: appliedKeyword.value || "无",
      results: filteredActivities.value.length,
    });
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 重置：清空所有筛选条件并刷新
// ============================================================
function handleReset(): void {
  filterType.value = "";
  filterStatus.value = "";
  filterTimeRange.value = null;
  filterKeyword.value = "";
  appliedType.value = "";
  appliedStatus.value = "";
  appliedTimeRange.value = null;
  appliedKeyword.value = "";
}

// ============================================================
// 分页变更
// ============================================================
function handlePageChange(page: number): void {
  currentPage.value = page;
}

function handleSizeChange(size: number): void {
  pageSize.value = size;
  currentPage.value = 1;
}

// ============================================================
// 路由跳转
// ============================================================

/** 跳转到活动详情页 */
function goDetail(activity: Activity): void {
  router.push(`/activity/${activity.id}`);
}

/** 跳转到活动详情页 - 签到管理标签页 */
function goSignInManage(activity: Activity): void {
  router.push(`/activity/${activity.id}?tab=signin`);
}

/** 新建活动 */
function handleCreate(): void {
  router.push("/activity/create");
}

// ============================================================
// 删除活动
// ============================================================
async function handleDelete(activity: Activity): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定要删除活动"${activity.name}"吗？删除后不可恢复。`, "删除确认", {
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
      type: "warning",
    });

    // TODO: 替换为真实 API 调用
    // await api.deleteActivity(activity.id)

    // Mock：从列表中移除
    const index = allActivities.value.findIndex((a) => a.id === activity.id);
    if (index > -1) {
      allActivities.value.splice(index, 1);
    }
    ElMessage.success("活动已删除");
  } catch {
    // 用户取消删除
  }
}

// ============================================================
// 归档活动
// ============================================================
async function handleArchive(activity: Activity): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定要归档活动"${activity.name}"吗？归档后活动将不可编辑。`, "归档确认", {
      confirmButtonText: "确定归档",
      cancelButtonText: "取消",
      type: "info",
    });

    // TODO: 替换为真实 API 调用
    // await api.archiveActivity(activity.id)

    // Mock：更新状态为已归档
    const target = allActivities.value.find((a) => a.id === activity.id);
    if (target) {
      target.status = "已归档";
    }
    ElMessage.success("活动已归档");
  } catch {
    // 用户取消归档
  }
}

// ============================================================
// 根据角色和状态计算操作按钮
// ============================================================
interface ActionButton {
  key: string;
  label: string;
  visible: boolean;
  handler: (activity: Activity) => void;
}

function getActions(activity: Activity): ActionButton[] {
  const { status } = activity;

  return [
    {
      key: "detail",
      label: "详情",
      visible: true,
      handler: goDetail,
    },
    {
      key: "edit",
      label: "编辑",
      visible: isAdmin.value && status === "未开始",
      handler: (row: Activity) => {
        router.push(`/activity/edit/${row.id}`);
      },
    },
    {
      key: "delete",
      label: "删除",
      visible: isAdmin.value && status === "未开始",
      handler: handleDelete,
    },
    {
      key: "signin",
      label: "签到管理",
      visible: isAdmin.value && (status === "报名中" || status === "进行中"),
      handler: goSignInManage,
    },
    {
      key: "archive",
      label: "归档",
      visible: isAdmin.value && status === "已结束",
      handler: handleArchive,
    },
  ];
}

// ============================================================
// 格式化时间（YYYY-MM-DD HH:mm）
// ============================================================
function formatDateTime(dateStr: string): string {
  return dateStr;
}
</script>

<template>
  <div class="activity-list-page">
    <div class="page-container">
      <!-- ==================== 页面头部 ==================== -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="section-title">活动管理</h2>
          <p class="page-desc">组织生活、主题党日、党课学习等活动全流程管理</p>
        </div>
        <div class="header-right">
          <el-button v-if="isAdmin" type="primary" size="large" @click="handleCreate">
            <el-icon><Plus /></el-icon>
            新建活动
          </el-button>
        </div>
      </div>

      <!-- ==================== 搜索筛选栏 ==================== -->
      <div class="content-card" v-loading="loading">
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <!-- 活动类型 -->
            <el-col :xs="24" :sm="12" :md="6" :lg="5">
              <div class="filter-item">
                <label class="filter-label">活动类型</label>
                <el-select v-model="filterType" placeholder="全部" clearable style="width: 100%">
                  <el-option
                    v-for="item in activityTypeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </el-col>

            <!-- 活动状态 -->
            <el-col :xs="24" :sm="12" :md="6" :lg="5">
              <div class="filter-item">
                <label class="filter-label">活动状态</label>
                <el-select v-model="filterStatus" placeholder="全部" clearable style="width: 100%">
                  <el-option
                    v-for="item in activityStatusOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </el-col>

            <!-- 时间范围 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="7">
              <div class="filter-item">
                <label class="filter-label">活动时间范围</label>
                <el-date-picker
                  v-model="filterTimeRange"
                  type="datetimerange"
                  range-separator="至"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  style="width: 100%"
                />
              </div>
            </el-col>

            <!-- 关键词搜索 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="4">
              <div class="filter-item">
                <label class="filter-label">关键词搜索</label>
                <el-input v-model="filterKeyword" placeholder="输入活动名称" clearable @keyup.enter="handleSearch">
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-col>

            <!-- 搜索 / 重置按钮 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="3">
              <div class="filter-item filter-actions">
                <label class="filter-label">&nbsp;</label>
                <div class="btn-group">
                  <el-button type="primary" @click="handleSearch">
                    <el-icon><Search /></el-icon>
                    搜索
                  </el-button>
                  <el-button @click="handleReset">
                    <el-icon><RefreshRight /></el-icon>
                    重置
                  </el-button>
                </div>
              </div>
            </el-col>
          </el-row>

          <!-- 筛选结果提示 -->
          <div v-if="appliedType || appliedStatus || appliedTimeRange || appliedKeyword" class="filter-result-tip">
            当前筛选条件：
            <el-tag v-if="appliedType" size="small" closable @close="appliedType = ''">
              {{ appliedType }}
            </el-tag>
            <el-tag v-if="appliedStatus" size="small" closable @close="appliedStatus = ''">
              {{ appliedStatus }}
            </el-tag>
            <el-tag v-if="appliedTimeRange" size="small" closable @close="appliedTimeRange = null">
              {{ appliedTimeRange[0] }} ~ {{ appliedTimeRange[1] }}
            </el-tag>
            <el-tag v-if="appliedKeyword" size="small" closable @close="appliedKeyword = ''">
              "{{ appliedKeyword }}"
            </el-tag>
            <span class="result-count">共 {{ totalFiltered }} 条结果</span>
          </div>
        </div>

        <!-- ==================== 活动列表表格 ==================== -->
        <el-table
          v-if="pagedActivities.length > 0"
          :data="pagedActivities"
          style="width: 100%"
          stripe
          :default-sort="{ prop: 'activityTime', order: 'descending' }"
        >
          <!-- 活动名称 -->
          <el-table-column label="活动名称" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">
              <el-button type="primary" link class="activity-name-link" @click="goDetail(row)">
                {{ row.name }}
              </el-button>
            </template>
          </el-table-column>

          <!-- 活动类型 -->
          <el-table-column label="活动类型" width="110" align="center">
            <template #default="{ row }">
              <el-tag :color="activityTypeColorMap[row.type]" effect="light" size="small">
                {{ row.type }}
              </el-tag>
            </template>
          </el-table-column>

          <!-- 举办支部 -->
          <el-table-column prop="branch" label="举办支部" min-width="180" show-overflow-tooltip />

          <!-- 活动时间 -->
          <el-table-column label="活动时间" width="170" align="center">
            <template #default="{ row }">
              <span class="time-cell">{{ formatDateTime(row.activityTime) }}</span>
            </template>
          </el-table-column>

          <!-- 签到时间 -->
          <el-table-column label="签到时间" width="170" align="center">
            <template #default="{ row }">
              <span class="time-cell">{{ formatDateTime(row.signInTime) }}</span>
            </template>
          </el-table-column>

          <!-- 状态 -->
          <el-table-column label="活动状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :color="activityStatusColorMap[row.status]" effect="light" size="small">
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>

          <!-- 操作 -->
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="action-buttons">
                <template v-for="action in getActions(row)" :key="action.key">
                  <el-button v-if="action.visible" type="primary" link size="small" @click="action.handler(row)">
                    {{ action.label }}
                  </el-button>
                </template>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 空状态 -->
        <el-empty v-else description="暂无匹配的活动" :image-size="100" />

        <!-- 分页 -->
        <div class="table-footer" v-if="totalFiltered > 0">
          <span class="total-info">共 {{ totalFiltered }} 条记录</span>
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50]"
            :total="totalFiltered"
            layout="sizes, prev, pager, next, jumper"
            background
            small
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * ActivityList.vue 样式
 * ============================================================ */

.activity-list-page {
  padding: 24px 0 40px;
}

/* ---- 页面头部 ---- */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  flex: 1;
}

.header-right {
  flex-shrink: 0;
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 4px;
}

/* ---- 搜索筛选栏 ---- */
.filter-bar {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bg-page, #f5f6fa);
  border-radius: var(--radius-base, 8px);
}

.filter-row {
  align-items: flex-end;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 14px;
  color: var(--text-regular, #606266);
  font-weight: 500;
  white-space: nowrap;
}

.filter-actions {
  .btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }
}

/* ---- 筛选结果提示 ---- */
.filter-result-tip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color, #ebeef5);
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

.result-count {
  color: var(--party-red, #c12c1f);
  font-weight: 500;
  margin-left: 4px;
}

/* ---- 表格 ---- */
.activity-name-link {
  font-weight: 500;
  font-size: 14px;
}

.time-cell {
  font-size: 13px;
  color: var(--text-regular, #606266);
  font-variant-numeric: tabular-nums;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
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

.total-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-bar {
    padding: 12px;
  }

  .action-buttons {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 576px) {
  .filter-actions .btn-group {
    flex-wrap: wrap;
  }
}
</style>
