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
  getDistribution,
  type DistributionDimension,
  type DistributionGroup,
  type DistributionVo,
  type IdentityCount,
} from "@/api/statistics";

/**
 * 数据统计：按维度分组的政治身份分布。
 *
 * 数据来源只有 `GET /v4/statistics/distribution`，范围（全院 / 本支部）由服务端按登录态判定，
 * 页面不传任何范围参数。`total` 是该组全部成员数，包含身份未登记的人；`identities` 只列身份字典，
 * 因此各身份人数之和可能小于 `total`——页面原样展示服务端数字，不补齐、不归一化、不虚拟身份项。
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

function invalidate(): void {
  requestSequence++;
  data.value = null;
  loading.value = false;
  loadError.value = "";
}

onMounted(() => {
  if (!canView.value) return;
  void loadDistribution();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或权限变化：丢弃旧会话已渲染的数据与在途响应，再按新会话重新拉取。
  invalidate();
  if (canView.value) void loadDistribution();
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
        <h1>政治身份分布</h1>
        <p>按学院、专业、班级、年级或支部切分，查看每个分组的成员总数与各政治身份人数。</p>
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
}
</style>
