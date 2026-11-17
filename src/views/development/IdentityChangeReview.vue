<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
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
  getIdentityChange,
  IDENTITY_REVIEW_REMARK_MAX,
  pageManagedIdentityChanges,
  reviewIdentityChange,
  type IdentityChangeQuery,
  type IdentityChangeStatus,
  type IdentityChangeVo,
} from "@/api/identity-changes";
import { formatOptionalText, formatRecordTime } from "@/views/activity/participationDisplay";
import { identityChangeStatusLabel, identityChangeTagType, relationLabel } from "./myDevelopmentDisplay";

/**
 * 身份变更审批（`/development/identity-changes`）。
 *
 * 超管与支委都能进，但能力按后端契约严格区分：
 * - 超管：`pageForAdmin`，`status` 与 `userId` 两个过滤都生效 → 页面提供三态筛选与按成员编号精确过滤，
 *   并且只有超管渲染「通过 / 驳回」（后端审批端点 `hasRole('SUPER_ADMIN')`）。
 * - 支委：`pageForBranch`，**两个过滤参数被服务端直接丢弃** → 页面不发送这两个参数、不渲染这两个控件，
 *   并在界面上写明「固定展示本支部全部变更单，不支持筛选」。
 *   发送了却无效比不发送更误导，所以这里选择隐藏而不是发送后提示已忽略。
 *
 * 两条红线写死在实现里：
 * - 审批通过只写回身份列，**不联动登录角色**：成功后不修改 `store.currentRole`、不动导航。
 * - 列表数据一律来自重新请求，审批成功后只重拉当前页，不改写本地行的 `status` 伪造已生效。
 *
 * 越权读单与真正不存在同为服务端「变更单不存在」，页面原样转达，不改写成「无权限」。
 */
const store = useAppStore();
const router = useRouter();

/** 与路由 meta.roles 一致。 */
const ALLOWED_ROLES: readonly string[] = ["super_admin", "party_secretary"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);
/** 审批端点仅 `SUPER_ADMIN`：支委能看列表，但没有审批按钮。 */
const canReview = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);

const PAGE_SIZE = 10;

/** 三态取值集中一处：既给筛选项，也给「是否待审批」的判断。 */
const STATUS_VALUES: IdentityChangeStatus[] = [1, 2, 3];
const STATUS_PENDING: IdentityChangeStatus = 1;
/** 三态筛选项的文案直接取自共享映射，避免在页面里再手写一份「待审批/已生效/驳回」。 */
const STATUS_OPTIONS = STATUS_VALUES.map((value) => ({ value, label: identityChangeStatusLabel(value) }));

/** 页头标签：只描述真实角色，不把非超管一律叫作支部书记。 */
const roleLabel = computed(() => {
  if (!sessionHasAccessToken.value) return "开发预览 · 无登录令牌";
  if (canReview.value) return "超级管理员 · 可审批";
  if (store.currentRole === "party_secretary") return "支部书记 · 本支部只读";
  return "当前角色无审批权限";
});

/** 状态筛选：超管可选三态，默认待审批；支委不传该参数。 */
const statusFilter = ref<IdentityChangeStatus | null>(1);
/** 已应用的筛选快照：重试与翻页只用这份，不读尚未提交的输入。 */
const applied = ref<{ status: IdentityChangeStatus | null; userId: number | null }>({ status: 1, userId: null });
/** 成员编号输入（超管专用，后端只支持精确 `userId`，没有姓名模糊搜索）。 */
const userIdInput = ref("");

const rows = ref<IdentityChangeVo[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const loadError = ref("");

let disposed = false;
let requestSequence = 0;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

function memberName(row: IdentityChangeVo): string {
  return (row.userName ?? "").trim() || `成员 #${relationLabel(row.userId)}`;
}

/** 原身份：空 = 首次登记，显示「未登记」而不是 null。 */
function fromIdentityText(row: IdentityChangeVo): string {
  const name = (row.fromIdentityName ?? "").trim();
  if (name) return name;
  return row.fromIdentity == null ? "未登记" : `身份 #${relationLabel(row.fromIdentity)}`;
}

function toIdentityText(row: IdentityChangeVo): string {
  const name = (row.toIdentityName ?? "").trim();
  if (name) return name;
  return row.toIdentity == null ? "身份不可用" : `身份 #${relationLabel(row.toIdentity)}`;
}

/** 只有服务端明确的待审批才可操作，未知状态一律不可审。 */
function isPending(row: IdentityChangeVo): boolean {
  return row.status === STATUS_PENDING;
}

async function loadRows(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = "";
  // 先清空旧结果：切筛选或翻页时不能把上一批数据当成当前条件的结果。
  rows.value = [];
  const query: IdentityChangeQuery = { page: page.value, size: PAGE_SIZE };
  // 支委侧后端会丢弃这两个参数，因此只有超管才发送，界面与请求保持一致。
  if (canReview.value) {
    if (applied.value.status != null) query.status = applied.value.status;
    if (applied.value.userId != null) query.userId = applied.value.userId;
  }
  try {
    const result = await pageManagedIdentityChanges(query);
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = Array.isArray(result?.records) ? result.records : [];
    // total 一律取服务端值，不用当前页行数推断。
    total.value = Number.isSafeInteger(result?.total) && result.total >= 0 ? result.total : 0;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = [];
    total.value = 0;
    // 支委不属于任何支部时服务端回「您未管理任何支部（不是任何支部的秘书）」，原样展示。
    loadError.value = getApiErrorMessage(error, "暂时无法加载身份变更单");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

function retry(): void {
  void loadRows();
}

function search(): void {
  if (!canView.value) return;
  const raw = userIdInput.value.trim();
  let nextUserId: number | null = null;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      ElMessage.warning("成员编号必须是正整数；后端只支持按成员编号精确过滤，不支持按姓名模糊搜索");
      return;
    }
    nextUserId = parsed;
  }
  applied.value = {
    status: canReview.value ? statusFilter.value : null,
    userId: canReview.value ? nextUserId : null,
  };
  page.value = 1;
  void loadRows();
}

function changeStatus(value: IdentityChangeStatus): void {
  // 状态切换立即生效，并使用界面上当前可见的成员编号，避免输入框与请求不一致。
  statusFilter.value = value;
  search();
}

/** el-radio-group 的 change 参数是宽松类型，这里收窄成三态枚举再交给业务逻辑。 */
function onStatusChange(value: string | number | boolean | undefined): void {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!STATUS_VALUES.includes(parsed as IdentityChangeStatus)) return;
  changeStatus(parsed as IdentityChangeStatus);
}

function resetFilters(): void {
  statusFilter.value = 1;
  userIdInput.value = "";
  applied.value = { status: canReview.value ? 1 : null, userId: null };
  page.value = 1;
  void loadRows();
}

function changePage(value: number): void {
  page.value = value;
  void loadRows();
}

// ============ 审批（超管） ============
/** 审批中的单据编号；同步置位，双击只发一次请求。 */
const reviewingId = ref<number | null>(null);
/** 审批失败原文按单据保留，不弹在全局提示里被关掉就找不回。 */
const reviewErrors = reactive<Record<number, string>>({});
const remarkDrafts = reactive<Record<number, string>>({});
/** 审批意见的长度校验错误（字段级），与接口错误 `reviewErrors` 分开。 */
const remarkFieldErrors = reactive<Record<number, string>>({});
/** 展开审批表单的单据编号。 */
const activeId = ref<number | null>(null);
const activePass = ref<boolean>(true);

function openReview(row: IdentityChangeVo, pass: boolean): void {
  if (!canReview.value || !isPending(row) || reviewingId.value != null) return;
  activeId.value = row.id;
  activePass.value = pass;
  delete reviewErrors[row.id];
  delete remarkFieldErrors[row.id];
}

function cancelReview(): void {
  if (reviewingId.value != null) return;
  activeId.value = null;
}

/** 意见超长时给出字段级提示并聚焦到输入框，而不是只在顶部报警。 */
function remarkTooLong(id: number): boolean {
  const length = (remarkDrafts[id] ?? "").trim().length;
  if (length <= IDENTITY_REVIEW_REMARK_MAX) {
    delete remarkFieldErrors[id];
    return false;
  }
  remarkFieldErrors[id] = `审批意见不能超过 ${IDENTITY_REVIEW_REMARK_MAX} 字，当前 ${length} 字`;
  void nextTick(() => {
    const field = document.querySelector<HTMLTextAreaElement>(`[data-testid="identity-review-remark-${id}"]`);
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  });
  return true;
}

async function confirmReview(row: IdentityChangeVo): Promise<void> {
  // 同步置位后再进入异步流程，双击不会产生第二次审批请求。
  if (reviewingId.value != null || !canReview.value || !isPending(row)) return;
  if (remarkTooLong(row.id)) return;
  const remark = (remarkDrafts[row.id] ?? "").trim();
  const id = row.id;
  reviewingId.value = id;
  delete reviewErrors[id];
  const snapshot = captureSessionIdentity();
  try {
    await reviewIdentityChange(id, { pass: activePass.value, remark });
    if (!sessionOk(snapshot)) return;
    ElMessage.success(activePass.value ? "审批通过，身份已按变更单生效" : "已驳回，该成员身份保持不变");
    activeId.value = null;
    delete remarkDrafts[id];
    delete remarkFieldErrors[id];
    // 只重拉当前页：筛选与页码保持不变，行内容全部来自服务端的新响应。
    void loadRows();
  } catch (error) {
    if (!sessionOk(snapshot)) return;
    reviewErrors[id] = getApiErrorMessage(error, "审批失败，请稍后重试");
  } finally {
    reviewingId.value = null;
  }
}

// ============ 单据详情（越权与不存在同为「变更单不存在」） ============
const detail = ref<IdentityChangeVo | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
let detailSequence = 0;

async function openDetail(row: IdentityChangeVo): Promise<void> {
  if (!canView.value) return;
  const sequence = ++detailSequence;
  const snapshot = captureSessionIdentity();
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  try {
    const result = await getIdentityChange(row.id);
    if (sequence !== detailSequence || !sessionOk(snapshot)) return;
    detail.value = result;
  } catch (error) {
    if (sequence !== detailSequence || !sessionOk(snapshot)) return;
    detailError.value = getApiErrorMessage(error, "暂时无法加载变更单详情");
  } finally {
    if (sequence === detailSequence && isSessionIdentityCurrent(snapshot)) detailLoading.value = false;
  }
}

function closeDetail(): void {
  detailSequence++;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = false;
}

/** 清空上一会话的可见结果与筛选，旧响应因序号变化不再写回。 */
function invalidate(): void {
  requestSequence++;
  detailSequence++;
  rows.value = [];
  total.value = 0;
  page.value = 1;
  loading.value = false;
  loadError.value = "";
  statusFilter.value = 1;
  userIdInput.value = "";
  applied.value = { status: canReview.value ? 1 : null, userId: null };
  activeId.value = null;
  reviewingId.value = null;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = false;
  Object.keys(reviewErrors).forEach((key) => delete reviewErrors[Number(key)]);
  Object.keys(remarkDrafts).forEach((key) => delete remarkDrafts[Number(key)]);
}

onMounted(() => {
  if (!canView.value) return;
  void loadRows();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或角色变化：丢弃旧会话的数据与在途响应，再按新会话重新拉取。
  invalidate();
  if (canView.value) void loadRows();
});

onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});
</script>

<template>
  <main class="identity-review page-container" data-testid="identity-review">
    <header class="page-heading">
      <div class="heading-main">
        <button class="back-link" type="button" data-testid="identity-review-back" @click="router.push('/development')">
          ← 返回成员列表
        </button>
        <h1>身份变更审批</h1>
        <p>
          身份的两次流转：支委或超管在成员档案页发起变更单，超级管理员在此审批；审批通过才写回政治身份。
          <strong>身份变更不联动系统角色、菜单与权限</strong>，生效后登录角色仍是原角色。
        </p>
      </div>
      <el-tag class="scope-tag" effect="plain" type="danger">
        {{ roleLabel }}
      </el-tag>
    </header>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="identity-review-no-token"
      title="身份变更审批需要登录"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实变更单。请使用管理员或支部书记账号登录后再访问。</p>
      </template>
    </el-alert>

    <el-alert
      v-else-if="!canView"
      data-testid="identity-review-no-permission"
      title="当前身份无权查看身份变更审批"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>身份变更审批仅面向超级管理员与党支部书记；普通成员请在「我的培养」查看本人档案。</p>
      </template>
    </el-alert>

    <template v-else-if="canView">
      <section class="surface content-card toolbar" aria-label="变更单筛选">
        <div v-if="canReview" class="toolbar-row">
          <el-radio-group
            :model-value="statusFilter"
            data-testid="identity-review-status"
            aria-label="变更单状态"
            @change="onStatusChange"
          >
            <el-radio-button v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
          <el-input
            v-model="userIdInput"
            class="user-input"
            data-testid="identity-review-user"
            placeholder="成员编号（精确）"
            aria-label="成员编号"
            clearable
            @keyup.enter="search"
          />
          <el-button type="primary" data-testid="identity-review-search" @click="search">查询</el-button>
          <el-button data-testid="identity-review-reset" @click="resetFilters">重置筛选</el-button>
        </div>
        <p v-if="canReview" class="toolbar-hint" data-testid="identity-review-admin-hint">
          默认展示待审批的变更单。成员过滤只支持按成员编号精确匹配——后端
          <code>managed/page</code> 只有 <code>userId</code> 参数，<strong>不支持按姓名模糊搜索</strong>。
        </p>
        <p v-else class="toolbar-hint" data-testid="identity-review-branch-hint">
          支部书记视图固定展示本支部全部变更单，不支持按状态或成员筛选：后端
          <code>pageForBranch</code> 会忽略 <code>status</code> 与 <code>userId</code>
          参数，因此本页不发送这两个参数、也不提供对应控件。审批只能由超级管理员执行。
        </p>
      </section>

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载身份变更单…</span>
      </div>

      <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="identity-review-error">
        <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>变更单暂时无法加载</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain data-testid="identity-review-retry" @click="retry">
          <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
        </el-button>
      </div>

      <el-empty
        v-else-if="rows.length === 0"
        class="state-card content-card"
        data-testid="identity-review-empty"
        description="暂无符合条件的身份变更单"
        :image-size="72"
      />

      <section v-else class="surface content-card" aria-labelledby="identity-review-list-title">
        <div class="section-heading">
          <div>
            <span class="section-index">IDENTITY CHANGES</span>
            <h2 id="identity-review-list-title">变更单列表</h2>
          </div>
          <p>列表数据全部来自服务端响应，审批后重新请求当前页，不在本地改写状态。</p>
        </div>
        <ul class="change-rows" data-testid="identity-review-table">
          <li v-for="row in rows" :key="row.id" class="change-row" :data-testid="`identity-review-row-${row.id}`">
            <div class="row-main">
              <div class="row-line">
                <span class="row-title">{{ memberName(row) }}</span>
                <el-tag :type="identityChangeTagType(row.status)" size="small" effect="plain">
                  {{ identityChangeStatusLabel(row.status) }}
                </el-tag>
              </div>
              <span class="row-shift">
                {{ fromIdentityText(row) }}
                <span class="shift-arrow" aria-hidden="true">→</span>
                {{ toIdentityText(row) }}
              </span>
              <span class="row-meta">成员编号 {{ relationLabel(row.userId) }}</span>
              <span class="row-meta">发起人 {{ (row.operatorName ?? "").trim() || "未登记姓名" }}</span>
              <span class="row-meta">发起时间 {{ formatRecordTime(row.createTime) }}</span>
              <p class="row-text">变更原因：{{ formatOptionalText(row.reason) }}</p>
              <p v-if="(row.reviewRemark ?? '').trim()" class="row-text">审批意见：{{ row.reviewRemark }}</p>
              <span v-if="row.reviewTime" class="row-meta">
                审批人 {{ (row.reviewerName ?? "").trim() || "未登记姓名" }} · {{ formatRecordTime(row.reviewTime) }}
              </span>

              <div v-if="activeId === row.id" class="review-form" data-testid="identity-review-form">
                <p class="review-title">
                  {{
                    activePass
                      ? "确认通过该变更单？通过后立即写回该成员政治身份。"
                      : "确认驳回该变更单？驳回后成员身份保持不变。"
                  }}
                </p>
                <el-input
                  v-model="remarkDrafts[row.id]"
                  class="remark-input"
                  type="textarea"
                  :rows="2"
                  :maxlength="IDENTITY_REVIEW_REMARK_MAX"
                  show-word-limit
                  :disabled="reviewingId === row.id"
                  :data-testid="`identity-review-remark-${row.id}`"
                  placeholder="审批意见（可不填，最多 50 字）"
                  @input="remarkTooLong(row.id)"
                />
                <p
                  v-if="remarkFieldErrors[row.id]"
                  class="field-error"
                  role="alert"
                  :data-testid="`identity-review-remark-error-${row.id}`"
                >
                  {{ remarkFieldErrors[row.id] }}
                </p>
                <div class="review-actions">
                  <el-button
                    size="small"
                    :disabled="reviewingId === row.id"
                    :data-testid="`identity-review-cancel-${row.id}`"
                    @click="cancelReview"
                  >
                    取消
                  </el-button>
                  <el-button
                    size="small"
                    :type="activePass ? 'primary' : 'danger'"
                    :loading="reviewingId === row.id"
                    :disabled="reviewingId === row.id"
                    :data-testid="`identity-review-confirm-${row.id}`"
                    @click="confirmReview(row)"
                  >
                    {{ activePass ? "确认通过" : "确认驳回" }}
                  </el-button>
                </div>
              </div>

              <el-alert
                v-if="reviewErrors[row.id]"
                data-testid="identity-review-review-error"
                type="error"
                :closable="false"
                show-icon
                :title="reviewErrors[row.id]"
              />
            </div>

            <div class="row-actions">
              <el-button size="small" plain :data-testid="`identity-review-detail-${row.id}`" @click="openDetail(row)">
                查看详情
              </el-button>
              <template v-if="canReview">
                <el-button
                  size="small"
                  type="primary"
                  :disabled="!isPending(row) || reviewingId != null"
                  :data-testid="`identity-review-pass-${row.id}`"
                  @click="openReview(row, true)"
                >
                  通过
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="!isPending(row) || reviewingId != null"
                  :data-testid="`identity-review-reject-${row.id}`"
                  @click="openReview(row, false)"
                >
                  驳回
                </el-button>
              </template>
            </div>
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

    <el-dialog
      :model-value="detailLoading || !!detail || !!detailError"
      title="变更单详情"
      width="min(520px, 92vw)"
      append-to-body
      data-testid="identity-review-detail-dialog"
      @update:model-value="closeDetail"
    >
      <div v-if="detailLoading" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载变更单详情…</span>
      </div>
      <el-alert
        v-else-if="detailError"
        data-testid="identity-review-detail-error"
        type="error"
        :closable="false"
        show-icon
        :title="detailError"
      />
      <dl v-else-if="detail" class="detail-grid" data-testid="identity-review-detail-body">
        <div>
          <dt>成员</dt>
          <dd>{{ memberName(detail) }}（编号 {{ relationLabel(detail.userId) }}）</dd>
        </div>
        <div>
          <dt>身份变更</dt>
          <dd>{{ fromIdentityText(detail) }} → {{ toIdentityText(detail) }}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>
            <el-tag :type="identityChangeTagType(detail.status)" size="small" effect="plain">
              {{ identityChangeStatusLabel(detail.status) }}
            </el-tag>
          </dd>
        </div>
        <div>
          <dt>发起人</dt>
          <dd>{{ (detail.operatorName ?? "").trim() || "未登记姓名" }}</dd>
        </div>
        <div>
          <dt>发起时间</dt>
          <dd>{{ formatRecordTime(detail.createTime) }}</dd>
        </div>
        <div>
          <dt>变更原因</dt>
          <dd>{{ formatOptionalText(detail.reason) }}</dd>
        </div>
        <div>
          <dt>审批人</dt>
          <dd>{{ (detail.reviewerName ?? "").trim() || "尚未审批" }}</dd>
        </div>
        <div>
          <dt>审批意见</dt>
          <dd>{{ formatOptionalText(detail.reviewRemark) }}</dd>
        </div>
      </dl>
      <template #footer>
        <el-button data-testid="identity-review-detail-close" @click="closeDetail">关闭</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style lang="scss" scoped>
.identity-review {
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

  .heading-main {
    min-width: 0;
  }

  .back-link {
    font-size: 13px;
    color: var(--party-red);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .back-link:hover {
    text-decoration: underline;
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
    max-width: 660px;
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

  .user-input {
    width: 180px;
    max-width: 100%;
  }
}

.toolbar-hint {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
  overflow-wrap: anywhere;

  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--border-light);
    font-size: 12px;
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

.change-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.change-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  padding: 14px 16px;
  min-width: 0;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 320px;
  min-width: 0;
}

.row-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.row-shift {
  font-size: 13px;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.shift-arrow {
  margin: 0 4px;
  color: var(--party-red);
}

.row-meta {
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.row-text {
  font-size: 13px;
  color: var(--text-regular);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.review-form {
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-base);
  background: var(--party-red-bg);

  .review-title {
    font-size: 13px;
    color: var(--text-primary);
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .remark-input {
    margin-bottom: 8px;
  }

  .field-error {
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--el-color-danger, #f56c6c);
  }

  .review-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;

  div {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  dt {
    flex: 0 0 76px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  dd {
    flex: 1 1 auto;
    font-size: 13px;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }
}

@media (max-width: 768px) {
  .identity-review {
    padding-top: 16px;
  }

  .surface {
    padding: 18px 16px;
  }

  .page-heading h1 {
    font-size: 22px;
  }

  .detail-grid div {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
