<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import { captureSession, isSessionCurrent, sessionHasAccessToken, sessionUser } from "@/utils/session";
import type { SessionSnapshot } from "@/config/session-fence";
import { listRoles, type RoleVo } from "@/api/roles";
import { getMember, pageMembers, type UserVo } from "@/api/members";
import {
  createBranch,
  deleteBranch,
  getBranch,
  pageBranches,
  updateBranch,
  type Branch,
  type BranchFilters,
  type BranchSaveRequest,
} from "@/api/branches";

// 字段上限以 tb_branch DDL 为准：branch_name varchar(20)、college varchar(10)。
const BRANCH_NAME_MAX = 20;
const COLLEGE_MAX = 10;
const SECRETARY_PAGE_SIZE = 20;
const BRANCH_ADMIN_CODE = "branch_admin";
type LoadState = "idle" | "loading" | "ready" | "error" | "missing" | "empty";

const store = useAppStore();
// 开发预览没有真实 Token 时不允许查询或写入超管数据，服务端仍是最终鉴权方。
const canManage = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);
const rows = ref<Branch[]>([]);
const loading = ref(false);
const loadError = ref(false);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const filters = reactive({ keyword: "" });
const applied = ref<BranchFilters>({});
// 支部状态：1 正常、0 已删除（软删除）。成员 status=2 停用规则不适用于支部。
const statusLabel = (status: number) => (status === 1 ? "正常" : status === 0 ? "已删除" : "未知状态");
const dateLabel = (date: string | null) => (date ? date.replace("T", " ").slice(0, 16) : "—");

let requestSequence = 0;
async function loadBranches(): Promise<boolean> {
  const sequence = ++requestSequence;
  const snapshot = captureSession();
  if (!canManage.value) {
    rows.value = [];
    total.value = 0;
    return true;
  }
  loading.value = true;
  loadError.value = false;
  try {
    const result = await pageBranches({ page: page.value, size: size.value, ...applied.value });
    if (sequence !== requestSequence || !isSessionCurrent(snapshot) || !canManage.value) return true;
    rows.value = result.records;
    total.value = result.total;
    return true;
  } catch {
    if (sequence === requestSequence && isSessionCurrent(snapshot)) {
      rows.value = [];
      total.value = 0;
      loadError.value = true;
      return false;
    }
    return true;
  } finally {
    if (sequence === requestSequence && isSessionCurrent(snapshot)) loading.value = false;
  }
}
function search() {
  applied.value = { keyword: filters.keyword.trim() || undefined };
  page.value = 1;
  void loadBranches();
}
function reset() {
  filters.keyword = "";
  search();
}
function changePage(value: number) {
  page.value = value;
  void loadBranches();
}
function changeSize(value: number) {
  size.value = value;
  page.value = 1;
  void loadBranches();
}

const detailVisible = ref(false);
const detail = ref<Branch | null>(null);
const detailSecretary = ref<UserVo | null>(null);
const detailSecretaryError = ref(false);
async function readDetailSecretary(snapshot: SessionSnapshot, secretaryId: number) {
  try {
    const user = await getMember(secretaryId);
    if (isSessionCurrent(snapshot) && canManage.value) detailSecretary.value = user;
  } catch {
    if (isSessionCurrent(snapshot) && canManage.value) detailSecretaryError.value = true;
  }
}
function openDetail(value: Branch, snapshot: SessionSnapshot): void {
  if (!isSessionCurrent(snapshot) || !canManage.value) return;
  detail.value = value;
  detailSecretary.value = null;
  detailSecretaryError.value = false;
  detailVisible.value = true;
  if (typeof value.secretaryId === "number" && value.secretaryId > 0) {
    void readDetailSecretary(snapshot, value.secretaryId);
  }
}
async function viewBranch(row: Branch) {
  const snapshot = captureSession();
  try {
    const value = await getBranch(row.id);
    openDetail(value, snapshot);
  } catch {
    /* 请求层提示错误 */
  }
}

// ---------------- 维护表单与书记候选 ----------------
function emptyForm(): BranchSaveRequest {
  return { branchName: "", college: "", description: "", secretaryId: null };
}
const form = reactive<BranchSaveRequest>(emptyForm());
const formRef = ref<FormInstance>();
const formVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const saveNotice = ref("");
const rules: FormRules = {
  branchName: [
    { required: true, whitespace: true, message: "请输入支部名称", trigger: "blur" },
    { max: BRANCH_NAME_MAX, message: `支部名称不能超过 ${BRANCH_NAME_MAX} 个字符`, trigger: "blur" },
  ],
  college: [
    { required: true, whitespace: true, message: "请输入所属学院", trigger: "blur" },
    { max: COLLEGE_MAX, message: `所属学院不能超过 ${COLLEGE_MAX} 个字符`, trigger: "blur" },
  ],
  secretaryId: [{ required: true, type: "number", message: "请选择支部书记", trigger: "change" }],
};

const roleState = ref<LoadState>("idle");
const candidateState = ref<LoadState>("idle");
const branchAdminRoleId = ref<number | null>(null);
const candidates = ref<UserVo[]>([]);
/** 已选中或当前回显的用户，搜索、换页时不会被候选分页覆盖。 */
const pinnedOptions = ref<UserVo[]>([]);
const currentSecretary = ref<UserVo | null>(null);
const currentSecretaryError = ref(false);
const candidateTotal = ref(0);
const candidatePage = ref(1);
const candidateKeyword = ref("");
const secretaryOptions = computed<UserVo[]>(() => {
  const merged = new Map<number, UserVo>();
  for (const user of pinnedOptions.value) merged.set(user.id, user);
  for (const user of candidates.value) merged.set(user.id, user);
  return [...merged.values()];
});
const candidateStatusText = computed(() => {
  if (candidateState.value === "loading") return "正在加载书记候选人…";
  if (candidateState.value === "error") return "候选人加载失败";
  if (candidateState.value === "empty") return "共 0 位候选人";
  if (candidateState.value === "ready") return `第 ${candidatePage.value} 页 · 共 ${candidateTotal.value} 位候选人`;
  return "等待角色字典";
});
const candidateBusy = computed(() => candidateState.value === "loading");
const canPrevCandidate = computed(() => candidatePage.value > 1);
const canNextCandidate = computed(() => candidatePage.value * SECRETARY_PAGE_SIZE < candidateTotal.value);
const currentSecretaryRoleMismatch = computed(() => {
  const user = currentSecretary.value;
  const roleId = branchAdminRoleId.value;
  return (
    roleState.value === "ready" && roleId !== null && user !== null && user.roleId !== null && user.roleId !== roleId
  );
});
function secretaryLabel(user: UserVo): string {
  const name = user.realName?.trim() || user.username || `用户 ${user.id}`;
  const extras = [user.studentId?.trim() ? `学号 ${user.studentId}` : "", user.status === 2 ? "已停用" : ""].filter(
    (part) => part !== "",
  );
  return `${name}（${user.username}）· ID ${user.id}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
}
function pinSecretary(user: UserVo | null) {
  if (!user || typeof user.id !== "number") return;
  pinnedOptions.value = [user, ...pinnedOptions.value.filter((item) => item.id !== user.id)];
}

// formEpoch 标识一次表单实例；关闭、切换编辑对象、会话变化都会让它失效。
let formEpoch = 0;
let candidateSequence = 0;
let formSession: SessionSnapshot | null = null;
function isFormActive(epoch: number): boolean {
  return (
    formVisible.value && epoch === formEpoch && formSession !== null && isSessionCurrent(formSession) && canManage.value
  );
}
function invalidateFormRequests() {
  formEpoch += 1;
  candidateSequence += 1;
  formSession = null;
  branchAdminRoleId.value = null;
  candidates.value = [];
  pinnedOptions.value = [];
  currentSecretary.value = null;
  currentSecretaryError.value = false;
  candidateTotal.value = 0;
  candidatePage.value = 1;
  candidateKeyword.value = "";
  roleState.value = "idle";
  candidateState.value = "idle";
  saveNotice.value = "";
}
function onFormClosed() {
  // 关闭动画结束前若已重新打开表单，不清理新实例。
  if (!formVisible.value) invalidateFormRequests();
}
function beginForm() {
  invalidateFormRequests();
  formSession = captureSession();
  formVisible.value = true;
  roleState.value = "loading";
  candidateState.value = "loading";
}

async function loadRoleAndCandidates(epoch: number) {
  roleState.value = "loading";
  candidateState.value = "loading";
  let roles: RoleVo[];
  try {
    roles = await listRoles();
  } catch {
    if (isFormActive(epoch)) {
      roleState.value = "error";
      candidateState.value = "idle";
    }
    return;
  }
  if (!isFormActive(epoch)) return;
  const role = roles.find((item) => item.roleCode === BRANCH_ADMIN_CODE);
  if (!role || typeof role.id !== "number" || !Number.isSafeInteger(role.id) || role.id <= 0) {
    roleState.value = "missing";
    candidateState.value = "idle";
    return;
  }
  roleState.value = "ready";
  branchAdminRoleId.value = role.id;
  await fetchCandidates(epoch, 1, "");
}

async function fetchCandidates(epoch: number, targetPage: number, keyword: string) {
  const roleId = branchAdminRoleId.value;
  if (roleId === null) return;
  const sequence = ++candidateSequence;
  candidateState.value = "loading";
  candidates.value = [];
  try {
    // 不传 status：是否可任书记由后端裁定，前端不擅自增加「仅启用用户」规则。
    const result = await pageMembers({
      page: targetPage,
      size: SECRETARY_PAGE_SIZE,
      roleId,
      keyword: keyword.trim() || undefined,
    });
    if (!isFormActive(epoch) || sequence !== candidateSequence || roleId !== branchAdminRoleId.value) return;
    candidates.value = result.records;
    candidateTotal.value = result.total;
    candidatePage.value = targetPage;
    candidateKeyword.value = keyword;
    candidateState.value = result.records.length ? "ready" : "empty";
  } catch {
    if (isFormActive(epoch) && sequence === candidateSequence) {
      candidates.value = [];
      candidateTotal.value = 0;
      candidateState.value = "error";
    }
  }
}
function onCandidateSearch(query: string) {
  if (roleState.value !== "ready" || branchAdminRoleId.value === null) return;
  const keyword = query.trim();
  // Element Plus 展开下拉时也会以空关键词调用 remote-method；此时不重复查询，
  // 否则会把用户已翻到的候选分页重置回第一页。真正清空搜索（上一轮有关键词）仍会重新查询。
  if (keyword === "" && candidateKeyword.value === "") return;
  void fetchCandidates(formEpoch, 1, keyword);
}
function changeCandidatePage(delta: number) {
  if (roleState.value !== "ready" || branchAdminRoleId.value === null) return;
  const next = candidatePage.value + delta;
  if (next < 1 || (candidateTotal.value > 0 && (next - 1) * SECRETARY_PAGE_SIZE >= candidateTotal.value)) return;
  void fetchCandidates(formEpoch, next, candidateKeyword.value);
}
function retrySecretaryData() {
  if (!isFormActive(formEpoch)) return;
  if (roleState.value === "ready" && branchAdminRoleId.value !== null) {
    void fetchCandidates(formEpoch, candidatePage.value || 1, candidateKeyword.value);
  } else {
    void loadRoleAndCandidates(formEpoch);
  }
}
function onSecretaryChange() {
  const value = form.secretaryId;
  if (typeof value !== "number") return;
  const found = secretaryOptions.value.find((item) => item.id === value);
  if (found) pinSecretary(found);
}
async function loadCurrentSecretary(epoch: number, id: number) {
  currentSecretaryError.value = false;
  try {
    const user = await getMember(id);
    if (!isFormActive(epoch)) return;
    currentSecretary.value = user;
    pinSecretary(user);
  } catch {
    // 保留原 secretaryId 与诊断信息，不自动替换为其他用户。
    if (isFormActive(epoch)) {
      currentSecretary.value = null;
      currentSecretaryError.value = true;
    }
  }
}

function addBranch() {
  if (!canManage.value) return;
  editingId.value = null;
  Object.assign(form, emptyForm());
  formRef.value?.clearValidate();
  beginForm();
  void loadRoleAndCandidates(formEpoch);
}
async function editBranch(row: Branch) {
  if (!canManage.value) return;
  const snapshot = captureSession();
  let value: Branch;
  try {
    value = await getBranch(row.id);
  } catch {
    return;
  }
  if (!isSessionCurrent(snapshot) || !canManage.value) return;
  editingId.value = row.id;
  Object.assign(form, {
    branchName: value.branchName,
    college: value.college,
    description: value.description ?? "",
    secretaryId: value.secretaryId,
  });
  formRef.value?.clearValidate();
  beginForm();
  const epoch = formEpoch;
  void loadRoleAndCandidates(epoch);
  if (typeof value.secretaryId === "number" && value.secretaryId > 0) {
    void loadCurrentSecretary(epoch, value.secretaryId);
  }
}

/** 提交前再次做纯值校验；不依赖类型断言，也不把 null 伪装成合法 ID。 */
function buildPayload(): BranchSaveRequest | null {
  const branchName = form.branchName.trim();
  const college = form.college.trim();
  const secretaryId = form.secretaryId;
  if (!branchName || branchName.length > BRANCH_NAME_MAX) return null;
  if (!college || college.length > COLLEGE_MAX) return null;
  if (typeof secretaryId !== "number" || !Number.isSafeInteger(secretaryId) || secretaryId <= 0) return null;
  const payload: BranchSaveRequest = {
    branchName,
    college,
    description: form.description.trim(),
    secretaryId,
  };
  // 创建按后端契约写正常状态 1；编辑不传 status，后端不据此切换状态。
  if (editingId.value === null) payload.status = 1;
  return payload;
}
function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "") : "";
  return code === "ECONNABORTED" || code === "ETIMEDOUT" || /timeout|超时/i.test(message);
}
async function refreshAfterSave(editedId: number | null, branchName: string, showDetail: boolean) {
  const snapshot = captureSession();
  let detailFailed = false;
  if (showDetail) {
    try {
      let id = editedId;
      if (id === null) {
        const found = await pageBranches({ page: 1, size: 10, keyword: branchName });
        if (!isSessionCurrent(snapshot) || !canManage.value) return;
        id = found.records.find((item) => item.branchName === branchName)?.id ?? null;
      }
      if (id !== null) {
        const fresh = await getBranch(id);
        openDetail(fresh, snapshot);
      }
    } catch {
      detailFailed = isSessionCurrent(snapshot) && canManage.value;
    }
  }
  const listOk = await loadBranches();
  if (!isSessionCurrent(snapshot) || !canManage.value) return;
  if (detailFailed) ElMessage.warning("保存成功，但详情回读失败，请稍后通过列表「详情」重试");
  if (!listOk) ElMessage.warning("保存成功，但列表刷新失败，请点击列表上方的「重试」");
}
async function saveBranch() {
  if (saving.value || !canManage.value) return;
  const epoch = formEpoch;
  const snapshot = formSession;
  // 同步置位，避免校验异步期间双击产生第二次写请求。
  saving.value = true;
  saveNotice.value = "";
  try {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid || !isFormActive(epoch)) return;
    const payload = buildPayload();
    if (!payload) return;
    const isCreate = editingId.value === null;
    const editedId = editingId.value;
    try {
      if (isCreate) await createBranch(payload);
      else if (editedId !== null) await updateBranch(editedId, payload);
    } catch (error) {
      // 超时不代表服务端未写入：不自动重发创建，提示先查询确认。
      if (isFormActive(epoch) && isCreate && isTimeoutError(error)) {
        saveNotice.value =
          "保存请求超时，服务端可能已写入。请先点击「刷新列表确认」查询支部是否已创建；确认未写入后再决定是否重新保存，请勿重复提交。";
      }
      return;
    }
    if (snapshot === null || !isSessionCurrent(snapshot) || !canManage.value) return;
    const sameForm = epoch === formEpoch;
    if (sameForm) {
      ElMessage.success(isCreate ? "支部添加成功" : "支部信息已更新");
      formVisible.value = false;
    }
    await refreshAfterSave(isCreate ? null : editedId, payload.branchName, sameForm);
  } finally {
    saving.value = false;
  }
}
async function confirmAfterTimeout() {
  const ok = await loadBranches();
  if (!canManage.value) return;
  if (ok) ElMessage.info("列表已刷新，请确认支部是否已存在；确认未写入后再决定是否重新保存");
  else ElMessage.warning("列表刷新失败，请点击列表上方的「重试」");
}
async function removeBranch(row: Branch) {
  try {
    await ElMessageBox.confirm(
      `确定删除支部「${row.branchName}」吗？该操作为软删除，支部状态将置为 0（已删除），不会物理删除数据。`,
      "删除确认",
      { type: "warning", confirmButtonText: "确定删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  try {
    await deleteBranch(row.id);
    ElMessage.success("已删除");
    await loadBranches();
  } catch {
    /* 请求层提示错误 */
  }
}

onMounted(() => {
  if (canManage.value) void loadBranches();
});
watch([canManage, sessionUser], () => {
  // 退出、重新登录或角色变化后，旧请求不得回写新会话页面。
  invalidateFormRequests();
  formVisible.value = false;
  saving.value = false;
  rows.value = [];
  total.value = 0;
  loading.value = false;
  loadError.value = false;
  if (!canManage.value) {
    detailVisible.value = false;
    detail.value = null;
    detailSecretary.value = null;
  } else {
    void loadBranches();
  }
});
onBeforeUnmount(invalidateFormRequests);
</script>

<template>
  <div class="branches-page page-container">
    <div class="page-header">
      <h2 class="section-title">支部管理</h2>
      <p>维护党支部基础信息，支持新增、编辑与删除。</p>
    </div>
    <el-alert v-if="!sessionHasAccessToken" title="支部管理需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌。请使用超级管理员账号登录后再访问支部管理。</p>
        <el-button type="primary" @click="$router.push('/login')">前往登录</el-button>
      </template>
    </el-alert>
    <el-alert
      v-else-if="!canManage"
      title="当前账号没有支部管理权限，请使用超级管理员账号登录"
      type="warning"
      show-icon
      :closable="false"
    />
    <div v-else class="content-card">
      <div class="card-header">
        <div>
          <strong>支部列表</strong><span class="total-label">共 {{ total }} 条</span>
        </div>
        <div class="actions">
          <el-button v-if="canManage" type="primary" :icon="Plus" @click="addBranch">新增支部</el-button>
        </div>
      </div>
      <div class="filters">
        <el-input v-model="filters.keyword" clearable placeholder="支部名称" @keyup.enter="search" />
        <el-button type="primary" @click="search">搜索</el-button><el-button @click="reset">重置</el-button>
      </div>
      <el-alert v-if="loadError" title="支部数据加载失败" type="error" show-icon :closable="false" class="load-error"
        ><template #default><el-button link type="primary" @click="loadBranches">重试</el-button></template></el-alert
      >
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
        style="width: 100%"
        class="branches-table"
        empty-text="暂无支部数据"
      >
        <el-table-column prop="branchName" label="支部名称" min-width="200" /><el-table-column
          prop="college"
          label="所属学院"
          min-width="160"
          show-overflow-tooltip
        /><el-table-column label="状态" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="创建时间"
          width="172"
          class-name="created-at-column"
          label-class-name="created-at-header"
          ><template #default="{ row }">{{ dateLabel(row.createTime) }}</template></el-table-column
        >
        <el-table-column prop="description" label="简介" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right"
          ><template #default="{ row }"
            ><div class="row-actions">
              <el-button link type="primary" @click="viewBranch(row)">详情</el-button
              ><el-button v-if="canManage" link type="primary" @click="editBranch(row)">编辑</el-button
              ><el-button
                v-if="canManage"
                link
                type="danger"
                :disabled="row.status !== 1"
                :title="row.status !== 1 ? '该支部已删除' : undefined"
                @click="removeBranch(row)"
                >删除</el-button
              >
            </div></template
          ></el-table-column
        >
      </el-table>
      <el-pagination
        v-if="total"
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

    <el-dialog
      v-model="formVisible"
      :title="editingId === null ? '新增支部' : '编辑支部'"
      width="min(560px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      @closed="onFormClosed"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="branch-form">
        <el-form-item label="支部名称" prop="branchName"
          ><el-input v-model="form.branchName" :disabled="saving" placeholder="最多 20 个字符"
        /></el-form-item>
        <el-form-item label="所属学院" prop="college"
          ><el-input v-model="form.college" :disabled="saving" placeholder="最多 10 个字符"
        /></el-form-item>
        <el-form-item label="支部书记" prop="secretaryId">
          <el-select
            v-model="form.secretaryId"
            class="secretary-select"
            filterable
            remote
            clearable
            :remote-method="onCandidateSearch"
            :loading="candidateBusy"
            :disabled="saving || roleState !== 'ready'"
            placeholder="输入姓名 / 用户名 / 学号搜索支委用户"
            @change="onSecretaryChange"
          >
            <el-option v-for="user in secretaryOptions" :key="user.id" :label="secretaryLabel(user)" :value="user.id" />
          </el-select>
          <p class="form-hint">书记必须是持有支委（branch_admin）角色的真实用户；候选按该角色分页查询，提交用户 ID。</p>
        </el-form-item>
        <div class="secretary-status">
          <el-alert
            v-if="roleState === 'error'"
            title="角色字典加载失败"
            description="无法确认支委角色，未查询任何成员。请重试，不会退化为全量成员查询。"
            type="error"
            show-icon
            :closable="false"
            ><template #default
              ><el-button link type="primary" @click="retrySecretaryData">重试</el-button></template
            ></el-alert
          >
          <el-alert
            v-else-if="roleState === 'missing'"
            title="角色字典缺少 branch_admin"
            description="请先在角色管理中确认支委角色存在，然后重试；系统不会退化为查询全部成员，也不会自动授予角色。"
            type="error"
            show-icon
            :closable="false"
            ><template #default
              ><el-button link type="primary" @click="retrySecretaryData">重试</el-button></template
            ></el-alert
          >
          <template v-else-if="roleState === 'ready'">
            <el-alert
              v-if="candidateState === 'error'"
              title="书记候选人加载失败"
              description="请求失败，请重试；已有输入与选择已保留。"
              type="error"
              show-icon
              :closable="false"
              ><template #default
                ><el-button link type="primary" @click="retrySecretaryData">重试</el-button></template
              ></el-alert
            >
            <el-alert
              v-else-if="candidateState === 'empty'"
              title="没有符合条件的书记候选人"
              description="请先由超级管理员在成员管理中为用户分配支委（branch_admin）角色，再刷新候选列表；本页不会自动授予角色。"
              type="info"
              show-icon
              :closable="false"
            />
            <div class="candidate-toolbar">
              <span>{{ candidateStatusText }}</span>
              <el-button
                link
                type="primary"
                :disabled="!canPrevCandidate || candidateBusy"
                @click="changeCandidatePage(-1)"
                >上一页</el-button
              >
              <el-button
                link
                type="primary"
                :disabled="!canNextCandidate || candidateBusy"
                @click="changeCandidatePage(1)"
                >下一页</el-button
              >
              <el-button link type="primary" :disabled="candidateBusy" @click="retrySecretaryData">刷新</el-button>
            </div>
          </template>
          <el-alert
            v-if="currentSecretaryError"
            title="当前书记信息读取失败"
            description="已保留原书记用户 ID，请重新选择有效的支委用户后再保存。"
            type="warning"
            show-icon
            :closable="false"
          />
          <el-alert
            v-else-if="currentSecretaryRoleMismatch"
            title="当前书记未持有支委角色"
            description="该用户的角色与 branch_admin 字典不一致，服务端将拒绝保存。请重新选择有效候选人，本页不会自动修改用户角色。"
            type="warning"
            show-icon
            :closable="false"
          />
          <el-alert
            v-if="saveNotice"
            title="保存结果待确认"
            :description="saveNotice"
            type="warning"
            show-icon
            :closable="false"
            ><template #default
              ><el-button link type="primary" @click="confirmAfterTimeout">刷新列表确认</el-button></template
            ></el-alert
          >
        </div>
        <el-form-item label="简介"
          ><el-input v-model="form.description" type="textarea" :rows="2" :disabled="saving"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button :disabled="saving" @click="formVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveBranch">保存</el-button></template
      >
    </el-dialog>

    <el-dialog v-model="detailVisible" title="支部详情" width="min(520px, calc(100vw - 32px))"
      ><el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="支部名称" :span="2">{{ detail.branchName }}</el-descriptions-item
        ><el-descriptions-item label="所属学院">{{ detail.college || "—" }}</el-descriptions-item
        ><el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
        <el-descriptions-item label="支部书记" :span="2">
          <template v-if="detailSecretary">{{ secretaryLabel(detailSecretary) }}</template>
          <template v-else-if="detail.secretaryId"
            >用户 ID {{ detail.secretaryId }}<span v-if="detailSecretaryError">（成员信息读取失败）</span></template
          >
          <template v-else>—</template>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ dateLabel(detail.createTime) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间" :span="2">{{ dateLabel(detail.updateTime) }}</el-descriptions-item>
        <el-descriptions-item label="简介" :span="2">{{ detail.description || "—" }}</el-descriptions-item>
      </el-descriptions></el-dialog
    >
  </div>
</template>

<style scoped lang="scss">
.branches-page {
  padding: 24px 0 40px;
}
.branches-page.page-container {
  width: min(calc(100% - 32px), 1728px);
  max-width: none;
  padding-inline: 16px;
}
.page-header {
  margin-bottom: 24px;
  p {
    color: var(--text-secondary);
    margin-top: 4px;
  }
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
.actions,
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.actions .el-button + .el-button {
  margin-left: 0;
}
.filters {
  padding: 16px;
  background: var(--bg-page);
  margin-bottom: 18px;
  border-radius: var(--radius-base);
}
.filters .el-input {
  width: 280px;
}
.load-error {
  margin-bottom: 16px;
}
.branches-table :deep(.created-at-column .cell),
.branches-table :deep(.created-at-header .cell) {
  white-space: nowrap;
}
.row-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  white-space: nowrap;
}
.row-actions .el-button + .el-button {
  margin-left: 0;
}
.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
.branch-form {
  padding-right: 8px;
}
.secretary-select {
  width: 100%;
}
.form-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 4px;
}
.secretary-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: -4px 0 16px;
}
.candidate-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-secondary);
}
@media (max-width: 768px) {
  .branches-page.page-container {
    width: 100%;
  }
  .filters .el-input {
    width: 100%;
  }
}
@media (max-width: 576px) {
  .branch-form :deep(.el-form-item) {
    display: block;
  }
  .branch-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    justify-content: flex-start;
  }
  .branch-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
  .secretary-status {
    margin-left: 0;
  }
}
</style>
