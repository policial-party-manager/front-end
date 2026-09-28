<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowDown, Plus, RefreshRight, Search } from "@element-plus/icons-vue";
import {
  deleteAdminActivity,
  listAdminActivityTypes,
  listPublishedActivityTypes,
  pageAdminActivities,
  pagePublishedActivities,
  updateAdminActivityStatus,
  type ActivityStatus,
  type ActivityTypeOption,
  type ActivityVo,
} from "@/api/activities";
import { listBranches } from "@/api/members";
import { getApiErrorMessage as getErrorMessage } from "@/utils/apiError";
import { useAppStore } from "@/stores/app";
import {
  activityStatusClass as statusClass,
  activityStatusLabel as statusLabel,
  activityStatusOptions as statusOptions,
} from "./activityStatus";

const router = useRouter();
const store = useAppStore();
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
const records = ref<ActivityVo[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref("");
const referenceMessage = ref("");
const typeOptions = ref<ActivityTypeOption[]>([]);
const branchOptions = ref<{ id: number; branchName: string }[]>([]);
const requestSequence = ref(0);
const filters = reactive({
  keyword: "",
  type: undefined as number | undefined,
  branchId: undefined as number | null | undefined,
  status: undefined as ActivityStatus | undefined,
  page: 1,
  size: 10,
});

function formatDateTime(value: string | null): string {
  return value ? value.replace("T", " ").slice(0, 16) : "时间待定";
}

function formatTimeRange(activity: ActivityVo): string {
  const start = formatDateTime(activity.startTime);
  const end = activity.endTime ? formatDateTime(activity.endTime) : "";
  return end ? start + " — " + end : start;
}

async function loadReferenceData(): Promise<void> {
  referenceMessage.value = "";
  const typeRequest = isSuperAdmin.value ? listAdminActivityTypes() : listPublishedActivityTypes();
  const branchRequest = isSuperAdmin.value ? listBranches() : Promise.resolve([]);
  const [typeResult, branchResult] = await Promise.allSettled([typeRequest, branchRequest]);

  if (typeResult.status === "fulfilled") {
    typeOptions.value = typeResult.value;
  } else {
    referenceMessage.value = "活动类型加载失败：" + getErrorMessage(typeResult.reason);
  }

  if (branchResult.status === "fulfilled") {
    branchOptions.value = branchResult.value;
  } else {
    referenceMessage.value = [referenceMessage.value, "支部选项加载失败：" + getErrorMessage(branchResult.reason)]
      .filter(Boolean)
      .join("；");
  }
}

async function loadActivities(): Promise<void> {
  const sequence = ++requestSequence.value;
  loading.value = true;
  errorMessage.value = "";

  try {
    const baseParams = {
      page: filters.page,
      size: filters.size,
      ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(typeof filters.branchId === "number" ? { branchId: filters.branchId } : {}),
    };
    const result = isSuperAdmin.value
      ? await pageAdminActivities({
          ...baseParams,
          ...(filters.status !== undefined ? { status: filters.status } : {}),
        })
      : await pagePublishedActivities(baseParams);

    if (sequence !== requestSequence.value) return;
    records.value = result.records || [];
    total.value = result.total || 0;
  } catch (error) {
    if (sequence === requestSequence.value) {
      records.value = [];
      total.value = 0;
      errorMessage.value = getErrorMessage(error);
    }
  } finally {
    if (sequence === requestSequence.value) loading.value = false;
  }
}

function applyFilters(): void {
  filters.page = 1;
  void loadActivities();
}

function resetFilters(): void {
  filters.keyword = "";
  filters.type = undefined;
  filters.branchId = undefined;
  filters.status = undefined;
  filters.page = 1;
  void loadActivities();
}

function goToPage(page: number): void {
  filters.page = page;
  void loadActivities();
}

function goToCreate(): void {
  void router.push("/activity/create");
}

function goToDetail(activity: ActivityVo): void {
  void router.push("/activity/" + activity.id);
}

function goToEdit(activity: ActivityVo): void {
  void router.push("/activity/edit/" + activity.id);
}

function statusActions(activity: ActivityVo): { value: ActivityStatus; label: string }[] {
  return statusOptions.filter((option) => option.value !== activity.status);
}

async function handleStatusCommand(activity: ActivityVo, command: string | number): Promise<void> {
  const nextStatus = Number(command) as ActivityStatus;
  const nextLabel = statusLabel(nextStatus);

  try {
    await ElMessageBox.confirm("确认将《" + activity.title + "》调整为“" + nextLabel + "”吗？", "调整活动状态", {
      confirmButtonText: "确认调整",
      cancelButtonText: "取消",
      type: "warning",
    });
    await updateAdminActivityStatus(activity.id, nextStatus);
    ElMessage.success("活动状态已更新");
    await loadActivities();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      errorMessage.value = getErrorMessage(error);
    }
  }
}

function statusCommandHandler(activity: ActivityVo): (command: string | number) => void {
  return (command) => void handleStatusCommand(activity, command);
}

async function removeActivity(activity: ActivityVo): Promise<void> {
  try {
    await ElMessageBox.confirm("删除后无法恢复，确认删除《" + activity.title + "》吗？", "删除活动", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await deleteAdminActivity(activity.id);
    ElMessage.success("活动已删除");
    if (records.value.length === 1 && filters.page > 1) filters.page -= 1;
    await loadActivities();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      errorMessage.value = getErrorMessage(error);
    }
  }
}

onMounted(() => {
  void loadReferenceData();
  void loadActivities();
});

watch(isSuperAdmin, (nextRole, previousRole) => {
  if (nextRole === previousRole) return;
  filters.branchId = undefined;
  filters.status = undefined;
  filters.page = 1;
  records.value = [];
  total.value = 0;
  void loadReferenceData();
  void loadActivities();
});
</script>

<template>
  <main class="activity-admin-page">
    <div class="activity-container">
      <header class="activity-intro">
        <div class="intro-kicker"><span class="kicker-mark"></span> 活动工作台</div>
        <div class="intro-heading-row">
          <div>
            <h1>{{ isSuperAdmin ? "活动管理" : "活动查询" }}</h1>
            <p>{{ isSuperAdmin ? "统一维护活动信息、发布状态与内容。" : "浏览平台已发布的活动信息。" }}</p>
          </div>
          <el-button v-if="isSuperAdmin" class="primary-action" type="primary" :icon="Plus" @click="goToCreate">
            发布活动
          </el-button>
          <span v-else class="scope-label">仅展示已发布活动</span>
        </div>
        <div class="intro-foot">
          <span>活动信息</span>
          <span class="foot-line"></span>
          <span>{{ isSuperAdmin ? "平台管理视图" : "公开查询视图" }}</span>
          <span class="foot-spacer"></span>
        </div>
      </header>

      <el-alert
        v-if="referenceMessage"
        class="reference-alert"
        :title="referenceMessage"
        type="warning"
        :closable="false"
        show-icon
      />

      <section class="query-panel" aria-label="活动查询与筛选">
        <div class="query-summary">
          <div class="summary-stat">
            <span class="summary-label">筛选结果</span>
            <strong>{{ total.toLocaleString() }}</strong>
            <span class="summary-caption">条活动</span>
          </div>
          <span class="summary-divider"></span>
          <div class="summary-stat">
            <span class="summary-label">本页展示</span>
            <strong>{{ records.length.toString().padStart(2, "0") }}</strong>
            <span class="summary-caption">每页 {{ filters.size }} 条</span>
          </div>
          <span class="query-scope">{{ isSuperAdmin ? "平台管理视图" : "仅查询已发布活动" }}</span>
        </div>
        <div class="filter-panel">
          <div class="filter-panel-heading">
            <div class="filter-title">
              <span class="panel-index">01 / 筛选</span>
              <h2>筛选与查询</h2>
            </div>
            <span>按活动名称、简介、分类或支部编号快速定位</span>
          </div>
          <div class="filter-grid" :class="{ 'is-admin-filter': isSuperAdmin }">
            <el-input
              v-model="filters.keyword"
              class="keyword-field"
              clearable
              placeholder="搜索活动名称或简介"
              :prefix-icon="Search"
              @keyup.enter="applyFilters"
            />
            <el-select v-model="filters.type" clearable placeholder="全部活动类型">
              <el-option v-for="item in typeOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-if="isSuperAdmin" v-model="filters.branchId" clearable placeholder="全部支部">
              <el-option v-for="item in branchOptions" :key="item.id" :label="item.branchName" :value="item.id" />
            </el-select>
            <el-input-number
              v-else
              v-model="filters.branchId"
              :min="1"
              :precision="0"
              :controls="false"
              placeholder="支部编号"
            />
            <el-select v-if="isSuperAdmin" v-model="filters.status" clearable placeholder="全部状态">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <div class="filter-actions">
              <el-button class="search-action" type="primary" :icon="Search" @click="applyFilters">查询</el-button>
              <el-button :icon="RefreshRight" @click="resetFilters">重置</el-button>
            </div>
          </div>
        </div>
      </section>

      <section class="results-panel">
        <div class="panel-heading results-heading">
          <div>
            <span class="panel-index">02 / 活动记录</span>
            <h2>
              活动列表 <small>{{ total }} 条</small>
            </h2>
          </div>
          <span class="results-caption">数据由服务端实时返回</span>
        </div>

        <el-alert
          v-if="errorMessage"
          class="request-alert"
          :title="errorMessage"
          description="请检查登录状态与访问权限，或稍后重试。"
          type="error"
          show-icon
          :closable="false"
        >
          <template #default>
            <el-button text type="primary" @click="loadActivities">重新加载</el-button>
          </template>
        </el-alert>

        <div v-loading="loading" class="table-wrap" element-loading-text="正在读取活动数据…">
          <el-table v-if="records.length" :data="records" row-key="id" class="activity-table">
            <el-table-column label="活动名称" min-width="300">
              <template #default="{ row }">
                <button class="activity-name-button" type="button" @click="goToDetail(row)">
                  {{ row.title }}
                </button>
                <span class="activity-description">{{ row.description || "暂无活动简介" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="活动类型" width="132">
              <template #default="{ row }">
                <span class="type-label">{{ row.typeName || "未分类" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="所属范围" min-width="190">
              <template #default="{ row }">
                <span class="branch-label">{{ row.branchName || "校级活动" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="活动时间" min-width="220">
              <template #default="{ row }">
                <span class="date-label">{{ formatTimeRange(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="isSuperAdmin" label="状态" width="112">
              <template #default="{ row }">
                <span class="status-pill" :class="statusClass(row.status)"> <i></i>{{ statusLabel(row.status) }} </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" :width="isSuperAdmin ? 286 : 100" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button text type="primary" @click="goToDetail(row)">查看</el-button>
                  <template v-if="isSuperAdmin">
                    <el-button text type="primary" @click="goToEdit(row)">编辑</el-button>
                    <el-dropdown @command="statusCommandHandler(row)">
                      <el-button text type="primary">
                        状态<el-icon class="dropdown-icon"><ArrowDown /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            v-for="option in statusActions(row)"
                            :key="option.value"
                            :command="option.value"
                          >
                            {{ option.label }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <el-button text type="danger" @click="removeActivity(row)">删除</el-button>
                  </template>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-else-if="!loading && !errorMessage" class="empty-state">
            <div class="empty-mark">活</div>
            <h3>暂未找到活动</h3>
            <p>{{ isSuperAdmin ? "试着调整筛选条件，或创建一条新的活动记录。" : "当前没有符合条件的已发布活动。" }}</p>
            <el-button v-if="isSuperAdmin" type="primary" plain @click="goToCreate">创建活动</el-button>
          </div>
        </div>

        <footer v-if="total > 0" class="table-footer">
          <span>当前第 {{ filters.page }} 页，共 {{ total }} 条活动记录</span>
          <el-pagination
            v-model:current-page="filters.page"
            v-model:page-size="filters.size"
            background
            layout="sizes, prev, pager, next"
            :page-sizes="[10, 20, 50]"
            :total="total"
            @current-change="goToPage"
            @size-change="applyFilters"
          />
        </footer>
      </section>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.activity-admin-page {
  min-height: 100%;
  padding: 32px 0 54px;
  color: #292c2d;
  background: radial-gradient(circle at 93% 3%, rgba(181, 139, 77, 0.075), transparent 22rem), #f4f2ec;
  --activity-paper: #fffefa;
  --activity-muted: #737777;
  --activity-quiet: #9a9c99;
}

.activity-container {
  width: min(1260px, calc(100% - 56px));
  margin: 0 auto;
}

.activity-intro {
  margin-bottom: 24px;
}

.intro-kicker,
.intro-foot,
.intro-heading-row,
.panel-heading,
.filter-actions,
.row-actions,
.table-footer {
  display: flex;
  align-items: center;
}

.intro-kicker {
  gap: 9px;
  color: #8b7760;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;

  i {
    color: #a8a095;
    font-size: 11px;
    font-style: normal;
    font-weight: 500;
  }
}

.kicker-mark {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: #b58b4d;
  transform: rotate(45deg);
}

.intro-heading-row {
  justify-content: space-between;
  gap: 24px;
  margin-top: 10px;

  h1 {
    color: #292c2d;
    font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
    font-size: clamp(27px, 3vw, 36px);
    font-weight: 600;
    letter-spacing: 0.045em;
    line-height: 1.25;
  }

  p {
    margin-top: 7px;
    color: var(--activity-muted);
    font-size: 14px;
  }
}

.primary-action {
  min-height: 42px;
  padding: 0 19px;
  border-color: var(--party-red);
  border-radius: 7px;
  background: var(--party-red);
}

.primary-action:hover {
  border-color: var(--party-red-dark);
  background: var(--party-red-dark);
}

.scope-label {
  padding: 8px 13px;
  border: 1px solid #e4d9c8;
  border-radius: 999px;
  color: #876a40;
  background: #fbf7ee;
  font-size: 13px;
}

.intro-foot {
  gap: 10px;
  margin-top: 22px;
  color: #85847d;
  font-size: 12px;
}

.intro-foot strong {
  margin-left: 4px;
  color: var(--party-red);
  font-size: 13px;
}

.foot-line {
  width: 24px;
  height: 1px;
  background: #c8b99e;
}

.foot-spacer {
  flex: 1;
}

.reference-alert {
  margin-bottom: 15px;
  border: 1px solid #eee1c8;
  border-radius: 8px;
  background: #fcf8ef;
}

.query-panel {
  overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid var(--workspace-line);
  border-radius: 12px;
  background: var(--activity-paper);
  box-shadow: 0 8px 24px rgba(46, 37, 27, 0.035);
}

.query-summary {
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 22px;
  padding: 12px 22px;
  background: #fcfbf7;
}

.summary-stat {
  display: flex;
  align-items: baseline;
  gap: 9px;
  white-space: nowrap;
}

.summary-label {
  color: var(--activity-muted);
  font-size: 12px;
}

.summary-stat strong {
  color: #303332;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 25px;
  font-weight: 600;
  line-height: 1;
}

.summary-stat:first-child strong {
  color: var(--party-red);
}

.summary-caption {
  color: #898983;
  font-size: 12px;
}

.summary-divider {
  width: 1px;
  height: 34px;
  background: var(--workspace-line);
}

.query-scope {
  margin-left: auto;
  padding: 6px 11px;
  border: 1px solid #e7dfd1;
  border-radius: 999px;
  color: #8d7755;
  background: #faf7f0;
  font-size: 12px;
  white-space: nowrap;
}

.filter-panel {
  padding: 13px 22px 16px;
  border-top: 1px solid #eeeae2;
  background: var(--activity-paper);
}

.filter-panel-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 9px;
}

.filter-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.filter-panel-heading h2 {
  color: #343735;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 16px;
  font-weight: 600;
}

.filter-panel-heading span {
  color: #96958e;
  font-size: 12px;
}

.panel-heading {
  justify-content: space-between;
  gap: 20px;
}

.panel-index {
  color: #ae8a56;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.panel-heading h2 {
  margin-top: 4px;
  color: #343735;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 21px;
  font-weight: 600;
}

.panel-heading h2 small {
  margin-left: 8px;
  color: #99958c;
  font-family: var(--font-family);
  font-size: 12px;
  font-weight: 400;
}

.results-caption {
  color: #96958e;
  font-size: 12px;
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.7fr) minmax(150px, 1fr) minmax(130px, 0.8fr) auto;
  gap: 8px;
}

.filter-grid.is-admin-filter {
  grid-template-columns: minmax(210px, 1.7fr) repeat(3, minmax(140px, 1fr)) auto;
}

.keyword-field {
  min-width: 0;
}

.filter-grid :deep(.el-input__wrapper),
.filter-grid :deep(.el-select__wrapper) {
  min-height: 36px;
  border-radius: 7px;
  background: #fbfaf7;
  box-shadow: 0 0 0 1px #e9e5dc inset;
}

.filter-grid :deep(.el-input__wrapper.is-focus),
.filter-grid :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #bc6e63 inset;
}

.filter-actions {
  gap: 7px;
  white-space: nowrap;
}

.filter-actions .el-button {
  min-height: 36px;
  margin-left: 0;
  border-radius: 7px;
}

.search-action {
  border-color: var(--party-red);
  background: var(--party-red);
}

.results-panel {
  margin-top: 0;
  padding: 23px 25px 20px;
  border: 1px solid #ded8cc;
  border-top: 3px solid var(--party-red);
  border-radius: 12px;
  background: var(--activity-paper);
  box-shadow: 0 14px 34px rgba(46, 37, 27, 0.055);
}

.results-heading {
  margin-bottom: 19px;
}

.request-alert {
  margin-bottom: 12px;
}

.request-alert :deep(.el-alert__content) {
  align-items: flex-start;
}

.table-wrap {
  min-height: 320px;
}

.activity-table {
  --el-table-border-color: #eeeae2;
  --el-table-header-bg-color: #f8f6f0;
  --el-table-row-hover-bg-color: #fbf8f2;
  color: #3e4240;
}

.activity-table :deep(th.el-table__cell) {
  height: 48px;
  color: #77766f;
  font-size: 13px;
  font-weight: 600;
}

.activity-table :deep(td.el-table__cell) {
  padding: 17px 0;
}

.activity-name-button {
  display: block;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  color: #343735;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.activity-name-button:hover {
  color: var(--party-red);
}

.activity-description {
  display: block;
  max-width: 430px;
  overflow: hidden;
  margin-top: 4px;
  color: #9a9a94;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-label,
.branch-label,
.date-label {
  color: #6f716e;
  font-size: 13px;
}

.date-label {
  font-variant-numeric: tabular-nums;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}

.status-pill i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.is-published {
  color: #4d7458;
  background: #eaf1e9;
}

.is-draft {
  color: #987238;
  background: #f6efdf;
}

.is-offline {
  color: #777977;
  background: #eeefec;
}

.row-actions {
  gap: 2px;
  white-space: nowrap;
}

.row-actions :deep(.el-button.is-text) {
  min-height: 28px;
  padding: 0 5px;
  font-size: 13px;
}

.dropdown-icon {
  margin-left: 2px;
  font-size: 11px;
}

.empty-state {
  display: flex;
  min-height: 250px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid #e9dfd1;
  border-radius: 50%;
  color: #a9834e;
  background: #faf6ee;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 18px;
}

.empty-state h3 {
  margin-top: 12px;
  color: #454946;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 16px;
}

.empty-state p {
  margin: 5px 0 13px;
  color: #93948e;
  font-size: 13px;
}

.table-footer {
  justify-content: space-between;
  gap: 18px;
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid #efede7;
  color: #95958e;
  font-size: 12px;
}

.table-footer :deep(.el-pagination) {
  --el-pagination-button-bg-color: #f8f6f1;
  --el-pagination-hover-color: var(--party-red);
}

@media (max-width: 1100px) {
  .filter-grid,
  .filter-grid.is-admin-filter {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .keyword-field {
    grid-column: span 2;
  }

  .filter-actions {
    justify-content: flex-end;
  }
}

@media (max-width: 720px) {
  .activity-admin-page {
    padding-top: 22px;
  }

  .activity-container {
    width: min(100% - 28px, 600px);
  }

  .query-summary {
    min-height: 68px;
    flex-wrap: wrap;
    gap: 12px;
    padding: 13px 16px;
  }

  .query-scope {
    margin-left: auto;
  }

  .filter-panel {
    padding: 12px 16px 15px;
  }

  .results-panel {
    padding: 20px 16px 16px;
  }

  .filter-panel-heading span,
  .results-caption {
    display: none;
  }

  .table-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .intro-heading-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .query-summary {
    display: grid;
    grid-template-columns: auto 1px auto;
    column-gap: 10px;
  }

  .summary-caption {
    display: none;
  }

  .query-scope {
    grid-column: 1 / -1;
    justify-self: start;
    margin-left: 0;
  }

  .filter-panel-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .filter-grid,
  .filter-grid.is-admin-filter {
    grid-template-columns: 1fr;
  }

  .keyword-field {
    grid-column: auto;
  }

  .filter-actions {
    justify-content: flex-start;
  }

  .intro-foot {
    flex-wrap: wrap;
  }

  .foot-spacer {
    flex-basis: 100%;
  }
}
</style>
