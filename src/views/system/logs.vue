<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useAppStore } from "@/stores/app";
import { sessionHasAccessToken } from "@/utils/session";
import { pageLogs, type LogFilters, type OperationLogVo } from "@/api/logs";

const store = useAppStore();
const canManage = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);

/** logType 取值与后端 LogType 常量一致，也是 stats 接口的 4 个 key。 */
const LOG_TYPES = [
  { label: "登录", value: "LOGIN" },
  { label: "登出", value: "LOGOUT" },
  { label: "操作", value: "OPERATION" },
  { label: "错误", value: "ERROR" },
];
/** 模块枚举来自后端 OperationLogFilter.moduleFor 与两个发布方法写死的取值。 */
const MODULES = [
  "用户管理",
  "支部管理",
  "权限管理",
  "活动管理",
  "新闻管理",
  "公告管理",
  "个人中心",
  "管理员",
  "内容",
  "其他",
  "认证",
  "系统",
];
const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  branch_admin: "支部管理员",
  student: "普通成员",
};

const rows = ref<OperationLogVo[]>([]);
const loading = ref(false);
const loadError = ref(false);
/** loadError 细分：true 表示后端日志服务本身不可用，false 表示请求被拒（参数/权限）。 */
const serviceUnavailable = ref(false);
const total = ref(0);
const page = ref(1);
const size = ref(10);

const filters = reactive({
  logType: undefined as string | undefined,
  module: undefined as string | undefined,
  operatorName: "",
  ip: "",
  keyword: "",
  success: undefined as boolean | undefined,
  errorType: "",
});
const timeRange = ref<[string, string] | null>(null);
const applied = ref<LogFilters>({});

/** occurTimeText 是 ISO_OFFSET_DATE_TIME，偏移量在末尾，可安全截断。 */
const dateLabel = (date: string | null) => (date ? date.replace("T", " ").slice(0, 16) : "—");
const typeLabel = (type: string) => LOG_TYPES.find((item) => item.value === type)?.label || type || "—";
const typeTag = (type: string) => (type === "ERROR" ? "danger" : type === "OPERATION" ? "primary" : "info");
const roleLabel = (role: string | null) => ROLE_LABELS[role || ""] || role || "—";
/** success 契约非空，无需可空兜底，表格与抽屉共用同一份文案。 */
const resultLabel = (value: boolean) => (value ? "成功" : "失败");
/** 数值字段用 == null 而非 falsy：durationMs / resultCode 的 0 是合法值，不能显示成 —。 */
const durationLabel = (value: number | null) => (value == null ? "—" : `${value} ms`);

/**
 * 判断失败是否源于日志服务不可用。
 * ES 未就绪时后端同步返回 HTTP 500（毫秒级），前端 15s 超时则完全没有 response，
 * 两者都归入不可用；后端若改用 HTTP 200 + code!=200 包装，则靠 message 关键字兜底。
 */
function isServiceUnavailable(error: unknown): boolean {
  const message = (error as { message?: string })?.message || "";
  if (/Elasticsearch|日志服务/i.test(message)) return true;
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return true;
  return status >= 500;
}

let requestSequence = 0;
async function loadLogs() {
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = false;
  try {
    const result = await pageLogs({ page: page.value, size: size.value, ...applied.value });
    if (sequence !== requestSequence) return;
    rows.value = result.records;
    total.value = result.total;
    serviceUnavailable.value = false;
  } catch (error) {
    if (sequence !== requestSequence) return;
    rows.value = [];
    total.value = 0;
    loadError.value = true;
    serviceUnavailable.value = isServiceUnavailable(error);
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/** 组装提交快照：空值一律收敛成 undefined，避免把空串发给后端。 */
function buildFilters(): LogFilters {
  const [startTime, endTime] = timeRange.value || [];
  return {
    logType: filters.logType || undefined,
    module: filters.module || undefined,
    operatorName: filters.operatorName.trim() || undefined,
    ip: filters.ip.trim() || undefined,
    keyword: filters.keyword.trim() || undefined,
    // el-select 清空时不同版本会给出 "" 或 undefined，这里只放行真正的布尔值。
    success: typeof filters.success === "boolean" ? filters.success : undefined,
    errorType: filters.errorType.trim() || undefined,
    startTime,
    endTime,
  };
}
function search() {
  applied.value = buildFilters();
  page.value = 1;
  void loadLogs();
}
function reset() {
  filters.logType = undefined;
  filters.module = undefined;
  filters.operatorName = "";
  filters.ip = "";
  filters.keyword = "";
  filters.success = undefined;
  filters.errorType = "";
  timeRange.value = null;
  search();
}
function changePage(value: number) {
  page.value = value;
  void loadLogs();
}
function changeSize(value: number) {
  size.value = value;
  page.value = 1;
  void loadLogs();
}

/** 列表接口已返回全字段，详情直接复用行数据，不再单独请求。 */
const detailVisible = ref(false);
const detail = ref<OperationLogVo | null>(null);
function openDetail(row: OperationLogVo) {
  detail.value = row;
  detailVisible.value = true;
}

onMounted(() => {
  if (canManage.value) void loadLogs();
});
watch(canManage, (enabled) => {
  rows.value = [];
  total.value = 0;
  detailVisible.value = false;
  if (enabled) void loadLogs();
});
</script>

<template>
  <div class="logs-page page-container">
    <div class="page-header">
      <div>
        <h2 class="section-title">操作日志</h2>
        <p>检索登录、操作与错误日志；数据来自后端日志服务。</p>
      </div>
      <router-link class="roles-link" to="/system/roles">角色管理 →</router-link>
    </div>
    <el-alert v-if="!sessionHasAccessToken" title="操作日志需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌。请使用超级管理员账号登录后再访问操作日志。</p>
        <el-button type="primary" @click="$router.push('/login')">前往登录</el-button>
      </template>
    </el-alert>
    <el-alert
      v-else-if="!canManage"
      title="当前账号没有操作日志权限，请使用超级管理员账号登录"
      type="warning"
      show-icon
      :closable="false"
    />
    <div v-else class="content-card">
      <div class="card-header">
        <div>
          <strong>日志列表</strong>
          <span v-if="!loadError" class="total-label">共 {{ total }} 条</span>
        </div>
      </div>
      <div class="filters">
        <div class="filters-row">
          <el-select v-model="filters.logType" clearable placeholder="全部类型" class="filter-type"
            ><el-option v-for="item in LOG_TYPES" :key="item.value" :label="item.label" :value="item.value"
          /></el-select>
          <el-input v-model="filters.operatorName" clearable placeholder="操作人" class="filter-input" />
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="关键词（动作 / 说明 / 路径 / 操作人）"
            class="filter-keyword"
            @keyup.enter="search"
          />
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            class="filter-time"
          />
        </div>
        <div class="filters-row">
          <el-select v-model="filters.module" clearable placeholder="全部模块" class="filter-type"
            ><el-option v-for="name in MODULES" :key="name" :label="name" :value="name"
          /></el-select>
          <el-input v-model="filters.ip" clearable placeholder="IP 地址" class="filter-input" />
          <el-select v-model="filters.success" clearable placeholder="全部结果" class="filter-type"
            ><el-option label="成功" :value="true" /><el-option label="失败" :value="false"
          /></el-select>
          <el-input v-model="filters.errorType" clearable placeholder="异常类型" class="filter-input" />
          <el-button type="primary" @click="search">搜索</el-button><el-button @click="reset">重置</el-button>
        </div>
      </div>
      <el-alert
        v-if="loadError"
        :title="serviceUnavailable ? '日志服务不可用' : '日志数据加载失败'"
        type="error"
        show-icon
        :closable="false"
        class="load-error"
      >
        <template #default>
          <p v-if="serviceUnavailable">后端日志服务（Elasticsearch）未就绪，不是无数据。请确认日志服务已启动后重试。</p>
          <p v-else>请求已到达后端但被拒绝，常见原因是筛选参数不合法或当前账号权限不足。</p>
          <el-button link type="primary" @click="loadLogs">重试</el-button>
        </template>
      </el-alert>
      <!-- loadError 时不渲染表格：空表的「暂无日志数据」会和上方的服务不可用告警自相矛盾。 -->
      <el-table
        v-if="!loadError"
        v-loading="loading"
        :data="rows"
        stripe
        style="width: 100%"
        class="logs-table"
        empty-text="暂无日志数据"
      >
        <el-table-column label="时间" width="150"
          ><template #default="{ row }">{{ dateLabel(row.occurTimeText) }}</template></el-table-column
        >
        <el-table-column label="类型" width="90"
          ><template #default="{ row }"
            ><el-tag size="small" :type="typeTag(row.logType)">{{ typeLabel(row.logType) }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="模块" width="110"
          ><template #default="{ row }">{{ row.module || "—" }}</template></el-table-column
        >
        <el-table-column label="动作" min-width="130" show-overflow-tooltip
          ><template #default="{ row }">{{ row.action || "—" }}</template></el-table-column
        >
        <el-table-column label="操作人" min-width="110"
          ><template #default="{ row }">{{ row.operatorName || "—" }}</template></el-table-column
        >
        <el-table-column label="IP" min-width="130"
          ><template #default="{ row }">{{ row.ipAddress || "—" }}</template></el-table-column
        >
        <el-table-column label="结果" width="80"
          ><template #default="{ row }"
            ><el-tag size="small" :type="row.success ? 'success' : 'danger'">{{
              resultLabel(row.success)
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column label="耗时" width="100"
          ><template #default="{ row }">{{ durationLabel(row.durationMs) }}</template></el-table-column
        >
        <el-table-column label="操作" width="80" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="openDetail(row)">详情</el-button></template
          ></el-table-column
        >
      </el-table>
      <el-pagination
        v-if="total && !loadError"
        :current-page="page"
        :page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="changePage"
        @size-change="changeSize"
      />
    </div>

    <el-drawer v-model="detailVisible" title="日志详情" size="640px">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="日志 ID" :span="2">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ typeLabel(detail.logType) }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ detail.module || "—" }}</el-descriptions-item>
        <el-descriptions-item label="动作" :span="2">{{ detail.action || "—" }}</el-descriptions-item>
        <el-descriptions-item label="请求方法">{{ detail.method || "—" }}</el-descriptions-item>
        <el-descriptions-item label="状态码">{{ detail.resultCode ?? "—" }}</el-descriptions-item>
        <el-descriptions-item label="请求路径" :span="2">{{ detail.path || "—" }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detail.operatorName || "—" }}</el-descriptions-item>
        <el-descriptions-item label="操作人 ID">{{ detail.operatorId ?? "—" }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ roleLabel(detail.role) }}</el-descriptions-item>
        <el-descriptions-item label="IP">{{ detail.ipAddress || "—" }}</el-descriptions-item>
        <el-descriptions-item label="结果">{{ resultLabel(detail.success) }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ durationLabel(detail.durationMs) }}</el-descriptions-item>
        <el-descriptions-item label="异常类型">{{ detail.errorType || "—" }}</el-descriptions-item>
        <el-descriptions-item label="发生时间">{{ dateLabel(detail.occurTimeText) }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="2">{{ detail.message || "—" }}</el-descriptions-item>
        <el-descriptions-item label="User-Agent" :span="2">{{ detail.userAgent || "—" }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.logs-page {
  padding: 24px 0 40px;
}
.logs-page.page-container {
  width: min(calc(100% - 32px), 1728px);
  max-width: none;
  padding-inline: 16px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  p {
    color: var(--text-secondary);
    margin-top: 4px;
  }
}
.roles-link {
  flex: none;
  color: var(--party-red);
  font-size: 13px;
  white-space: nowrap;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.total-label {
  color: var(--text-secondary);
  font-size: 13px;
  margin-left: 12px;
}
.filters {
  padding: 16px;
  background: var(--bg-page);
  margin-bottom: 18px;
  border-radius: var(--radius-base);
  display: grid;
  gap: 10px;
}
.filters-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.filters .filter-type {
  width: 140px;
}
.filters .filter-input {
  width: 180px;
}
.filters .filter-keyword {
  width: 280px;
}
.filters .filter-time {
  width: 380px;
}
.load-error {
  margin-bottom: 16px;
}
.logs-table :deep(.el-table__cell) {
  vertical-align: middle;
}
.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
@media (max-width: 768px) {
  .logs-page.page-container {
    width: 100%;
  }
  .page-header {
    flex-direction: column;
  }
  .filters .filter-type,
  .filters .filter-input,
  .filters .filter-keyword,
  .filters .filter-time {
    width: 100%;
  }
}
</style>
