<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAppStore } from "@/stores/app";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  DISTRIBUTION_DIMENSION_LABELS,
  DISTRIBUTION_DIMENSIONS,
  getDashboard,
  getDistribution,
  getMyStudySummary,
  type DashboardVo,
  type DistributionDimension,
  type DistributionGroup,
  type DistributionVo,
  type IdentityCount,
  type StudySummaryVo,
} from "@/api/statistics";
import { studyMinutesHint } from "@/views/development/myDevelopmentDisplay";

/**
 * 数据统计：政治身份分布、管理待办与本人学习汇总三个板块。
 *
 * 三个端点各发一次、互不阻塞，各自的加载 / 错误 / 重试状态独立——一个板块失败不得影响
 * 其它已经成功的板块。范围（全院 / 本支部）全部由服务端按登录态判定，页面不传任何范围参数。
 *
 * 两套身份口径必须分开呈现，不合并、不互相换算：
 * - 分布板块的 `total` 是该组全部成员数（含身份未登记），`identities` 只列身份字典，
 *   因此各身份之和可能小于 `total`；
 * - 待办板块的 `identityDistribution` 由服务端按身份直接计数并额外带一行未登记，
 *   但它是单一汇总、不分组。
 * 两者都未按成员启用/停用过滤，都不能称为「启用成员数」。
 *
 * 本人学习汇总查的是**当前登录账号自己**的记录（`mine/summary`）：本页只对管理角色开放，
 * 所以它不是被统计成员的数据，页面标题必须写明「本人数据」。
 */
const store = useAppStore();

/** 与权限矩阵一致：statistics:view 只授予超管与支委。 */
const ALLOWED_ROLES = ["super_admin", "party_secretary"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);

const dimension = ref<DistributionDimension>("college");
/** 本次请求实际发出的维度；用于比对服务端回显，避免把回退结果说成原维度。 */
const requestedDimension = ref<DistributionDimension>("college");
const data = ref<DistributionVo | null>(null);
const loading = ref(false);
const loadError = ref("");

const groups = computed<DistributionGroup[]>(() => data.value?.groups ?? []);

const scopeLabel = computed(() => (store.currentRole === "super_admin" ? "全院" : "本支部"));

/** 服务端回显维度与请求维度不一致时，必须显式说明实际维度。 */
const echoMismatch = computed(() => {
  if (!data.value) return false;
  return (data.value.dimension || "") !== requestedDimension.value;
});

function dimensionLabel(value: string): string {
  if (!value) return "未知维度";
  if (value in DISTRIBUTION_DIMENSION_LABELS) return DISTRIBUTION_DIMENSION_LABELS[value as DistributionDimension];
  return value;
}

const dimensionOptions = DISTRIBUTION_DIMENSIONS.map((value) => ({
  value,
  label: DISTRIBUTION_DIMENSION_LABELS[value],
}));

function isDimension(value: unknown): value is DistributionDimension {
  return typeof value === "string" && (DISTRIBUTION_DIMENSIONS as readonly string[]).includes(value);
}

// ============ 身份列：按响应中的 identityName 动态生成，不硬编码列序号 ============
interface IdentityColumn {
  key: string;
  label: string;
}

function identityKeyOf(item: IdentityCount): string {
  // 后端 identityId 可能为空；此时用名称兜底，避免多列折叠成一列。
  if (item.identityId !== null) return `id:${item.identityId}`;
  return `name:${item.identityName ?? ""}`;
}

function identityLabelOf(item: IdentityCount): string {
  if (item.identityName) return item.identityName;
  if (item.identityId !== null) return `身份 ${item.identityId}`;
  return "未命名身份";
}

const identityColumns = computed<IdentityColumn[]>(() => {
  const seen = new Map<string, IdentityColumn>();
  for (const group of groups.value) {
    for (const item of group.identities) {
      const key = identityKeyOf(item);
      if (!seen.has(key)) seen.set(key, { key, label: identityLabelOf(item) });
    }
  }
  return [...seen.values()];
});

/** 返回该组该身份的人数；该组响应里没有这个身份时返回 null，页面显示「—」而不是 0。 */
function countOf(group: DistributionGroup, columnKey: string): number | null {
  const found = group.identities.find((item) => identityKeyOf(item) === columnKey);
  return found ? found.count : null;
}

// ============ 请求隔离：请求序号 + 会话快照 ============
let disposed = false;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;

async function loadDistribution(): Promise<void> {
  if (!canView.value || disposed) return;
  const requested = dimension.value;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  requestedDimension.value = requested;
  loading.value = true;
  loadError.value = "";
  // 切换维度或重试时先丢弃旧结果，避免把上一个维度的数据当成本次结果展示。
  data.value = null;
  try {
    const result = await getDistribution(requested);
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    data.value = result;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    data.value = null;
    loadError.value = getApiErrorMessage(error, "暂时无法加载政治身份分布");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

function onDimensionChange(value: string | number | boolean | undefined): void {
  if (!isDimension(value) || value === dimension.value) return;
  dimension.value = value;
  void loadDistribution();
}

function retry(): void {
  void loadDistribution();
}

// ============ 管理待办与本人学习汇总：各自独立的序号与状态 ============
const dashboard = ref<DashboardVo | null>(null);
const dashboardLoading = ref(false);
const dashboardError = ref("");
const studySummary = ref<StudySummaryVo | null>(null);
const studySummaryLoading = ref(false);
const studySummaryError = ref("");

let dashboardSequence = 0;
let studySummarySequence = 0;

/** 身份计数行的名称：优先服务端名称，其次编号，两者都为空才显示「未登记」。 */
function dashboardIdentityLabel(item: IdentityCount): string {
  if (item.identityName) return item.identityName;
  if (item.identityId !== null) return `身份 ${item.identityId}`;
  return "未登记";
}

async function loadDashboard(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++dashboardSequence;
  const snapshot = captureSessionIdentity();
  dashboardLoading.value = true;
  dashboardError.value = "";
  dashboard.value = null;
  try {
    const result = await getDashboard();
    if (sequence !== dashboardSequence || !sessionOk(snapshot)) return;
    dashboard.value = result;
  } catch (error) {
    if (sequence !== dashboardSequence || !sessionOk(snapshot)) return;
    dashboard.value = null;
    // 支委未归属支部时服务端返回 400，原文直接转达，不改写成「无权限」。
    dashboardError.value = getApiErrorMessage(error, "暂时无法加载管理待办");
  } finally {
    if (sequence === dashboardSequence && isSessionIdentityCurrent(snapshot)) dashboardLoading.value = false;
  }
}

async function loadStudySummary(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++studySummarySequence;
  const snapshot = captureSessionIdentity();
  studySummaryLoading.value = true;
  studySummaryError.value = "";
  studySummary.value = null;
  try {
    const result = await getMyStudySummary();
    if (sequence !== studySummarySequence || !sessionOk(snapshot)) return;
    studySummary.value = result;
  } catch (error) {
    if (sequence !== studySummarySequence || !sessionOk(snapshot)) return;
    studySummary.value = null;
    studySummaryError.value = getApiErrorMessage(error, "暂时无法加载本人学习汇总");
  } finally {
    if (sequence === studySummarySequence && isSessionIdentityCurrent(snapshot)) studySummaryLoading.value = false;
  }
}

function invalidate(): void {
  requestSequence++;
  data.value = null;
  loading.value = false;
  loadError.value = "";
  dashboardSequence++;
  dashboard.value = null;
  dashboardLoading.value = false;
  dashboardError.value = "";
  studySummarySequence++;
  studySummary.value = null;
  studySummaryLoading.value = false;
  studySummaryError.value = "";
}

/** 三个板块一次发出，互不等待：任何一个失败或变慢都不阻断其它两个。 */
function loadAll(): void {
  if (!canView.value) return;
  void loadDistribution();
  void loadDashboard();
  void loadStudySummary();
}

onMounted(() => {
  loadAll();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或权限变化：丢弃旧会话已渲染的数据与在途响应，再按新会话重新拉取。
  invalidate();
  loadAll();
});

onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});
</script>

<template>
  <main class="statistics-page page-container">
    <header class="page-heading">
      <div>
        <span class="eyebrow">STATISTICS / 数据统计</span>
        <h1>数据统计</h1>
        <p>管理待办与本人学习汇总看总览，政治身份分布按学院、专业、班级、年级或支部切分查看各身份人数。</p>
      </div>
      <el-tag class="scope-tag" effect="plain" type="danger">{{ scopeLabel }}范围</el-tag>
    </header>

    <el-alert v-if="!sessionHasAccessToken" title="数据统计需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实统计数据。请使用具备统计权限的账号登录后再访问。</p>
      </template>
    </el-alert>

    <el-alert
      v-else-if="!ALLOWED_ROLES.includes(store.currentRole)"
      title="当前身份无权查看数据统计"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>数据统计仅面向超级管理员与党支部书记（支委）开放，普通成员可查看本人的培养档案。</p>
      </template>
    </el-alert>

    <template v-else-if="canView">
      <section
        class="surface content-card dashboard-card"
        aria-labelledby="stat-dashboard-title"
        data-testid="statistics-dashboard"
      >
        <div class="section-heading">
          <div>
            <span class="section-index">TODO</span>
            <h2 id="stat-dashboard-title">管理待办</h2>
          </div>
          <p>{{ scopeLabel }}范围 · 计数与身份计数均由服务端返回</p>
        </div>

        <div v-if="dashboardLoading" class="state-card" role="status" aria-live="polite" aria-busy="true">
          <el-skeleton :rows="3" animated />
          <span class="state-caption">正在加载管理待办…</span>
        </div>

        <div v-else-if="dashboardError" class="state-card" role="alert" data-testid="stat-dashboard-error">
          <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
          <div class="state-copy">
            <h3>管理待办暂时无法加载</h3>
            <p>{{ dashboardError }}</p>
          </div>
          <el-button type="primary" plain data-testid="stat-dashboard-retry" @click="loadDashboard">
            <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
          </el-button>
        </div>

        <template v-else-if="dashboard">
          <div class="metric-row">
            <div class="metric-card" data-testid="stat-pending-thought-reports">
              <span class="metric-label">待审阅思想汇报</span>
              <strong class="metric-value">{{ dashboard.pendingThoughtReports }}</strong>
              <span class="metric-unit">份</span>
            </div>
            <div class="metric-card" data-testid="stat-pending-identity-changes">
              <span class="metric-label">待审批身份变更</span>
              <strong class="metric-value">{{ dashboard.pendingIdentityChanges }}</strong>
              <span class="metric-unit">单</span>
            </div>
          </div>
          <p class="metric-hint">
            两个计数纯展示，暂不可点击跳转：审阅思想汇报与审批身份变更的管理页尚未接入。计数为 0
            表示服务端确实没有待处理事项。
          </p>

          <div class="table-wrap dashboard-table-wrap">
            <el-table
              :data="dashboard.identityDistribution"
              class="stat-table"
              data-testid="stat-dashboard-table"
              border
              stripe
              size="default"
              empty-text="服务端未返回身份计数"
            >
              <el-table-column label="政治身份" min-width="200" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="group-key">{{ dashboardIdentityLabel(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="level" label="层级" min-width="88" align="right">
                <template #default="{ row }">{{ row.level ?? "—" }}</template>
              </el-table-column>
              <el-table-column prop="count" label="人数" min-width="96" align="right">
                <template #default="{ row }">
                  <strong class="group-total">{{ row.count }}</strong>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="caliber-note" data-testid="stat-dashboard-caliber">
            <h3>口径说明（与下方分布不同，不可互相换算）</h3>
            <ul>
              <li>
                本表按身份直接汇总为<strong>单一总量，不按学院/专业/支部等维度分组</strong>；未登记身份的成员由服务端单独成行，
                行名为空时页面显示「未登记」。
              </li>
              <li>
                下方「政治身份分布」按维度分组，各身份人数之和不含未登记成员，因此<strong>可能小于该分组总人数</strong>；
                两者是不同口径，页面既不合并也不互相换算。
              </li>
              <li>两套数字都<strong>未按成员启用/停用过滤</strong>，停用成员同样计入，故都不能称为「启用成员数」。</li>
              <li>{{ scopeLabel }}范围由服务端按登录身份判定：超级管理员为全院，党支部书记为本人所属支部。</li>
            </ul>
          </div>
        </template>
      </section>

      <section
        class="surface content-card"
        aria-labelledby="stat-study-summary-title"
        data-testid="statistics-study-summary"
      >
        <div class="section-heading">
          <div>
            <span class="section-index">MY STUDY</span>
            <h2 id="stat-study-summary-title">本人学习汇总（当前登录账号）</h2>
          </div>
          <p>本人数据：只统计当前登录账号自己的学习记录，不是被统计成员的数据</p>
        </div>

        <div v-if="studySummaryLoading" class="state-card" role="status" aria-live="polite" aria-busy="true">
          <el-skeleton :rows="2" animated />
          <span class="state-caption">正在加载本人学习汇总…</span>
        </div>

        <div v-else-if="studySummaryError" class="state-card" role="alert" data-testid="stat-study-summary-error">
          <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
          <div class="state-copy">
            <h3>本人学习汇总暂时无法加载</h3>
            <p>{{ studySummaryError }}</p>
          </div>
          <el-button type="primary" plain data-testid="stat-study-summary-retry" @click="loadStudySummary">
            <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
          </el-button>
        </div>

        <div v-else-if="studySummary" class="metric-row" data-testid="stat-study-summary-metrics">
          <div class="metric-card">
            <span class="metric-label">学习记录</span>
            <strong class="metric-value">{{ studySummary.recordCount }}</strong>
            <span class="metric-unit">条</span>
          </div>
          <div class="metric-card" data-testid="stat-study-total-minutes">
            <span class="metric-label">累计学时</span>
            <strong class="metric-value">{{ studySummary.totalMinutes }}</strong>
            <span class="metric-unit">分钟</span>
            <span v-if="studyMinutesHint(studySummary.totalMinutes)" class="metric-sub">
              {{ studyMinutesHint(studySummary.totalMinutes) }}
            </span>
          </div>
          <div class="metric-card" data-testid="stat-study-avg-score">
            <span class="metric-label">平均分</span>
            <strong v-if="studySummary.avgScore !== null" class="metric-value">{{ studySummary.avgScore }}</strong>
            <strong v-else class="metric-value metric-value-muted">无记录</strong>
            <span class="metric-unit">{{ studySummary.avgScore !== null ? "分" : "" }}</span>
          </div>
        </div>

        <p v-if="studySummary" class="metric-hint">
          累计学时单位是分钟（服务端按每条记录的学时累加），与「我的培养」档案里的累计学时是同一量纲。平均分无记录时显示「无记录」，不是
          0 分。
        </p>
      </section>

      <section class="surface content-card toolbar" aria-label="统计维度">
        <div class="toolbar-row">
          <span class="toolbar-label">统计维度</span>
          <el-radio-group
            :model-value="dimension"
            class="dimension-switch"
            data-testid="stat-dimension"
            @change="onDimensionChange"
          >
            <el-radio-button v-for="option in dimensionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <p class="toolbar-hint">切换维度会重新向服务端请求；页面不传支部等范围参数，范围由服务端依据登录身份判定。</p>
      </section>

      <el-alert
        v-if="echoMismatch"
        class="echo-alert"
        data-testid="stat-dimension-echo"
        type="warning"
        show-icon
        :closable="false"
        title="服务端返回的维度与所选维度不一致"
      >
        <template #default>
          <p>
            所选维度为「{{ dimensionLabel(requestedDimension) }}」，服务端实际按「{{
              dimensionLabel(data?.dimension ?? "")
            }}」统计。后端对无法识别的维度会回退到学院，请核对后重新选择维度。
          </p>
        </template>
      </el-alert>

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载政治身份分布…</span>
      </div>

      <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="stat-error">
        <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>统计数据暂时无法加载</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain data-testid="stat-retry" @click="retry">
          <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
        </el-button>
      </div>

      <section v-else-if="groups.length === 0" class="state-card content-card" data-testid="stat-empty">
        <el-empty description="当前范围内暂无分组数据" :image-size="72">
          <template #default>
            <p class="empty-hint">服务端返回 0 个分组。可能是范围内还没有成员，或成员未填写该维度字段。</p>
            <el-button type="primary" plain @click="retry">重新加载</el-button>
          </template>
        </el-empty>
      </section>

      <section v-else class="surface content-card" aria-labelledby="stat-table-title" data-testid="stat-panel">
        <div class="section-heading">
          <div>
            <span class="section-index">DISTRIBUTION</span>
            <h2 id="stat-table-title">按{{ dimensionLabel(data?.dimension ?? "") }}分组</h2>
          </div>
          <p>共 {{ groups.length }} 个分组 · {{ scopeLabel }}范围，分组顺序沿用服务端返回顺序。</p>
        </div>

        <div class="table-wrap">
          <el-table :data="groups" class="stat-table" data-testid="stat-table" border stripe size="default">
            <el-table-column prop="key" label="分组" min-width="180" show-overflow-tooltip fixed>
              <template #default="{ row }">
                <span class="group-key">{{ row.key }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="total" label="总人数" min-width="96" align="right">
              <template #default="{ row }">
                <strong class="group-total">{{ row.total }}</strong>
              </template>
            </el-table-column>
            <el-table-column
              v-for="column in identityColumns"
              :key="column.key"
              :label="column.label"
              min-width="110"
              align="right"
            >
              <template #default="{ row }">
                <span class="identity-count">{{ countOf(row, column.key) ?? "—" }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="caliber-note" data-testid="stat-caliber">
          <h3>统计口径说明</h3>
          <ul>
            <li>
              总人数是该分组的<strong>全部成员数</strong>，包含政治身份未登记的成员；身份列只列身份字典中的项，
              因此各身份人数之和<strong>可能小于总人数</strong>。页面不修改总人数、不补齐差额、不虚构身份项。
            </li>
            <li>统计<strong>未按成员启用/停用状态过滤</strong>，停用成员同样计入，因此总人数不等于「启用成员数」。</li>
            <li>
              {{
                scopeLabel
              }}范围由服务端按登录身份判定：超级管理员为全院，党支部书记为本人所属支部；页面不发送范围参数。
            </li>
            <li>身份列按服务端返回的身份名称动态生成；某分组响应中缺少某个身份时显示「—」，与人数为 0 区分开。</li>
          </ul>
        </div>
      </section>
    </template>
  </main>
</template>

<style lang="scss" scoped>
.statistics-page {
  padding-top: 24px;
  padding-bottom: 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    color: var(--party-red);
    font-weight: 600;
  }

  h1 {
    font-size: 26px;
    color: var(--text-primary);
    margin: 6px 0 8px;
  }

  p {
    font-size: 13px;
    color: var(--text-regular);
    line-height: 1.7;
    max-width: 640px;
  }

  .scope-tag {
    flex: 0 0 auto;
  }
}

.surface {
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  min-width: 0;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .toolbar-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dimension-switch {
    min-width: 0;
    flex-wrap: wrap;
  }

  .toolbar-hint {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.7;
  }
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);

  h2 {
    font-size: 17px;
    color: var(--text-primary);
    margin-top: 4px;
  }

  p {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 460px;
  }

  .section-index {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--party-red);
    font-weight: 600;
  }
}

.table-wrap {
  min-width: 0;
  width: 100%;
}

.dashboard-table-wrap {
  margin-top: 12px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  min-width: 0;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-radius: var(--radius-base);
  background: var(--party-red-bg);
  min-width: 0;
  overflow-wrap: anywhere;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 26px;
  line-height: 1.2;
  color: var(--party-red);
  font-variant-numeric: tabular-nums;
}

.metric-value-muted {
  font-size: 18px;
  color: var(--text-secondary);
}

.metric-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.metric-sub {
  font-size: 12px;
  color: var(--text-regular);
}

.metric-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.stat-table {
  width: 100%;
}

.group-key {
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.group-total {
  color: var(--party-red);
}

.identity-count {
  font-variant-numeric: tabular-nums;
}

.caliber-note {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: var(--radius-base);
  background: var(--party-red-bg);
  min-width: 0;

  h3 {
    font-size: 13px;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 18px;
    list-style: disc;
  }

  li {
    font-size: 12px;
    color: var(--text-regular);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  strong {
    color: var(--party-red-dark, var(--party-red));
  }
}

.state-card {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 24px;
  border-radius: var(--radius-lg);
  min-width: 0;

  .state-icon {
    font-size: 26px;
  }

  .error-icon {
    color: var(--party-red);
  }

  .state-copy {
    flex: 1 1 260px;
    min-width: 0;

    h3 {
      font-size: 15px;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    p {
      font-size: 13px;
      color: var(--text-regular);
      overflow-wrap: anywhere;
    }
  }

  .state-caption {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .empty-hint {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.7;
    max-width: 420px;
    margin: 0 auto 12px;
  }
}

@media (max-width: 768px) {
  .statistics-page {
    padding-top: 16px;
  }

  .surface {
    padding: 18px 16px;
  }

  .page-heading h1 {
    font-size: 22px;
  }

  .metric-value {
    font-size: 22px;
  }
}
</style>
