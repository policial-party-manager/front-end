<script setup lang="ts">
/**
 * development.vue - 党员发展模块首页
 *
 * 党员发展全过程管理 - 成员列表与培养总览
 * 支持按支部、身份、关键词组合搜索筛选，分页浏览。
 *
 * 权限说明：
 *   - super_admin（超级管理员）：查看全院成员，可见"所属党支部"筛选项
 *   - party_secretary（支委）：仅看本支部成员，隐藏支部筛选项
 *     【Mock 模拟】支委所属支部硬编码为"计算机学院学生第一党支部"
 *     TODO: 接入真实接口后，由后端根据当前登录用户的支部进行数据过滤
 */
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";

const router = useRouter();
const store = useAppStore();

// ============================================================
// 权限
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
// 支委所属支部（Mock 模拟）
const branchOfSecretary = "计算机学院学生第一党支部";

// ============================================================
// 可调整身份的角色
// ============================================================
const canAdjust = computed(() => {
  return store.currentRole === "super_admin" || store.currentRole === "party_secretary";
});

// ============================================================
// Mock 数据：全部成员（20+ 条，覆盖 4 个支部、5 种身份）
// 字段：
//   id              - 成员 ID
//   name            - 姓名
//   studentId       - 学号
//   gender          - 性别
//   partyBranch     - 所属党支部
//   currentIdentity - 当前党员身份
//   contactPerson   - 培养联系人
//   updateTime      - 最后更新时间
// ============================================================
const allMembers = ref([
  {
    id: 1,
    name: "张三",
    studentId: "20230101001",
    gender: "男",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "发展对象",
    contactPerson: "李老师",
    updateTime: "2026-07-20",
  },
  {
    id: 2,
    name: "李四",
    studentId: "20230101002",
    gender: "女",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "积极分子",
    contactPerson: "赵老师",
    updateTime: "2026-07-18",
  },
  {
    id: 3,
    name: "王五",
    studentId: "20230101003",
    gender: "男",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "预备党员",
    contactPerson: "陈老师",
    updateTime: "2026-07-15",
  },
  {
    id: 4,
    name: "赵六",
    studentId: "20230101004",
    gender: "女",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "入党申请人",
    contactPerson: "李老师",
    updateTime: "2026-07-12",
  },
  {
    id: 5,
    name: "孙七",
    studentId: "20230101005",
    gender: "男",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "积极分子",
    contactPerson: "周老师",
    updateTime: "2026-07-10",
  },
  {
    id: 6,
    name: "周八",
    studentId: "20220201006",
    gender: "女",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "正式党员",
    contactPerson: "李老师",
    updateTime: "2026-07-08",
  },
  {
    id: 7,
    name: "吴九",
    studentId: "20220201001",
    gender: "男",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "发展对象",
    contactPerson: "刘老师",
    updateTime: "2026-07-06",
  },
  {
    id: 8,
    name: "郑十",
    studentId: "20220201002",
    gender: "女",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "积极分子",
    contactPerson: "周老师",
    updateTime: "2026-07-04",
  },
  {
    id: 9,
    name: "陈一",
    studentId: "20220201003",
    gender: "男",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "入党申请人",
    contactPerson: "江老师",
    updateTime: "2026-07-02",
  },
  {
    id: 10,
    name: "刘二",
    studentId: "20220201004",
    gender: "女",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "正式党员",
    contactPerson: "江老师",
    updateTime: "2026-06-28",
  },
  {
    id: 11,
    name: "黄三",
    studentId: "20220201005",
    gender: "男",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "积极分子",
    contactPerson: "何老师",
    updateTime: "2026-06-25",
  },
  {
    id: 12,
    name: "杨四",
    studentId: "20210101001",
    gender: "女",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "发展对象",
    contactPerson: "江老师",
    updateTime: "2026-06-22",
  },
  {
    id: 13,
    name: "朱五",
    studentId: "20210101002",
    gender: "男",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "预备党员",
    contactPerson: "何老师",
    updateTime: "2026-06-20",
  },
  {
    id: 14,
    name: "马六",
    studentId: "20210101003",
    gender: "女",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "入党申请人",
    contactPerson: "李老师",
    updateTime: "2026-06-18",
  },
  {
    id: 15,
    name: "胡七",
    studentId: "20210101004",
    gender: "男",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "预备党员",
    contactPerson: "林老师",
    updateTime: "2026-06-15",
  },
  {
    id: 16,
    name: "林八",
    studentId: "20210101005",
    gender: "女",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "正式党员",
    contactPerson: "林老师",
    updateTime: "2026-06-12",
  },
  {
    id: 17,
    name: "何九",
    studentId: "20200101001",
    gender: "男",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "积极分子",
    contactPerson: "林老师",
    updateTime: "2026-06-10",
  },
  {
    id: 18,
    name: "罗十",
    studentId: "20200101002",
    gender: "女",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "发展对象",
    contactPerson: "林老师",
    updateTime: "2026-06-08",
  },
  {
    id: 19,
    name: "梁一",
    studentId: "20200101003",
    gender: "男",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "入党申请人",
    contactPerson: "林老师",
    updateTime: "2026-06-05",
  },
  {
    id: 20,
    name: "宋二",
    studentId: "20200101004",
    gender: "女",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "正式党员",
    contactPerson: "周老师",
    updateTime: "2026-06-01",
  },
  {
    id: 21,
    name: "唐三",
    studentId: "20230101006",
    gender: "男",
    partyBranch: "计算机学院学生第二党支部",
    currentIdentity: "入党申请人",
    contactPerson: "周老师",
    updateTime: "2026-05-28",
  },
  {
    id: 22,
    name: "许四",
    studentId: "20230101007",
    gender: "女",
    partyBranch: "计算机学院学生第一党支部",
    currentIdentity: "积极分子",
    contactPerson: "赵老师",
    updateTime: "2026-05-25",
  },
  {
    id: 23,
    name: "秦五",
    studentId: "20220201007",
    gender: "男",
    partyBranch: "软件学院学生党支部",
    currentIdentity: "正式党员",
    contactPerson: "何老师",
    updateTime: "2026-05-20",
  },
  {
    id: 24,
    name: "韩六",
    studentId: "20210101006",
    gender: "女",
    partyBranch: "网络空间安全学院学生党支部",
    currentIdentity: "入党申请人",
    contactPerson: "林老师",
    updateTime: "2026-05-18",
  },
]);

// ============================================================
// 身份标签颜色映射
// ============================================================
const identityTagMap = {
  入党申请人: "info",
  积极分子: "warning",
  发展对象: "primary",
  预备党员: "success",
  正式党员: "danger",
};

// ============================================================
// 权限过滤：支委只看本支部
// TODO: 接入真实接口后，后端根据角色返回数据
// ============================================================
const membersByRole = computed(() => {
  if (isSuperAdmin.value) return allMembers.value;
  return allMembers.value.filter((m) => m.partyBranch === branchOfSecretary);
});

// ============================================================
// 筛选选项（从数据中提取）
// ============================================================
const branchOptions = computed(() => {
  const branches = [...new Set(allMembers.value.map((m) => m.partyBranch))];
  return [{ value: "", label: "全部" }, ...branches.map((b) => ({ value: b, label: b }))];
});

const identityOptions = [
  { value: "", label: "全部" },
  { value: "入党申请人", label: "入党申请人" },
  { value: "积极分子", label: "积极分子" },
  { value: "发展对象", label: "发展对象" },
  { value: "预备党员", label: "预备党员" },
  { value: "正式党员", label: "正式党员" },
];

// ============================================================
// 用户输入的筛选条件（未点击搜索前不生效）
// ============================================================
const filterBranch = ref(""); // 所属支部
const filterIdentity = ref(""); // 当前身份
const filterKeyword = ref(""); // 关键词（姓名/学号）

// ============================================================
// 已应用的筛选条件（点击搜索后才赋值）
// ============================================================
const appliedBranch = ref("");
const appliedIdentity = ref("");
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
const filteredMembers = computed(() => {
  let list = membersByRole.value;

  // 支部筛选（仅超级管理员有此筛选项，支委只能看自己支部）
  if (appliedBranch.value) {
    list = list.filter((m) => m.partyBranch === appliedBranch.value);
  }

  // 身份筛选
  if (appliedIdentity.value) {
    list = list.filter((m) => m.currentIdentity === appliedIdentity.value);
  }

  // 关键词搜索（姓名 / 学号）
  if (appliedKeyword.value.trim()) {
    const kw = appliedKeyword.value.trim().toLowerCase();
    list = list.filter((m) => m.name.toLowerCase().includes(kw) || m.studentId.toLowerCase().includes(kw));
  }

  return list;
});

// ============================================================
// 分页数据
// ============================================================
const totalFiltered = computed(() => filteredMembers.value.length);

const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

// ============================================================
// 统计概览（基于权限可见的全部成员，不受搜索筛选影响）
// ============================================================
const statsData = computed(() => ({
  total: membersByRole.value.length,
  developmentCandidates: membersByRole.value.filter((m) => m.currentIdentity === "发展对象").length,
  probationary: membersByRole.value.filter((m) => m.currentIdentity === "预备党员").length,
}));

// ============================================================
// 当已应用的筛选条件变化时，重置到第 1 页
// ============================================================
watch([appliedBranch, appliedIdentity, appliedKeyword], () => {
  currentPage.value = 1;
});

// ============================================================
// 点击搜索：应用当前筛选条件（模拟接口延迟）
// ============================================================
async function handleSearch(): Promise<void> {
  loading.value = true;
  try {
    // TODO: 替换为真实 API 调用
    // const res = await api.getMemberList({
    //   branch: filterBranch.value,
    //   identity: filterIdentity.value,
    //   keyword: filterKeyword.value,
    // })

    // 模拟接口延迟 300ms
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 应用筛选条件
    appliedBranch.value = filterBranch.value;
    appliedIdentity.value = filterIdentity.value;
    appliedKeyword.value = filterKeyword.value;

    console.log("[Mock] 搜索完成：", {
      branch: appliedBranch.value || "全部",
      identity: appliedIdentity.value || "全部",
      keyword: appliedKeyword.value || "无",
      results: filteredMembers.value.length,
    });
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 点击重置：清空所有筛选条件并立即刷新
// ============================================================
function handleReset(): void {
  filterBranch.value = "";
  filterIdentity.value = "";
  filterKeyword.value = "";
  appliedBranch.value = "";
  appliedIdentity.value = "";
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
// 跳转详情
// ============================================================
function goDetail(id: number): void {
  router.push(`/development/member/${id}`);
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
          <span class="stat-num">{{ statsData.total }}</span>
          <span class="stat-label">在培成员</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ statsData.developmentCandidates }}</span>
          <span class="stat-label">发展对象</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ statsData.probationary }}</span>
          <span class="stat-label">预备党员</span>
        </div>
      </div>

      <!-- 成员列表 -->
      <div class="content-card" v-loading="loading">
        <!-- 卡片标题 -->
        <div class="card-header">
          <span class="card-title">培养成员列表</span>
          <el-button v-if="canAdjust" type="primary" size="small" @click="router.push('/development/batch')">
            批量调整
          </el-button>
        </div>

        <!-- ==================== 搜索筛选栏 ==================== -->
        <!--
          权限控制：
            super_admin 可看到"所属党支部"筛选项，可选所有支部
            party_secretary 隐藏"所属党支部"，默认只能看本支部数据（在 computed 中过滤）
        -->
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <!-- 所属党支部：仅超级管理员可见 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6" v-if="isSuperAdmin">
              <div class="filter-item">
                <label class="filter-label">所属党支部</label>
                <el-select v-model="filterBranch" placeholder="全部" clearable style="width: 100%">
                  <el-option v-for="item in branchOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
            </el-col>

            <!-- 当前身份 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">当前身份</label>
                <el-select v-model="filterIdentity" placeholder="全部" clearable style="width: 100%">
                  <el-option
                    v-for="item in identityOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </el-col>

            <!-- 关键词搜索 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">关键词搜索</label>
                <el-input v-model="filterKeyword" placeholder="输入姓名或学号" clearable @keyup.enter="handleSearch">
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-col>

            <!-- 搜索 / 重置按钮 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item filter-actions">
                <label class="filter-label">&nbsp;</label>
                <div class="btn-group">
                  <el-button type="primary" @click="handleSearch">
                    <el-icon><Search /></el-icon> 搜索
                  </el-button>
                  <el-button @click="handleReset">重置</el-button>
                  <span class="result-count" v-if="appliedBranch || appliedIdentity || appliedKeyword">
                    {{ totalFiltered }} 条结果
                  </span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- ==================== 表格 ==================== -->
        <el-table v-if="pagedMembers.length > 0" :data="pagedMembers" style="width: 100%" stripe>
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="studentId" label="学号" width="140" />
          <el-table-column prop="gender" label="性别" width="70" />
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
              <el-button type="primary" link size="small" @click="goDetail(row.id)"> 查看详情 </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 空状态 -->
        <el-empty v-else description="暂无匹配的成员" :image-size="100" />

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
 * development.vue 样式
 * ============================================================ */

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

/* ---- 统计概览 ---- */
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
  color: var(--party-red, #c12c1f);
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary, #909399);
}

/* ---- 卡片标题 ---- */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2c3e50);

  &::before {
    content: "";
    display: inline-block;
    width: 4px;
    height: 18px;
    background: var(--party-red, #c12c1f);
    border-radius: 2px;
    margin-right: 10px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
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
}

.filter-actions {
  .btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.result-count {
  font-size: 13px;
  color: var(--party-red, #c12c1f);
  white-space: nowrap;
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
  .stats-row {
    flex-direction: column;
  }

  .filter-bar {
    padding: 12px;
  }
}
</style>
