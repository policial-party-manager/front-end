<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAppStore } from "@/stores/app";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import {
  pageIdentities,
  pageIdentityMembers,
  type IdentityMemberFilters,
  type IdentityOption,
  type UserVo,
} from "@/api/members";

/**
 * 管理侧党员发展：成员培养档案列表（`/development`）。
 *
 * 数据来源只有两个只读端点，超管与支委同构：
 * - `GET /v4/members/page`：范围由服务端 `BranchScopeService` 裁决（超管全院、支委本支部），
 *   前端不发送 `branchId`，也不调用任何 `/v4/admin/**` 接口。
 * - `GET /v2/content/identities/page`：政治身份字典，仅用于名称映射。
 *
 * 两条契约限制直接决定了界面：
 * - `status` 缺省等于「仅启用」（`eq(status, 1)`），无法表达「全部状态」，
 *   因此界面只提供启用/停用两项，且**永远显式**发送 `1` 或 `2`。
 * - 后端 `filterDetailIds` 在关键词命中 `tb_user.username` 时只按支部额外校验一次，
 *   不再叠加 `identityId` 等条件，所以关键词与政治身份不能组合；
 *   界面互斥禁用，组合提交直接拦截且不发请求。
 */
const store = useAppStore();
const router = useRouter();

/** 与路由 meta.roles 一致：超管与支委共用同一套管理侧页面。 */
const ALLOWED_ROLES: readonly string[] = ["super_admin", "party_secretary"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);

const PAGE_SIZE = 10;
/** 身份字典最多翻 20 页 × 100 条；超过时明确降级为「身份 #编号」。 */
const IDENTITY_MAX_PAGES = 20;

const rows = ref<UserVo[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const loadError = ref("");

/** 界面输入；只有点「搜索」或切换状态才会写进 `applied`。 */
const filters = reactive<{ keyword: string; identityId: number | null }>({ keyword: "", identityId: null });
const statusChoice = ref<"enabled" | "disabled">("enabled");
/** 已应用的查询条件：重试与翻页只用这份快照，不读未提交的输入。 */
const applied = ref<{ keyword?: string; identityId?: number; status: 1 | 2 }>({ status: 1 });

const identities = ref<IdentityOption[]>([]);
const identityState = ref<"loading" | "ready" | "error">("loading");
const identityTruncated = ref(false);

/** 关键词非空时禁用身份选择，反之亦然；互斥逻辑同时约束界面与提交。 */
const keywordActive = computed(() => filters.keyword.trim().length > 0);

function branchLabel(value: Pick<UserVo, "branchId" | "branchName">): string {
  if (value.branchId == null) return "未分配";
  return value.branchName?.trim() || `支部名称不可用（编号 ${value.branchId}）`;
}

function identityLabel(value: Pick<UserVo, "identityId" | "identityName">): string {
  if (value.identityId == null) return "未登记";
  return (
    value.identityName?.trim() ||
    identities.value.find((item) => item.id === value.identityId)?.identityName ||
    `身份 #${value.identityId}`
  );
}

function memberName(value: UserVo): string {
  return value.realName?.trim() || value.username?.trim() || "未登记姓名";
}

function statusLabel(status: number | null | undefined): string {
  if (status === 1) return "启用";
  if (status === 2) return "停用";
  return status == null ? "状态未标注" : `未知状态（${status}）`;
}

// ============ 请求隔离：请求序号 + 会话快照 ============
let disposed = false;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;
let identitySequence = 0;

/** 传给 `/v4/members/page` 的参数：只含分页与已应用条件。 */
interface ProfileListQuery extends IdentityMemberFilters {
  page: number;
  size: number;
  keyword?: string;
}

async function loadMembers(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = "";
  // 先清空旧结果：换条件或失败时不能把上一批数据当成当前条件的结果。
  rows.value = [];
  const query: ProfileListQuery = { page: page.value, size: PAGE_SIZE, status: applied.value.status };
  // 空条件不上送，避免把「空字符串关键词」当成一次真实过滤。
  if (applied.value.keyword) query.keyword = applied.value.keyword;
  if (applied.value.identityId != null) query.identityId = applied.value.identityId;
  try {
    const result = await pageIdentityMembers(query);
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = Array.isArray(result.records) ? result.records : [];
    // total 一律取服务端值，不用当前页行数推断。
    total.value = Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : 0;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = [];
    total.value = 0;
    loadError.value = getApiErrorMessage(error, "暂时无法加载成员列表");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

async function loadIdentities(): Promise<void> {
  if (!canView.value || disposed) return;
  const snapshot = captureSessionIdentity();
  const sequence = ++identitySequence;
  identityState.value = "loading";
  try {
    const values: IdentityOption[] = [];
    let truncated = false;
    for (let next = 1; next <= IDENTITY_MAX_PAGES; next++) {
      const result = await pageIdentities(next, 100);
      if (sequence !== identitySequence || !sessionOk(snapshot)) return;
      if (!Array.isArray(result.records) || !Number.isSafeInteger(result.total) || result.total < 0)
        throw new Error("身份字典响应异常");
      values.push(...result.records);
      if (!result.records.length) break;
      if (values.length >= result.total) break;
      if (next === IDENTITY_MAX_PAGES) truncated = true;
    }
    identities.value = values;
    identityTruncated.value = truncated;
    identityState.value = "ready";
  } catch {
    if (sequence === identitySequence && sessionOk(snapshot)) {
      // 字典只影响名称映射：失败时列表仍可用，身份列降级为「身份 #编号」。
      identities.value = [];
      identityTruncated.value = false;
      identityState.value = "error";
    }
  }
}

/** 清空上一会话的可见结果与筛选状态；旧响应因序号变化不再写回。 */
function invalidate(): void {
  requestSequence++;
  identitySequence++;
  rows.value = [];
  total.value = 0;
  page.value = 1;
  loading.value = false;
  loadError.value = "";
  identities.value = [];
  identityState.value = "loading";
  identityTruncated.value = false;
  filters.keyword = "";
  filters.identityId = null;
  statusChoice.value = "enabled";
  applied.value = { status: 1 };
}

function search(): void {
  if (!canView.value) return;
  const keyword = filters.keyword.trim();
  if (keyword && filters.identityId != null) {
    // 后端用户名命中会绕过身份过滤，组合查询会返回不符合条件的成员，因此不发请求。
    ElMessage.warning("关键词与政治身份暂不支持组合查询，请清空其中一项后搜索；已应用条件未改变。");
    return;
  }
  applied.value = {
    keyword: keyword || undefined,
    identityId: filters.identityId ?? undefined,
    status: statusChoice.value === "disabled" ? 2 : 1,
  };
  page.value = 1;
  void loadMembers();
}

function changeStatus(): void {
  if (!canView.value) return;
  // 状态切换立即生效，但只用已应用的其它条件，不带上未提交的关键词输入。
  applied.value = { ...applied.value, status: statusChoice.value === "disabled" ? 2 : 1 };
  page.value = 1;
  void loadMembers();
}

function resetFilters(): void {
  filters.keyword = "";
  filters.identityId = null;
  statusChoice.value = "enabled";
  applied.value = { status: 1 };
  page.value = 1;
  void loadMembers();
}

function changePage(value: number): void {
  page.value = value;
  void loadMembers();
}

function retry(): void {
  void loadMembers();
}

function openProfile(row: UserVo): void {
  void router.push(`/development/member/${row.id}`);
}

onMounted(() => {
  if (!canView.value) return;
  void loadMembers();
  void loadIdentities();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或角色变化：丢弃旧会话的数据与在途响应，再按新会话重新拉取。
  invalidate();
  if (canView.value) {
    void loadMembers();
    void loadIdentities();
  }
});

onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});
</script>

<template>
  <main class="dev-list page-container" data-testid="dev-list">
    <header class="page-heading">
      <div>
        <span class="eyebrow">DEVELOPMENT / 党员发展</span>
        <h1>成员培养档案</h1>
        <p>
          按关键词或政治身份查找成员，进入其电子培养档案查看培养过程记录。成员范围由服务端按登录身份判定：超级管理员为全院，党支部书记为本支部。
        </p>
      </div>
      <el-tag class="scope-tag" effect="plain" type="danger">管理侧 · 只读</el-tag>
    </header>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="dev-list-no-token"
      title="党员发展档案需要登录"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实成员数据。请使用管理员或支部书记账号登录后再访问。</p>
      </template>
    </el-alert>

    <template v-else-if="canView">
      <section class="surface content-card toolbar" aria-label="成员筛选">
        <div class="toolbar-row">
          <el-input
            v-model="filters.keyword"
            class="keyword-input"
            data-testid="dev-list-keyword"
            :disabled="filters.identityId != null"
            placeholder="姓名 / 学号 / 用户名"
            aria-label="关键词"
            @keyup.enter="search"
          />
          <el-select
            v-model="filters.identityId"
            class="identity-select"
            data-testid="dev-list-identity"
            :disabled="keywordActive || identityState !== 'ready'"
            placeholder="政治身份"
            aria-label="政治身份"
          >
            <el-option v-for="item in identities" :key="item.id" :label="item.identityName" :value="item.id" />
          </el-select>
          <el-radio-group
            v-model="statusChoice"
            data-testid="dev-list-status"
            aria-label="成员状态"
            @change="changeStatus"
          >
            <el-radio-button value="enabled">启用</el-radio-button>
            <el-radio-button value="disabled">停用</el-radio-button>
          </el-radio-group>
          <el-button type="primary" data-testid="dev-list-search" @click="search">搜索</el-button>
          <el-button data-testid="dev-list-reset" @click="resetFilters">重置筛选</el-button>
        </div>
        <p class="toolbar-hint">
          关键词与政治身份互斥：后端在关键词命中用户名时不再叠加身份条件，组合查询会返回不符合条件的成员，因此任一条件有值时另一项不可用。默认只查询启用成员；选择「停用」才会显式查询停用成员，不提供「全部状态」。
        </p>
        <p v-if="identityState === 'error'" class="toolbar-hint" data-testid="dev-list-identity-error">
          政治身份字典加载失败，身份列将按编号显示，成员列表仍可使用；重试请刷新页面。
        </p>
        <p v-else-if="identityTruncated" class="toolbar-hint" data-testid="dev-list-identity-truncated">
          身份字典超过 {{ IDENTITY_MAX_PAGES * 100 }} 条，仅加载了前
          {{ IDENTITY_MAX_PAGES * 100 }} 条；未覆盖到的成员将按「身份 #编号」显示。
        </p>
      </section>

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载成员列表…</span>
      </div>

      <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="dev-list-error">
        <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>成员列表暂时无法加载</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain data-testid="dev-list-retry" @click="retry">
          <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
        </el-button>
      </div>

      <el-empty
        v-else-if="rows.length === 0"
        class="state-card content-card"
        data-testid="dev-list-empty"
        description="暂无符合条件的成员"
        :image-size="72"
      />

      <section v-else class="surface content-card" aria-labelledby="dev-list-title" data-testid="dev-list-table">
        <div class="section-heading">
          <div>
            <span class="section-index">MEMBERS</span>
            <h2 id="dev-list-title">成员名单</h2>
          </div>
          <p>每行可进入只读培养档案；档案内的写操作尚未开放。</p>
        </div>
        <ul class="member-rows">
          <li v-for="row in rows" :key="row.id" class="member-row" :data-testid="`dev-list-row-${row.id}`">
            <div class="row-main">
              <div class="row-line">
                <span class="row-title">{{ memberName(row) }}</span>
                <el-tag :type="row.status === 2 ? 'info' : 'success'" size="small" effect="plain">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </div>
              <span class="row-meta">学号 {{ row.studentId?.trim() || "未登记" }}</span>
              <span class="row-meta">政治身份 {{ identityLabel(row) }}</span>
              <span class="row-meta">所属支部 {{ branchLabel(row) }}</span>
            </div>
            <el-button
              type="primary"
              plain
              size="small"
              :data-testid="`dev-list-open-${row.id}`"
              @click="openProfile(row)"
            >
              查看培养档案
            </el-button>
          </li>
        </ul>
        <el-pagination
          class="pager"
          :current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="changePage"
        />
      </section>
    </template>
  </main>
</template>

<style lang="scss" scoped>
.dev-list {
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
    max-width: 680px;
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

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  .keyword-input {
    width: 220px;
    max-width: 100%;
  }

  .identity-select {
    width: 180px;
    max-width: 100%;
  }
}

.toolbar-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
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

.state-card {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 24px;
  border-radius: var(--radius-lg);

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
}

.member-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  padding: 12px 14px;
  min-width: 0;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.row-meta {
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.pager {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .dev-list {
    padding-top: 16px;
  }

  .surface {
    padding: 18px 16px;
  }

  .page-heading h1 {
    font-size: 22px;
  }

  .toolbar-row {
    .keyword-input,
    .identity-select {
      width: 100%;
    }
  }
}
</style>
