<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
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
  exportBranchMembers,
  getScopedMember,
  pageBranchMembers,
  pageIdentities,
  updateScopedContact,
  type BranchMemberFilters,
  type ContactUpdateRequest,
  type IdentityOption,
  type UserVo,
} from "@/api/members";

/**
 * 支委成员工作台（`/members/branch`）。
 *
 * 只使用 scoped 端点 `/v4/members/**`：范围由服务端按登录身份限定为本支部，
 * 页面不发送 `branchId`，也不能通过任何参数扩大范围。
 *
 * 后端 `ScopedMemberServiceImpl.buildVos` 只写 `branchId` 与 `identityId`，
 * 不查支部表与身份表，因此 `branchName`、`identityName` 恒为 null：
 * 支部名降级为「支部名称不可用（编号 x）」，身份名用一次性加载的身份字典映射。
 * `status` 缺省等于「仅启用」，查停用必须显式传 `status=2`，界面不提供「全部状态」。
 */
const store = useAppStore();

/** 与路由 meta 一致：当前只对支部书记（支委）开放。 */
const ALLOWED_ROLES: readonly string[] = ["party_secretary"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);

// ============ 列表状态 ============
const rows = ref<UserVo[]>([]);
const loading = ref(false);
const loadError = ref("");
const total = ref(0);
const page = ref(1);
const size = ref(10);
const exporting = ref(false);
const exportFailure = ref("");

const filters = reactive({ keyword: "" });
/** 界面上的状态选择；「停用」对应显式 `status=2`，「启用」不发送 status。 */
const statusChoice = ref("enabled");
/** 已应用的查询条件：列表重试与导出都只用这份快照，不读未提交的输入。 */
const applied = ref<BranchMemberFilters>({});

// ============ 身份字典（branchName / identityName 恒 null 时的降级依据） ============
const identities = ref<IdentityOption[]>([]);
const identityState = ref<"loading" | "ready" | "error">("loading");
/** 身份字典因页数上限被截断：此时部分成员只能显示「身份 #id」。 */
const identityTruncated = ref(false);

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

// ============ 请求隔离：请求序号 + 会话快照 ============
let disposed = false;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;
let identitySequence = 0;
let detailSequence = 0;
let operationSequence = 0;

async function loadMembers(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = "";
  // 先清空旧结果：失败或换条件时不能把上一批数据当成当前条件的结果。
  rows.value = [];
  try {
    const result = await pageBranchMembers({ page: page.value, size: size.value, ...applied.value });
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = Array.isArray(result.records) ? result.records : [];
    // total 一律取服务端值，不用当前页行数推断。
    total.value = Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : 0;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    rows.value = [];
    total.value = 0;
    loadError.value = getApiErrorMessage(error, "暂时无法加载本支部成员");
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
    // 身份字典只用于名称映射：最多翻 20 页，超过时明确降级为「身份 #id」而不是静默截断。
    let truncated = false;
    for (let next = 1; next <= 20; next++) {
      const result = await pageIdentities(next, 100);
      if (sequence !== identitySequence || !sessionOk(snapshot)) return;
      if (!Array.isArray(result.records) || !Number.isSafeInteger(result.total) || result.total < 0)
        throw new Error("身份字典响应异常");
      values.push(...result.records);
      if (!result.records.length) break;
      if (values.length >= result.total) break;
      if (next === 20) truncated = true;
    }
    identities.value = values;
    identityState.value = "ready";
    identityTruncated.value = truncated;
  } catch {
    if (sequence === identitySequence && sessionOk(snapshot)) {
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
  detailSequence++;
  operationSequence++;
  rows.value = [];
  total.value = 0;
  loading.value = false;
  loadError.value = "";
  identities.value = [];
  identityState.value = "loading";
  identityTruncated.value = false;
  exporting.value = false;
  exportFailure.value = "";
  detailVisible.value = false;
  detail.value = null;
  detailLoading.value = false;
  detailError.value = "";
  saving.value = false;
  originalContact.value = null;
  resetContactForm();
  // 筛选条件也回到默认：新账号的支部范围不同，沿用旧关键词与页码会直接落入空态。
  filters.keyword = "";
  statusChoice.value = "enabled";
  applied.value = {};
  page.value = 1;
}

function search(): void {
  if (!canView.value) return;
  applied.value = {
    keyword: filters.keyword.trim() || undefined,
    status: statusChoice.value === "disabled" ? 2 : undefined,
  };
  page.value = 1;
  void loadMembers();
}

function resetFilters(): void {
  filters.keyword = "";
  statusChoice.value = "enabled";
  search();
}

function changePage(value: number): void {
  page.value = value;
  void loadMembers();
}

function changeSize(value: number): void {
  size.value = value;
  page.value = 1;
  void loadMembers();
}

function retry(): void {
  void loadMembers();
}

// ============ 详情与联系方式维护 ============
const detailVisible = ref(false);
const detail = ref<UserVo | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
const saving = ref(false);
const contactFormRef = ref<FormInstance>();
const contactForm = reactive({ phone: "", email: "", remark: "" });
const originalContact = ref<{ phone: string; email: string; remark: string } | null>(null);

const contactRules: FormRules = {
  // 允许空串：后端接口的意图是「空串清空」。
  // 校验与提交必须用同一个值（都先 trim），否则「 13800138000」会校验失败而被提交却合法。
  phone: [
    {
      validator: (_rule, value, callback) =>
        /^$|^1\d{10}$/.test(typeof value === "string" ? value.trim() : "")
          ? callback()
          : callback(new Error("手机号格式不正确")),
      trigger: "blur",
    },
  ],
  email: [
    {
      validator: (_rule, value, callback) => {
        const text = typeof value === "string" ? value.trim() : "";
        if (!text) return callback();
        if (text.length > 25) return callback(new Error("邮箱长度不能超过 25"));
        // 与后端 @Email 同级别：不额外要求域名含点号，避免拒绝后端合法值。
        if (!/^[^\s@]+@[^\s@]+$/.test(text)) return callback(new Error("邮箱格式不正确"));
        return callback();
      },
      trigger: "blur",
    },
  ],
  remark: [{ max: 500, message: "备注长度不能超过 500", trigger: "blur" }],
};

function resetContactForm(): void {
  contactForm.phone = "";
  contactForm.email = "";
  contactForm.remark = "";
  contactFormRef.value?.clearValidate();
}

function fillContactForm(value: UserVo): void {
  contactForm.phone = value.phone ?? "";
  contactForm.email = value.email ?? "";
  contactForm.remark = value.remark ?? "";
  originalContact.value = { phone: contactForm.phone, email: contactForm.email, remark: contactForm.remark };
}

/** 关闭详情后使在途详情/保存回调失效，避免旧响应写回新的详情会话。 */
function onDetailClosed(): void {
  if (detailVisible.value) return;
  detailSequence++;
  detail.value = null;
  detailError.value = "";
  originalContact.value = null;
  resetContactForm();
}

async function openDetail(row: UserVo): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++detailSequence;
  const snapshot = captureSessionIdentity();
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  detailVisible.value = true;
  originalContact.value = null;
  resetContactForm();
  try {
    const value = await getScopedMember(row.id);
    if (sequence !== detailSequence || !sessionOk(snapshot)) return;
    detail.value = value;
    fillContactForm(value);
  } catch (error) {
    if (sequence !== detailSequence || !sessionOk(snapshot)) return;
    detailError.value = getApiErrorMessage(error, "暂时无法加载成员详情");
  } finally {
    if (sequence === detailSequence && isSessionIdentityCurrent(snapshot)) detailLoading.value = false;
  }
}

/** 只提交用户实际改过的字段：省略即「不动」，空串即「清空」。 */
function buildContactPayload(): ContactUpdateRequest {
  const payload: ContactUpdateRequest = {};
  const current = originalContact.value ?? { phone: "", email: "", remark: "" };
  // 比较与提交都基于 trim 后的值：未修改时不会因首尾空白被误判为变更而重写。
  const phone = contactForm.phone.trim();
  const email = contactForm.email.trim();
  if (phone !== current.phone.trim()) payload.phone = phone;
  if (email !== current.email.trim()) payload.email = email;
  if (contactForm.remark !== current.remark) payload.remark = contactForm.remark;
  return payload;
}

/** 回读成功后同步详情与列表中同一行，避免列表继续显示旧联系方式。 */
function applyContact(value: UserVo): void {
  detail.value = value;
  fillContactForm(value);
  const index = rows.value.findIndex((item) => item.id === value.id);
  if (index >= 0) {
    const current = rows.value[index];
    rows.value.splice(index, 1, {
      ...current,
      phone: value.phone,
      email: value.email,
      remark: value.remark,
    });
  }
}

async function saveContact(): Promise<void> {
  // 同步置位后再进入异步校验，双击不会产生第二次提交。
  if (saving.value || detailLoading.value || !canView.value || !detail.value) return;
  const id = detail.value.id;
  const epoch = operationSequence;
  const snapshot = captureSessionIdentity();
  saving.value = true;
  try {
    const valid = await (contactFormRef.value?.validate().catch(() => false) ?? false);
    if (!valid || epoch !== operationSequence || !isSessionIdentityCurrent(snapshot)) return;
    const payload = buildContactPayload();
    if (Object.keys(payload).length === 0) {
      ElMessage.info("联系方式未修改");
      return;
    }
    await updateScopedContact(id, payload);
    if (epoch !== operationSequence || !isSessionIdentityCurrent(snapshot)) return;
    ElMessage.success("联系方式已保存");
    // 保存成功与回读失败是两件事：分别提示，不能把回读失败说成保存失败。
    try {
      const fresh = await getScopedMember(id);
      if (epoch !== operationSequence || !isSessionIdentityCurrent(snapshot) || !detailVisible.value) return;
      applyContact(fresh);
    } catch {
      if (epoch === operationSequence && isSessionIdentityCurrent(snapshot))
        ElMessage.warning("保存成功，但回读失败，请手动刷新");
    }
  } catch (error) {
    if (epoch === operationSequence && isSessionIdentityCurrent(snapshot))
      ElMessage.error(getApiErrorMessage(error, "保存失败，请稍后重试"));
  } finally {
    if (epoch === operationSequence && isSessionIdentityCurrent(snapshot)) saving.value = false;
  }
}

// ============ 导出（按已应用条件，不含分页参数） ============
function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCurrent(): Promise<void> {
  if (!canView.value || exporting.value || loading.value || loadError.value) return;
  const epoch = operationSequence;
  const snapshot = captureSessionIdentity();
  const params: BranchMemberFilters = { ...applied.value };
  exporting.value = true;
  exportFailure.value = "";
  try {
    const blob = await exportBranchMembers(params);
    if (epoch !== operationSequence || !isSessionIdentityCurrent(snapshot)) return;
    // xlsx 是 ZIP：这里只校验文件头，拒绝把错误页或 JSON 当作 Excel 下载。
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
      let message = "返回内容不是 Excel 文件，请核对服务端响应";
      try {
        const error: unknown = JSON.parse(await blob.text());
        if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
          message = error.message;
      } catch {
        /* 非 JSON 错误页沿用文件类型提示。 */
      }
      throw new Error(message);
    }
    if (epoch === operationSequence && isSessionIdentityCurrent(snapshot)) saveFile(blob, "本支部成员名单.xlsx");
  } catch (error) {
    if (epoch === operationSequence && isSessionIdentityCurrent(snapshot))
      exportFailure.value = `导出未完成：${getApiErrorMessage(error, "下载失败，请手动重试")}`;
  } finally {
    if (epoch === operationSequence && isSessionIdentityCurrent(snapshot)) exporting.value = false;
  }
}

// ============ 生命周期 ============
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
  <main class="branch-members-page page-container">
    <header class="page-heading">
      <div>
        <span class="eyebrow">MEMBERS / 成员与支部</span>
        <h1>本支部成员</h1>
        <p>查看本支部成员名单与详情，维护手机号、邮箱与备注，并按已应用条件导出 Excel 名单。</p>
      </div>
      <el-tag class="scope-tag" effect="plain" type="danger">本支部范围</el-tag>
    </header>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="branch-members-no-token"
      title="支委工作台需要登录"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实成员数据。请使用党支部书记账号登录后再访问。</p>
        <el-button type="primary" @click="$router.push('/login')">前往登录</el-button>
      </template>
    </el-alert>

    <el-alert
      v-else-if="!ALLOWED_ROLES.includes(store.currentRole)"
      data-testid="branch-members-no-permission"
      title="当前身份无权查看支委工作台"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>支委工作台仅面向党支部书记（支委）开放，成员范围由服务端按登录身份限定为本人所属支部。</p>
      </template>
    </el-alert>

    <template v-else-if="canView">
      <section class="surface content-card toolbar" aria-label="成员筛选">
        <div class="toolbar-row">
          <el-input
            v-model="filters.keyword"
            class="keyword-input"
            data-testid="branch-member-keyword"
            clearable
            placeholder="姓名 / 学号 / 手机 / 邮箱"
            aria-label="关键词"
            @keyup.enter="search"
          />
          <el-radio-group v-model="statusChoice" data-testid="branch-member-status" aria-label="成员状态">
            <el-radio-button value="enabled">启用（默认）</el-radio-button>
            <el-radio-button value="disabled">停用</el-radio-button>
          </el-radio-group>
          <el-button type="primary" data-testid="branch-member-search" @click="search">搜索</el-button>
          <el-button data-testid="branch-member-reset" @click="resetFilters">重置筛选</el-button>
          <el-button
            :loading="exporting"
            :disabled="loading || !!loadError"
            data-testid="branch-member-export"
            @click="exportCurrent"
          >
            导出名单
          </el-button>
        </div>
        <p class="toolbar-hint">
          默认只查询启用中的成员；选择「停用」时才会显式查询停用成员，不提供「全部状态」。范围由服务端按登录身份判定，页面不发送支部参数。
          导出使用已应用条件（关键词与状态），导出全部匹配记录而非当前页；文件仅含学号、姓名、手机号、邮箱、学院、年级、专业、班级、备注，不含政治身份与支部列。
        </p>
        <p v-if="identityState === 'error'" class="toolbar-hint" data-testid="branch-member-identity-error">
          政治身份字典加载失败，身份列将按编号显示，成员列表仍可使用。
        </p>
        <p v-else-if="identityTruncated" class="toolbar-hint" data-testid="branch-member-identity-truncated">
          身份字典超过 2000 条，仅加载了前 2000 条；未覆盖到的成员将按「身份 #编号」显示。
        </p>
      </section>

      <el-alert
        v-if="exportFailure"
        data-testid="branch-member-export-error"
        :title="exportFailure"
        type="error"
        :closable="false"
      />

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载本支部成员…</span>
      </div>

      <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="branch-member-error">
        <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>本支部成员暂时无法加载</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain data-testid="branch-member-retry" @click="retry">
          <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
        </el-button>
      </div>

      <section v-else-if="rows.length === 0" class="state-card content-card" data-testid="branch-member-empty">
        <el-empty description="暂无本支部成员" :image-size="72">
          <template #default>
            <p class="empty-hint">当前已应用条件下服务端返回 0 条记录。可以调整关键词或切换到「停用」后重试。</p>
            <el-button type="primary" plain @click="resetFilters">恢复默认条件</el-button>
          </template>
        </el-empty>
      </section>

      <section v-else class="surface content-card" aria-labelledby="branch-member-table-title">
        <div class="section-heading">
          <div>
            <span class="section-index">BRANCH MEMBERS</span>
            <h2 id="branch-member-table-title">成员名单</h2>
          </div>
          <p data-testid="branch-member-total">共 {{ total }} 条 · 当前第 {{ page }} 页</p>
        </div>
        <div class="table-wrap">
          <el-table :data="rows" class="branch-member-table" data-testid="branch-member-table" stripe border>
            <el-table-column prop="studentId" label="学号" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.studentId || "—" }}</template>
            </el-table-column>
            <el-table-column label="姓名" min-width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.realName?.trim() || row.username || "—" }}</template>
            </el-table-column>
            <el-table-column label="手机号" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.phone?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="邮箱" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.email?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="学院" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.college?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="年级" min-width="90">
              <template #default="{ row }">{{ row.grade?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="专业" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">{{ row.major?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="班级" min-width="110" show-overflow-tooltip>
              <template #default="{ row }">{{ row.className?.trim() || "—" }}</template>
            </el-table-column>
            <el-table-column label="政治身份" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                <span data-testid="branch-member-identity">{{ identityLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? "启用" : "停用" }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" data-testid="branch-member-view" @click.stop="openDetail(row)">
                  查看
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-pagination
          v-if="total"
          :current-page="page"
          :page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next, jumper"
          class="pagination"
          @current-change="changePage"
          @size-change="changeSize"
        />
      </section>

      <el-dialog
        v-model="detailVisible"
        data-testid="branch-member-detail"
        title="成员详情"
        width="min(620px, calc(100vw - 24px))"
        :close-on-click-modal="!saving"
        :close-on-press-escape="!saving"
        :show-close="!saving"
        @update:model-value="!$event && onDetailClosed()"
      >
        <div v-loading="detailLoading" class="detail-body">
          <el-alert
            v-if="detailError"
            data-testid="branch-member-detail-error"
            :title="detailError"
            type="error"
            :closable="false"
          />
          <template v-if="detail">
            <div class="detail-scope">
              <el-tag effect="plain" type="danger">本支部范围</el-tag>
              <span>{{ branchLabel(detail) }}</span>
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="学号">{{ detail.studentId || "—" }}</el-descriptions-item>
              <el-descriptions-item label="姓名">{{ detail.realName || "—" }}</el-descriptions-item>
              <el-descriptions-item label="学院">{{ detail.college || "—" }}</el-descriptions-item>
              <el-descriptions-item label="年级">{{ detail.grade || "—" }}</el-descriptions-item>
              <el-descriptions-item label="专业">{{ detail.major || "—" }}</el-descriptions-item>
              <el-descriptions-item label="班级">{{ detail.className || "—" }}</el-descriptions-item>
              <el-descriptions-item label="政治身份">{{ identityLabel(detail) }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ detail.status === 1 ? "启用" : "停用" }}</el-descriptions-item>
            </el-descriptions>
            <p class="detail-hint">
              学号、姓名、学院、年级、专业、班级、支部与政治身份为权威字段，本页面不提供修改；如需调整请联系超级管理员。
              手机号、邮箱与备注可在此维护，留空保存即清空该项。
            </p>
            <el-form
              ref="contactFormRef"
              :model="contactForm"
              :rules="contactRules"
              :disabled="saving"
              label-width="80px"
              class="contact-form"
            >
              <el-form-item label="手机号" prop="phone">
                <el-input
                  v-model="contactForm.phone"
                  data-testid="contact-phone"
                  maxlength="11"
                  placeholder="11 位手机号"
                />
              </el-form-item>
              <el-form-item label="邮箱" prop="email">
                <el-input v-model="contactForm.email" data-testid="contact-email" placeholder="不超过 25 个字符" />
              </el-form-item>
              <el-form-item label="备注" prop="remark">
                <el-input
                  v-model="contactForm.remark"
                  data-testid="contact-remark"
                  type="textarea"
                  :rows="2"
                  maxlength="500"
                  show-word-limit
                />
              </el-form-item>
            </el-form>
          </template>
        </div>
        <template #footer>
          <el-button :disabled="saving" @click="detailVisible = false">关闭</el-button>
          <el-button
            type="primary"
            data-testid="contact-save"
            :loading="saving"
            :disabled="!detail || detailLoading"
            @click="saveContact"
          >
            保存联系方式
          </el-button>
        </template>
      </el-dialog>
    </template>
  </main>
</template>

<style lang="scss" scoped>
.branch-members-page {
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

  .keyword-input {
    width: 240px;
    max-width: 100%;
  }

  .toolbar-hint {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.7;
    overflow-wrap: anywhere;
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
  overflow-x: auto;
}

.branch-member-table {
  width: 100%;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  flex-wrap: wrap;
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

.detail-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-scope {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-regular);
  overflow-wrap: anywhere;
}

.detail-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  padding: 10px 12px;
  border-radius: var(--radius-base);
  background: var(--party-red-bg);
  overflow-wrap: anywhere;
}

.contact-form {
  min-width: 0;
}

@media (max-width: 768px) {
  .branch-members-page {
    padding-top: 16px;
  }

  .surface {
    padding: 18px 16px;
  }

  .page-heading h1 {
    font-size: 22px;
  }

  .toolbar .keyword-input {
    width: 100%;
  }
}
</style>
