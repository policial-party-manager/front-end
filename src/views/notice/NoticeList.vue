<script setup lang="ts">
/**
 * NoticeList.vue - 通知公告列表页
 *
 * 功能：
 *   - 公告列表展示（分页、搜索筛选）
 *   - 按标题关键词搜索、按发布时间范围筛选
 *   - 点击标题跳转公告详情 /notice/:id
 *
 * TODO: 接入真实接口后替换 Mock 数据与搜索逻辑
 */
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { Search, RefreshRight } from "@element-plus/icons-vue";

const router = useRouter();

// ============================================================
// 类型定义
// ============================================================
type NoticeItem = {
  id: number;
  title: string;
  publishTime: string;
  department: string;
};

// ============================================================
// Mock 数据（10 条）
// TODO: 替换为真实 API 调用
// ============================================================
const allNotices = ref<NoticeItem[]>([
  {
    id: 1,
    title: "关于开展2026年第三季度思想汇报提交工作的通知",
    publishTime: "2026-07-20",
    department: "党委组织部",
  },
  {
    id: 2,
    title: "关于组织观看党风廉政教育专题片的通知",
    publishTime: "2026-07-17",
    department: "纪委办公室",
  },
  {
    id: 3,
    title: "本周三下午党员活动室召开支部委员会会议",
    publishTime: "2026-07-16",
    department: "计算机学院学生第一党支部",
  },
  {
    id: 4,
    title: "关于2026年上半年党费收缴情况的公示",
    publishTime: "2026-07-12",
    department: "党委组织部",
  },
  {
    id: 5,
    title: "转发：关于进一步加强高校基层党组织建设的意见",
    publishTime: "2026-07-08",
    department: "党委办公室",
  },
  {
    id: 6,
    title: "暑期社会实践优秀党员志愿者表彰名单公示",
    publishTime: "2026-07-04",
    department: "校团委",
  },
  {
    id: 7,
    title: "关于做好2026级新生党员组织关系转接工作的通知",
    publishTime: "2026-06-25",
    department: "党委组织部",
  },
  {
    id: 8,
    title: '2026年"七一"表彰大会参会通知',
    publishTime: "2026-06-20",
    department: "党委办公室",
  },
  {
    id: 9,
    title: "关于开展党支部换届选举工作的通知",
    publishTime: "2026-06-12",
    department: "党委组织部",
  },
  {
    id: 10,
    title: "关于组织参加全国高校党建知识竞赛的通知",
    publishTime: "2026-06-05",
    department: "党委学生工作部",
  },
]);

// ============================================================
// 用户输入的筛选条件
// ============================================================
const filterKeyword = ref("");
const filterTimeRange = ref<[string, string] | null>(null);

// ============================================================
// 已应用的筛选条件（点击搜索后才赋值）
// ============================================================
const appliedKeyword = ref("");
const appliedTimeRange = ref<[string, string] | null>(null);

// ============================================================
// 加载 & 分页
// ============================================================
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);

// ============================================================
// 筛选后的数据
// ============================================================
const filteredNotices = computed<NoticeItem[]>(() => {
  let list = allNotices.value;

  // 关键词搜索（标题模糊匹配）
  if (appliedKeyword.value.trim()) {
    const kw = appliedKeyword.value.trim().toLowerCase();
    list = list.filter((item) => item.title.toLowerCase().includes(kw));
  }

  // 时间范围筛选
  if (appliedTimeRange.value) {
    const [start, end] = appliedTimeRange.value;
    list = list.filter((item) => {
      return item.publishTime >= start && item.publishTime <= end;
    });
  }

  return list;
});

// ============================================================
// 分页数据
// ============================================================
const totalFiltered = computed(() => filteredNotices.value.length);

const pagedNotices = computed<NoticeItem[]>(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredNotices.value.slice(start, start + pageSize.value);
});

// ============================================================
// 筛选条件变化时重置到第 1 页
// ============================================================
watch([appliedKeyword, appliedTimeRange], () => {
  currentPage.value = 1;
});

// ============================================================
// 搜索：应用当前筛选条件
// ============================================================
async function handleSearch(): Promise<void> {
  loading.value = true;
  try {
    // TODO: 替换为真实 API 调用
    // const res = await api.getNoticeList({
    //   keyword: filterKeyword.value,
    //   startTime: filterTimeRange.value?.[0] || '',
    //   endTime: filterTimeRange.value?.[1] || '',
    //   page: currentPage.value,
    //   pageSize: pageSize.value,
    // })

    // 模拟接口延迟
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 应用筛选条件
    appliedKeyword.value = filterKeyword.value;
    appliedTimeRange.value = filterTimeRange.value;

    console.log("[Mock] 公告搜索完成：", {
      keyword: appliedKeyword.value || "无",
      timeRange: appliedTimeRange.value || "不限",
      results: filteredNotices.value.length,
    });
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 重置：清空所有筛选条件
// ============================================================
function handleReset(): void {
  filterKeyword.value = "";
  filterTimeRange.value = null;
  appliedKeyword.value = "";
  appliedTimeRange.value = null;
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
function goToDetail(id: number): void {
  router.push(`/notice/${id}`);
}
</script>

<template>
  <div class="notice-list-page">
    <div class="page-container">
      <!-- ==================== 页面头部 ==================== -->
      <div class="page-header">
        <h2 class="section-title">通知公告</h2>
      </div>

      <!-- ==================== 搜索筛选栏 ==================== -->
      <div v-loading="loading" class="content-card">
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <!-- 关键词搜索 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="7">
              <div class="filter-item">
                <label class="filter-label">关键词搜索</label>
                <el-input
                  v-model="filterKeyword"
                  placeholder="输入公告标题关键词"
                  clearable
                  @keyup.enter="handleSearch"
                >
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-col>

            <!-- 发布时间范围 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="8">
              <div class="filter-item">
                <label class="filter-label">发布时间范围</label>
                <el-date-picker
                  v-model="filterTimeRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </div>
            </el-col>

            <!-- 操作按钮 -->
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
          <div v-if="appliedKeyword || appliedTimeRange" class="filter-result-tip">
            当前筛选条件：
            <el-tag v-if="appliedKeyword" size="small" closable @close="appliedKeyword = ''">
              "{{ appliedKeyword }}"
            </el-tag>
            <el-tag v-if="appliedTimeRange" size="small" closable @close="appliedTimeRange = null">
              {{ appliedTimeRange[0] }} ~ {{ appliedTimeRange[1] }}
            </el-tag>
            <span class="result-count">共 {{ totalFiltered }} 条结果</span>
          </div>
        </div>

        <!-- ==================== 公告列表 ==================== -->
        <el-table
          v-if="pagedNotices.length > 0"
          :data="pagedNotices"
          style="width: 100%"
          stripe
          :default-sort="{ prop: 'publishTime', order: 'descending' }"
        >
          <!-- 标题 -->
          <el-table-column label="标题" min-width="320" show-overflow-tooltip>
            <template #default="{ row }">
              <el-button type="primary" link class="title-link" @click="goToDetail(row.id)">
                {{ row.title }}
              </el-button>
            </template>
          </el-table-column>

          <!-- 发布时间 -->
          <el-table-column label="发布时间" width="140" align="center">
            <template #default="{ row }">
              <span class="time-cell">{{ row.publishTime }}</span>
            </template>
          </el-table-column>

          <!-- 发布部门 -->
          <el-table-column label="发布部门" width="200" align="center" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="dept-cell">{{ row.department }}</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 空状态 -->
        <el-empty v-else description="暂无匹配的公告" :image-size="100" />

        <!-- 分页 -->
        <div v-if="totalFiltered > 0" class="table-footer">
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
 * NoticeList.vue 样式
 * ============================================================ */

.notice-list-page {
  padding: 24px 0 40px;
}

/* ---- 页面头部 ---- */
.page-header {
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 16px;
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
.title-link {
  font-weight: 500;
  font-size: 14px;
}

.time-cell {
  font-size: 13px;
  color: var(--text-regular, #606266);
  font-variant-numeric: tabular-nums;
}

.dept-cell {
  font-size: 13px;
  color: var(--text-secondary, #909399);
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
}

@media (max-width: 576px) {
  .filter-actions .btn-group {
    flex-wrap: wrap;
  }
}
</style>
