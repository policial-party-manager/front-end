<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import type { TableInstance } from "element-plus";
import { Download, Plus, Upload } from "@element-plus/icons-vue";
import { useRouter } from "vue-router";
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
  createMember,
  downloadMemberTemplate,
  getMember,
  importMembers,
  listBranches,
  listRoles,
  pageMembers,
  updateMember,
  updateMemberStatus,
  type BranchOption,
  type ImportResult,
  type MemberFilters,
  type UserSaveRequest,
  type UserVo,
  type UserUpdateRequest,
  type IdentityOption,
  type IdentityMemberFilters,
  type BatchResult,
  pageIdentityMembers,
  pageIdentities,
  exportMembers,
  batchMemberStatus,
  batchMemberBranch,
} from "@/api/members";

const store = useAppStore();
const router = useRouter();
const canManage = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);
const rows = ref<UserVo[]>([]);
const branches = ref<BranchOption[]>([]);
const roles = ref<{ id: number; roleCode: string }[]>([]);
const loading = ref(false);
const loadError = ref(false);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const filters = reactive({
  keyword: "",
  branchId: undefined as number | undefined,
  status: undefined as number | undefined,
  identityId: undefined as number | undefined,
});
const applied = ref<MemberFilters>({});
const queryMode = ref<"admin" | "identity">("admin");
const appliedIdentity = ref<IdentityMemberFilters>({ status: 1 });
const identities = ref<IdentityOption[]>([]);
const identityState = ref<"loading" | "ready" | "error">("loading");
const branchError = ref(false);
const roleError = ref(false);
const tableRef = ref<TableInstance>();
const selected = ref<UserVo[]>([]);
function clearSelection() {
  selected.value = [];
  tableRef.value?.clearSelection();
}
const branchLabel = (member: UserVo) =>
  member.branchId == null ? "未分配" : member.branchName?.trim() || "支部名称不可用";
const identityLabel = (member: UserVo) =>
  member.identityId == null
    ? "未登记"
    : member.identityName?.trim() ||
      identities.value.find((i) => i.id === member.identityId)?.identityName ||
      "政治身份名称不可用";
let disposed = false;
function current(snapshot: SessionIdentitySnapshot) {
  return !disposed && canManage.value && isSessionIdentityCurrent(snapshot);
}
const roleLabel = (role: string | null) =>
  ({ super_admin: "超级管理员", branch_admin: "支部管理员", student: "普通成员" })[role || ""] || role || "—";
const dateLabel = (date: string | null) => (date ? date.replace("T", " ").slice(0, 16) : "—");

let requestSequence = 0;
async function loadMembers() {
  if (!canManage.value || disposed) return;
  clearSelection();
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = false;
  try {
    const result =
      queryMode.value === "admin"
        ? await pageMembers({ page: page.value, size: size.value, ...applied.value })
        : await pageIdentityMembers({ page: page.value, size: size.value, ...appliedIdentity.value });
    if (sequence !== requestSequence || !current(snapshot)) return;
    rows.value = result.records;
    total.value = result.total;
  } catch {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) {
      rows.value = [];
      total.value = 0;
      loadError.value = true;
    }
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}
function search() {
  if (!canManage.value) return;
  if (queryMode.value === "admin" && filters.keyword.trim() && filters.branchId !== undefined) {
    ElMessage.warning("关键词与支部暂不支持组合查询，请清空其中一项后搜索；已应用条件未改变。");
    return;
  }
  appliedIdentity.value = { identityId: filters.identityId, status: filters.status === 2 ? 2 : 1 };
  applied.value = { keyword: filters.keyword.trim() || undefined, branchId: filters.branchId, status: filters.status };
  page.value = 1;
  void loadMembers();
}
/** 仅清空筛选条件并重新查询，不删除成员、不撤销导入。 */
function resetFilters() {
  filters.keyword = "";
  filters.branchId = undefined;
  filters.status = undefined;
  filters.identityId = undefined;
  if (queryMode.value === "identity") filters.status = 1;
  search();
}
function switchMode() {
  filters.keyword = "";
  filters.branchId = undefined;
  filters.identityId = undefined;
  filters.status = queryMode.value === "identity" ? 1 : undefined;
  ElMessage.info("已清理不兼容条件并重新查询；身份查询仅支持身份与单一状态，不支持关键词、支部组合。");
  search();
}
function changePage(value: number) {
  page.value = value;
  void loadMembers();
}
function changeSize(value: number) {
  size.value = value;
  page.value = 1;
  void loadMembers();
}
async function loadOptions() {
  if (!canManage.value) return;
  const snapshot = captureSessionIdentity();
  const sequence = ++optionSequence;
  // 支部与角色字典相互独立：任一失败不影响另一份结果，避免列表筛选和导入核对一起丢失。
  const [branchResult, roleResult] = await Promise.allSettled([listBranches(), listRoles()]);
  if (!current(snapshot) || sequence !== optionSequence) return;
  branchError.value = branchResult.status === "rejected";
  roleError.value = roleResult.status === "rejected";
  if (branchResult.status === "fulfilled") branches.value = Array.isArray(branchResult.value) ? branchResult.value : [];
  if (roleResult.status === "fulfilled") roles.value = Array.isArray(roleResult.value) ? roleResult.value : [];
  if (branchResult.status === "rejected" || roleResult.status === "rejected") {
    ElMessage.warning("支部或角色选项加载失败，请刷新页面重试");
  }
}
let optionSequence = 0;
let identitySequence = 0;
async function loadIdentities() {
  if (!canManage.value) return;
  const snapshot = captureSessionIdentity(),
    sequence = ++identitySequence;
  identityState.value = "loading";
  try {
    const values: IdentityOption[] = [];
    for (let next = 1; ; next++) {
      const result = await pageIdentities(next, 100);
      if (!current(snapshot) || sequence !== identitySequence) return;
      if (!Array.isArray(result.records) || !Number.isSafeInteger(result.total) || result.total < 0)
        throw new Error("身份字典响应异常");
      if (!result.records.length && values.length < result.total) throw new Error("身份字典分页不完整");
      values.push(...result.records);
      if (values.length >= result.total) break;
    }
    identities.value = values;
    identityState.value = "ready";
  } catch {
    if (current(snapshot) && sequence === identitySequence) identityState.value = "error";
  }
}
onMounted(() => {
  if (canManage.value) {
    void loadMembers();
    void loadOptions();
    void loadIdentities();
  }
});
watch([canManage, sessionIdentity], () => {
  // 退出、换号或权限变化：清除上一个会话的列表、导入文件与报告，并使在途回调失效。
  invalidateImport();
  invalidateManagement();
  importVisible.value = false;
  rows.value = [];
  total.value = 0;
  loading.value = false;
  loadError.value = false;
  if (canManage.value) {
    void loadMembers();
    void loadOptions();
    void loadIdentities();
  }
});
onBeforeUnmount(() => {
  disposed = true;
  invalidateManagement();
  invalidateImport();
  importVisible.value = false;
});

const detailVisible = ref(false);
const detail = ref<UserVo | null>(null);
let detailEpoch = 0;
async function viewMember(row: UserVo) {
  if (!canManage.value) return;
  const epoch = ++detailEpoch,
    snapshot = captureSessionIdentity();
  detail.value = null;
  detailVisible.value = true;
  try {
    const value = await getMember(row.id);
    if (epoch === detailEpoch && detailVisible.value && current(snapshot)) detail.value = value;
  } catch {
    /* 请求层提示错误 */
  }
}
function emptyForm(): UserSaveRequest {
  return {
    username: "",
    realName: "",
    studentId: "",
    gender: "",
    college: "",
    grade: "",
    major: "",
    className: "",
    branchId: null,
    roleId: null,
    phone: "",
    email: "",
    contactPerson: "",
    remark: "",
  };
}
const form = reactive<UserSaveRequest>(emptyForm());
const formRef = ref<FormInstance>();
const formVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const rules = computed<FormRules>(() => ({
  username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
  realName: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  studentId: [{ required: true, message: "请输入学号", trigger: "blur" }],
  phone: [{ pattern: /^1\d{10}$/, message: "手机号格式不正确", trigger: "blur" }],
  email: [{ type: "email", message: "邮箱格式不正确", trigger: "blur" }],
  ...(editingId.value !== null ? { username: [], realName: [], studentId: [] } : {}),
}));
let formEpoch = 0;
const original = ref<UserVo | null>(null);
const formLoading = ref(false);
function closeForm() {
  formEpoch++;
  formVisible.value = false;
  saving.value = false;
  formLoading.value = false;
}
function addMember() {
  if (!canManage.value) return;
  closeForm();
  original.value = null;
  editingId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
async function editMember(row: UserVo) {
  if (!canManage.value) return;
  closeForm();
  const epoch = formEpoch,
    snapshot = captureSessionIdentity();
  editingId.value = row.id;
  Object.assign(form, emptyForm());
  formVisible.value = true;
  formLoading.value = true;
  try {
    const value = await getMember(row.id);
    if (epoch !== formEpoch || !formVisible.value || !current(snapshot)) return;
    original.value = value;
    editingId.value = row.id;
    Object.assign(form, {
      username: value.username,
      realName: value.realName || "",
      studentId: value.studentId || "",
      gender: value.gender || "",
      college: value.college || "",
      grade: value.grade || "",
      major: value.major || "",
      className: value.className || "",
      branchId: value.branchId,
      roleId: value.roleId,
      phone: value.phone || "",
      email: value.email || "",
      contactPerson: value.contactPerson || "",
      remark: value.remark || "",
    });
    formVisible.value = true;
  } catch {
    if (epoch === formEpoch && current(snapshot)) closeForm();
  } finally {
    if (epoch === formEpoch && current(snapshot)) formLoading.value = false;
  }
}
async function saveMember() {
  if (saving.value || formLoading.value || !canManage.value || !formRef.value) return;
  const epoch = formEpoch,
    snapshot = captureSessionIdentity();
  saving.value = true;
  try {
    if (!(await formRef.value.validate().catch(() => false)) || epoch !== formEpoch || !current(snapshot)) return;
    if (editingId.value !== null) {
      const payload: UserUpdateRequest = {
        gender: form.gender,
        grade: form.grade,
        major: form.major,
        phone: form.phone,
        email: form.email,
        contactPerson: form.contactPerson,
        remark: form.remark,
      };
      if (form.branchId !== original.value?.branchId) {
        if (!form.branchId || !branches.value.some((b) => b.id === form.branchId) || branchError.value)
          throw new Error("请选择有效正常支部");
        payload.branchId = form.branchId;
      }
      if (form.roleId !== original.value?.roleId) {
        if (!form.roleId || !roles.value.some((r) => r.id === form.roleId) || roleError.value)
          throw new Error("请选择有效角色");
        payload.roleId = form.roleId;
      }
      await updateMember(editingId.value, payload);
    } else await createMember({ ...form });
    if (epoch !== formEpoch || !current(snapshot)) return;
    ElMessage.success(editingId.value === null ? "成员添加成功" : "成员信息已更新");
    closeForm();
    await loadMembers();
  } catch (error) {
    if (epoch === formEpoch && current(snapshot))
      ElMessage.error(getApiErrorMessage(error, "保存结果未确认，请核对列表后再操作"));
  } finally {
    if (epoch === formEpoch && current(snapshot)) saving.value = false;
  }
}
async function changeStatus(row: UserVo) {
  if (!canManage.value || statusBusy.value) return;
  statusBusy.value = true;
  const snapshot = captureSessionIdentity(),
    epoch = operationEpoch;
  const next = row.status === 1 ? 2 : 1;
  const action = next === 2 ? "停用" : "启用";
  try {
    await ElMessageBox.confirm(`确定${action}成员「${row.realName || row.username}」吗？`, `${action}确认`, {
      type: "warning",
      confirmButtonText: `确定${action}`,
      cancelButtonText: "取消",
    });
  } catch {
    if (epoch === operationEpoch && current(snapshot)) statusBusy.value = false;
    return;
  }
  try {
    if (epoch !== operationEpoch || !current(snapshot)) return;
    await updateMemberStatus(row.id, next);
    if (epoch !== operationEpoch || !current(snapshot)) return;
    ElMessage.success(`已${action}`);
    await loadMembers();
  } catch {
    /* 请求层提示错误 */
  } finally {
    if (epoch === operationEpoch && current(snapshot)) statusBusy.value = false;
  }
}

const exporting = ref(false);
const exportFailure = ref("");
const batchBusy = ref(false);
const statusBusy = ref(false);
const batchBranchId = ref<number>();
const batchReport = ref<BatchResult | null>(null);
const batchNames = ref<Map<number, string>>(new Map());
const batchFailure = ref("");
let operationEpoch = 0;
function invalidateManagement() {
  if (batchBusy.value || statusBusy.value) ElMessageBox.close();
  requestSequence++;
  optionSequence++;
  identitySequence++;
  detailEpoch++;
  operationEpoch++;
  closeForm();
  Object.assign(form, emptyForm());
  original.value = null;
  detailVisible.value = false;
  detail.value = null;
  clearSelection();
  batchReport.value = null;
  batchFailure.value = "";
  batchNames.value.clear();
  batchBranchId.value = undefined;
  batchBusy.value = false;
  exporting.value = false;
  exportFailure.value = "";
  statusBusy.value = false;
  branches.value = [];
  roles.value = [];
  identities.value = [];
}
async function exportCurrent() {
  if (!canManage.value || exporting.value || queryMode.value !== "identity" || loading.value || loadError.value) return;
  const snapshot = captureSessionIdentity(),
    epoch = operationEpoch;
  const params = { ...appliedIdentity.value };
  exporting.value = true;
  exportFailure.value = "";
  try {
    const blob = await exportMembers(params);
    if (epoch !== operationEpoch || !current(snapshot)) return;
    // xlsx 是 ZIP；拒绝误标 MIME 的 JSON/HTML 等错误页，避免伪装成 Excel 下载。
    // 这里只检查文件头，不声称已验证工作簿内容。
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
    if (epoch === operationEpoch && current(snapshot)) saveFile(blob, "成员名单.xlsx");
  } catch (error) {
    if (epoch === operationEpoch && current(snapshot))
      exportFailure.value = `导出未完成：${getApiErrorMessage(error, "下载失败，请手动重试")}`;
  } finally {
    if (epoch === operationEpoch && current(snapshot)) exporting.value = false;
  }
}
function parseBatchResult(raw: unknown, ids: number[]): BatchResult | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("total" in raw) ||
    !("successCount" in raw) ||
    !("failCount" in raw) ||
    !("errors" in raw)
  )
    return null;
  const { total, successCount, failCount, errors } = raw;
  if (
    typeof total !== "number" ||
    typeof successCount !== "number" ||
    typeof failCount !== "number" ||
    ![total, successCount, failCount].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    total !== ids.length ||
    successCount + failCount !== total ||
    !Array.isArray(errors) ||
    errors.length !== failCount
  )
    return null;
  const parsed: BatchResult["errors"] = [];
  for (const error of errors) {
    if (
      !error ||
      typeof error !== "object" ||
      typeof error.id !== "number" ||
      !ids.includes(error.id) ||
      typeof error.reason !== "string" ||
      parsed.some((e) => e.id === error.id)
    )
      return null;
    parsed.push({ id: error.id, reason: error.reason });
  }
  return { total, successCount, failCount, errors: parsed };
}
async function runBatch(action: "enable" | "disable" | "branch") {
  if (!canManage.value || batchBusy.value) return;
  const members = [...selected.value],
    ids = [...new Set(members.map((r) => r.id))];
  if (!ids.length || ids.length > 200 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    ElMessage.warning("请选择 1–200 名当前页成员");
    return;
  }
  const target = branches.value.find((b) => b.id === batchBranchId.value);
  if (action === "branch" && (!target || branchError.value)) {
    ElMessage.warning("请选择有效正常支部，选项失败时请重试");
    return;
  }
  const snapshot = captureSessionIdentity(),
    epoch = operationEpoch;
  const label = action === "enable" ? "启用" : action === "disable" ? "停用" : "调整支部";
  batchBusy.value = true;
  try {
    // 登录契约无本人 ID，无法可靠判断所选行是否包含本人，统一明确提示风险。
    await ElMessageBox.confirm(
      `确定${label} ${ids.length} 名成员${target && action === "branch" ? `至「${target.branchName}」` : ""}？如选择包含当前登录账号，可能影响本人会话。逐项成功不会整体回滚。`,
      "批量操作确认",
      { type: "warning", confirmButtonText: `确定${label}`, cancelButtonText: "取消" },
    );
  } catch {
    if (epoch === operationEpoch && current(snapshot)) batchBusy.value = false;
    return;
  }
  try {
    if (epoch !== operationEpoch || !current(snapshot)) return;
    batchReport.value = null;
    batchFailure.value = "";
    batchNames.value = new Map(members.map((m) => [m.id, m.realName || m.username]));
    const result =
      action === "branch" && target
        ? await batchMemberBranch(ids, target.id)
        : await batchMemberStatus(ids, action === "enable" ? 1 : 2);
    if (epoch !== operationEpoch || !current(snapshot)) return;
    batchReport.value = parseBatchResult(result, ids);
    if (!batchReport.value) batchFailure.value = "响应结构或计数异常，结果未确认，请先核对成员状态，不要直接重传。";
    clearSelection();
    await loadMembers();
  } catch (error) {
    if (epoch === operationEpoch && current(snapshot)) {
      batchFailure.value = `批量结果未确认：${getApiErrorMessage(error, "请求失败")}。可能已有项目生效，请先核对当前状态，不会自动重试。`;
      clearSelection();
    }
  } finally {
    if (epoch === operationEpoch && current(snapshot)) batchBusy.value = false;
  }
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadTemplate() {
  if (!canManage.value) return;
  const snapshot = captureSessionIdentity();
  try {
    const blob = await downloadMemberTemplate();
    if (current(snapshot)) saveFile(blob, "用户导入模板.xlsx");
  } catch {
    /* 请求层提示错误 */
  }
}

// ---------------- 成员 Excel 导入 ----------------
// 支部核对使用独立状态，即使角色字典失败也不影响导入前的支部查询结果。
type OptionState = "idle" | "loading" | "ready" | "error" | "empty";
const MAX_IMPORT_SIZE = 10 * 1024 * 1024;

const importVisible = ref(false);
const importDialogBody = ref<HTMLElement>();
const importResultAnchor = ref<HTMLElement>();
const importFile = ref<File | null>(null);
const importFileInput = ref<HTMLInputElement>();
const importing = ref(false);
const importProgress = ref(0);
const importResult = ref<ImportResult | null>(null);
const importFailure = ref("");
const importBranchState = ref<OptionState>("idle");
const importBranches = ref<BranchOption[]>([]);
const importBranchKeyword = ref("");
const importBranchOptions = computed(() => {
  const keyword = importBranchKeyword.value.trim();
  if (!keyword) return importBranches.value;
  return importBranches.value.filter((branch) => branch.branchName.includes(keyword));
});
const importBranchStateText = computed(() => {
  switch (importBranchState.value) {
    case "loading":
      return "正在加载支部选项…";
    case "ready":
      return `共 ${importBranches.value.length} 个正常支部`;
    case "empty":
      return "暂无可匹配的正常支部";
    case "error":
      return "加载失败，暂时无法核对";
    default:
      return "尚未加载";
  }
});

// importEpoch 标识一次导入会话；关闭弹窗、退出或换号都会让它失效，
// 旧会话的回调（进度、结果、列表回读）因此不会污染新会话。
let importEpoch = 0;
let importBranchSequence = 0;
let importSession: SessionIdentitySnapshot | null = null;
function isImportActive(epoch: number): boolean {
  return (
    importVisible.value &&
    epoch === importEpoch &&
    importSession !== null &&
    isSessionIdentityCurrent(importSession) &&
    canManage.value
  );
}
function resetImportFileInput() {
  if (importFileInput.value) importFileInput.value.value = "";
}
function clearImportReport() {
  importResult.value = null;
  importFailure.value = "";
  importProgress.value = 0;
}
function invalidateImport() {
  importEpoch += 1;
  importBranchSequence += 1;
  importSession = null;
  importing.value = false;
  clearImportReport();
  importFile.value = null;
  importBranches.value = [];
  importBranchKeyword.value = "";
  importBranchState.value = "idle";
  resetImportFileInput();
}
function openImport() {
  if (!canManage.value) return;
  invalidateImport();
  importSession = captureSessionIdentity();
  importVisible.value = true;
  void loadImportBranches();
}
/** 内容区可滚动，打开时回到顶部，避免直接停在填写规则中段。 */
function scrollImportTop() {
  void nextTick(() => {
    if (importDialogBody.value) importDialogBody.value.scrollTop = 0;
  });
}
/** 结果出现后滚到结果区，避免窄屏下需要手动滚动才能看到反馈。 */
function scrollImportResultIntoView() {
  void nextTick(() => {
    importResultAnchor.value?.scrollIntoView({ block: "nearest" });
  });
}
function onImportClosed() {
  // 关闭动画结束前若已重新打开，不清理新会话的数据。
  if (!importVisible.value) invalidateImport();
}
function goToBranches() {
  if (importing.value) return;
  void router.push("/branches");
}
async function loadImportBranches() {
  const epoch = importEpoch;
  const sequence = ++importBranchSequence;
  importBranchState.value = "loading";
  try {
    const list = await listBranches();
    if (!isImportActive(epoch) || sequence !== importBranchSequence) return;
    importBranches.value = Array.isArray(list) ? list : [];
    importBranchState.value = importBranches.value.length ? "ready" : "empty";
  } catch {
    if (isImportActive(epoch) && sequence === importBranchSequence) {
      // 失败不等于没有支部：只提示暂时无法核对，不给出空列表结论。
      importBranches.value = [];
      importBranchState.value = "error";
    }
  }
}
/** 校验导入文件；不通过时返回应展示的提示，通过时返回 null。 */
function validateImportFile(file: File): string | null {
  if (!/\.xlsx$/i.test(file.name)) return "请上传 .xlsx 格式文件";
  if (file.size === 0) return "文件内容为空，请选择包含数据的 .xlsx 文件";
  if (file.size > MAX_IMPORT_SIZE) return `文件不能超过 ${MAX_IMPORT_SIZE / 1024 / 1024} MB`;
  return null;
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // 换文件必须先清除上一份文件的报告与进度，避免旧结果被当成新文件的结果。
  clearImportReport();
  importFile.value = file;
  if (!file) return;
  const invalid = validateImportFile(file);
  if (invalid) {
    importFile.value = null;
    resetImportFileInput();
    ElMessage.warning(invalid);
  }
}
const toCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
/** 只接受结构完整的 ImportResult；结构不符时不得编造计数。 */
function parseImportResult(raw: unknown): ImportResult | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<ImportResult>;
  const total = toCount(source.total);
  const successCount = toCount(source.successCount);
  const failCount = toCount(source.failCount);
  if (total === null || successCount === null || failCount === null) return null;
  const errors: { row: number; reason: string }[] = [];
  if (Array.isArray(source.errors)) {
    for (const item of source.errors) {
      if (!item || typeof item !== "object") continue;
      const row = toCount((item as { row?: unknown }).row);
      const reason = (item as { reason?: unknown }).reason;
      // row 是 Excel 行号，只能原样展示与导出，不能按数组下标重排。
      if (row === null || typeof reason !== "string") continue;
      errors.push({ row, reason });
    }
  }
  return { total, successCount, failCount, errors };
}
/** 结果分类：通知文案与弹窗摘要共用同一套判定，避免两处级联各写一遍。 */
type ImportOutcome = { type: "success" | "warning" | "error" | "info"; title: string };
function classifyImportResult(result: ImportResult): ImportOutcome {
  if (result.total === 0) return { type: "info", title: "文件中没有可导入的数据行" };
  if (result.failCount === 0 && result.successCount > 0) return { type: "success", title: "全部导入成功" };
  if (result.successCount > 0) return { type: "warning", title: "部分导入成功" };
  if (result.failCount > 0) return { type: "error", title: "全部导入失败" };
  return { type: "info", title: "导入结果未包含成功或失败计数" };
}
function notifyImportResult(result: ImportResult) {
  const outcome = classifyImportResult(result);
  if (outcome.type === "success") {
    ElMessage.success(`导入完成：共 ${result.total} 行，全部成功`);
  } else if (outcome.type === "warning") {
    ElMessage.warning(`导入部分成功：成功 ${result.successCount} 行，失败 ${result.failCount} 行，请下载错误报告核对`);
  } else if (outcome.type === "error") {
    ElMessage.error(`导入失败：共 ${result.total} 行，全部失败，请下载错误报告核对`);
  } else if (result.total === 0) {
    ElMessage.info(outcome.title);
  } else {
    ElMessage.warning("导入结果未包含成功或失败行，请核对成员列表确认实际写入情况");
  }
}
const importOutcome = computed<ImportOutcome | null>(() => {
  const result = importResult.value;
  if (!result) return null;
  return classifyImportResult(result);
});
const importSummary = computed(() => {
  const result = importResult.value;
  if (!result) return "";
  return `共 ${result.total} 行，成功 ${result.successCount} 行，失败 ${result.failCount} 行`;
});
function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "") : "";
  return code === "ECONNABORTED" || code === "ETIMEDOUT" || /timeout|超时/i.test(message);
}
/** 读取服务端返回的业务原因，用于区分「确定性拒绝」与「结果未知」。 */
function readServerRejection(error: unknown): { status: number; message: string } | null {
  const status = readHttpStatus(error);
  // 明确拒绝类 4xx 表示服务端没有进入逐行写入：400 参数/格式问题、403 无权限、
  // 404/405/413/415/422 等同类确定性拒绝。
  // 但 408 超时与 429 限流说明请求可能已到达或被节流，401 在开发预览下会被请求层跳过，
  // 这些都不能断言「未写入」，仍按结果未知处理。
  if (!isDefiniteRejection(status)) return null;
  return { status, message: getApiErrorMessage(error, "") };
}
function readHttpStatus(error: unknown): number {
  if (typeof error !== "object" || error === null) return 0;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : 0;
}
/** 该状态码是否足以断言服务端未执行导入。 */
function isDefiniteRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}
async function submitImport() {
  // 同步置位，避免校验与异步阶段中双击产生第二次导入请求。
  if (importing.value) return;
  const file = importFile.value;
  if (!file) {
    ElMessage.warning("请选择 Excel 文件");
    return;
  }
  const invalid = validateImportFile(file);
  if (invalid) {
    ElMessage.warning(invalid);
    return;
  }
  const epoch = importEpoch;
  const snapshot = captureSessionIdentity();
  importSession = snapshot;
  importing.value = true;
  clearImportReport();
  try {
    const response = await importMembers(file, (percent) => {
      if (!isImportActive(epoch) || !isSessionIdentityCurrent(snapshot)) return;
      const next = Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
      if (next > importProgress.value) importProgress.value = next;
    });
    if (!isImportActive(epoch) || !isSessionIdentityCurrent(snapshot)) return;
    const result = parseImportResult(response);
    if (!result) {
      importFailure.value =
        "服务端返回的导入结果不完整，无法确认成功与失败行数。请先核对成员列表，再决定是否重新导入。";
      scrollImportResultIntoView();
      return;
    }
    importResult.value = result;
    importProgress.value = 100;
    notifyImportResult(result);
    scrollImportResultIntoView();
    if (result.successCount > 0) {
      // 只回读服务端列表；回读失败不得篡改已获得的导入报告。
      page.value = 1;
      await loadMembers();
    }
  } catch (error) {
    if (!isImportActive(epoch) || !isSessionIdentityCurrent(snapshot)) return;
    // 服务端已明确拒绝（如「Excel 中没有可导入的数据行」「表头与模板不一致」）：
    // 此时既没有逐行写入，也不能归为「网络失败」或「结果未确认」，需原样转达服务端原因。
    const rejection = readServerRejection(error);
    if (rejection) {
      // 请求层已对同一原因弹过错误提示，这里在弹窗内保留持久说明，便于核对后再处理。
      importFailure.value = rejection.message
        ? `导入未执行：${rejection.message}`
        : `导入未执行：服务端拒绝了本次请求（HTTP ${rejection.status}），未写入任何成员。`;
      scrollImportResultIntoView();
      return;
    }
    if (isTimeoutError(error)) {
      importFailure.value =
        "导入请求超时，尚未确认处理结果。请先核对成员列表确认是否已写入，再决定是否重新导入；请勿重复提交。";
    } else {
      importFailure.value = "导入请求失败，未获得导入结果。已保留所选文件，请核对网络或权限后重试。";
    }
    scrollImportResultIntoView();
  } finally {
    // 关闭重开或换号会推进 importEpoch，因此旧操作不得清除新操作的导入状态。
    if (epoch === importEpoch) importing.value = false;
  }
}
function downloadErrors() {
  if (!importResult.value) return;
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    "行号,失败原因",
    ...importResult.value.errors.map(({ row, reason }) => `${row},${quote(reason.replace(/\r?\n/g, " "))}`),
  ];
  saveFile(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "成员导入错误报告.csv");
}
</script>

<template>
  <div class="members-page page-container">
    <div class="page-header">
      <h2 class="section-title">成员管理</h2>
      <p>查看和维护成员基础信息，支持 Excel 批量导入。</p>
    </div>
    <el-alert v-if="!sessionHasAccessToken" title="成员管理需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌。请使用超级管理员账号登录后再访问成员管理。</p>
        <el-button type="primary" @click="$router.push('/login')">前往登录</el-button>
      </template>
    </el-alert>
    <el-alert
      v-else-if="!canManage"
      title="当前账号没有成员管理权限，请使用超级管理员账号登录"
      type="warning"
      show-icon
      :closable="false"
    />
    <div v-else class="content-card">
      <div class="card-header">
        <div>
          <strong>成员列表</strong><span class="total-label">共 {{ total }} 条</span>
        </div>
        <div class="actions">
          <el-button
            :disabled="queryMode !== 'identity' || loading || loadError"
            :loading="exporting"
            @click="exportCurrent"
            >导出成员</el-button
          >
          <el-button :icon="Download" @click="downloadTemplate">下载导入模板</el-button
          ><el-button :icon="Upload" @click="openImport">Excel 导入</el-button
          ><el-button type="primary" :icon="Plus" @click="addMember">新增成员</el-button>
        </div>
      </div>
      <div class="filters">
        <el-select v-model="queryMode" data-testid="query-mode" aria-label="查询模式" @change="switchMode">
          <el-option label="普通管理查询" value="admin" /><el-option label="政治身份查询（可导出）" value="identity" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          :disabled="queryMode === 'identity'"
          clearable
          placeholder="姓名 / 用户名 / 学号 / 手机 / 邮箱"
          @keyup.enter="search"
        />
        <el-select v-model="filters.branchId" :disabled="queryMode === 'identity'" clearable placeholder="全部支部"
          ><el-option v-for="branch in branches" :key="branch.id" :label="branch.branchName" :value="branch.id"
        /></el-select>
        <el-select
          v-if="queryMode === 'identity'"
          v-model="filters.identityId"
          data-testid="identity-filter"
          clearable
          placeholder="全部政治身份"
          :disabled="identityState !== 'ready'"
        >
          <el-option
            v-for="identity in identities"
            :key="identity.id"
            :label="identity.identityName"
            :value="identity.id"
          />
        </el-select>
        <el-select v-model="filters.status" :clearable="queryMode === 'admin'" placeholder="全部状态"
          ><el-option label="启用" :value="1" /><el-option label="停用" :value="2"
        /></el-select>
        <el-button type="primary" @click="search">搜索</el-button><el-button @click="resetFilters">重置筛选</el-button>
      </div>
      <p class="scope-hint">
        {{
          queryMode === "admin"
            ? "普通管理查询支持关键词或支部单独查询及全部状态；后端组合查询存在范围缺陷，暂不支持关键词与支部同时查询。此模式不能导出；请显式切换到政治身份查询后确认范围。"
            : `政治身份查询仅支持身份与启用/停用状态，不支持关键词或支部组合。当前已应用：${appliedIdentity.identityId ? identities.find((i) => i.id === appliedIdentity.identityId)?.identityName || "身份 ID " + appliedIdentity.identityId : "全部政治身份"}，${appliedIdentity.status === 1 ? "启用" : "停用"}。导出全部匹配记录，非当前页；文件仅含学号、姓名、手机号、邮箱、学院、年级、专业、班级、备注。`
        }}
      </p>
      <el-alert v-if="exportFailure" :title="exportFailure" type="error" :closable="false" />
      <el-button
        v-if="queryMode === 'admin'"
        link
        type="primary"
        @click="
          queryMode = 'identity';
          switchMode();
        "
        >切换到可导出范围（清理条件）</el-button
      >
      <el-alert
        v-if="identityState === 'error'"
        title="政治身份字典加载失败，基础成员列表仍可使用"
        type="warning"
        :closable="false"
        ><el-button @click="loadIdentities">重试身份字典</el-button></el-alert
      >
      <p v-if="identityState === 'ready' && !identities.length">暂无政治身份字典</p>
      <el-alert
        v-if="branchError || roleError"
        title="支部或角色选项加载失败，现有关联保持不变"
        type="warning"
        :closable="false"
        ><el-button @click="loadOptions">重试关联选项</el-button></el-alert
      >
      <div class="batch-actions">
        <span>仅选择当前页，已选 {{ selected.length }} 人（上限 200）</span>
        <el-button :disabled="!selected.length || batchBusy" @click="runBatch('enable')">批量启用</el-button>
        <el-button :disabled="!selected.length || batchBusy" @click="runBatch('disable')">批量停用</el-button>
        <el-select
          v-model="batchBranchId"
          placeholder="批量目标支部"
          aria-label="批量目标支部"
          :disabled="branchError || batchBusy"
          ><el-option v-for="branch in branches" :key="branch.id" :label="branch.branchName" :value="branch.id"
        /></el-select>
        <el-button
          :disabled="!selected.length || batchBusy || !batchBranchId || branchError"
          @click="runBatch('branch')"
          >批量调整支部</el-button
        >
      </div>
      <section v-if="batchReport || batchFailure" data-testid="batch-report" class="batch-report" aria-live="polite">
        <el-alert v-if="batchFailure" :title="batchFailure" type="error" :closable="false" />
        <template v-if="batchReport">
          <el-alert
            :title="
              batchReport.failCount === 0
                ? '批量操作全部成功'
                : batchReport.successCount
                  ? '批量操作部分成功'
                  : '批量操作全部失败'
            "
            :type="batchReport.failCount === 0 ? 'success' : batchReport.successCount ? 'warning' : 'error'"
            :closable="false"
          />
          <p>
            共 {{ batchReport.total }} 人，成功 {{ batchReport.successCount }} 人，失败
            {{ batchReport.failCount }} 人。已生效项目不会整体回滚。
          </p>
          <ul>
            <li v-for="error in batchReport.errors" :key="error.id">
              成员 ID {{ error.id }}（{{ batchNames.get(error.id) || "名称不可用" }}）：{{ error.reason }}
            </li>
          </ul>
        </template>
      </section>
      <el-alert v-if="loadError" title="成员数据加载失败" type="error" show-icon :closable="false" class="load-error"
        ><template #default><el-button link type="primary" @click="loadMembers">重试</el-button></template></el-alert
      >
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        stripe
        style="width: 100%"
        class="members-table"
        empty-text="暂无成员数据"
        @selection-change="selected = $event"
      >
        <el-table-column type="selection" width="48" :selectable="() => !batchBusy && !loading" />
        <el-table-column prop="studentId" label="学号" min-width="120" /><el-table-column
          prop="realName"
          label="姓名"
          min-width="100"
        /><el-table-column prop="username" label="登录账号" min-width="120" />
        <el-table-column prop="college" label="学院" min-width="130" /><el-table-column
          prop="major"
          label="专业"
          min-width="130"
        /><el-table-column prop="className" label="班级" min-width="110" /><el-table-column
          prop="branchName"
          label="所属支部"
          min-width="170"
          ><template #default="{ row }">{{ branchLabel(row) }}</template></el-table-column
        >
        <el-table-column label="政治身份" min-width="130"
          ><template #default="{ row }">{{ identityLabel(row) }}</template></el-table-column
        >
        <el-table-column label="角色" min-width="110"
          ><template #default="{ row }">{{ roleLabel(row.role) }}</template></el-table-column
        >
        <el-table-column label="状态" width="80"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{
              row.status === 1 ? "启用" : "停用"
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          label="创建时间"
          width="172"
          class-name="created-at-column"
          label-class-name="created-at-header"
          ><template #default="{ row }">{{ dateLabel(row.createTime) }}</template></el-table-column
        >
        <el-table-column label="操作" width="180" fixed="right"
          ><template #default="{ row }"
            ><div class="row-actions">
              <el-button link type="primary" @click="viewMember(row)">查看</el-button
              ><el-button link type="primary" @click="editMember(row)">编辑</el-button
              ><el-button link :type="row.status === 1 ? 'danger' : 'success'" @click="changeStatus(row)">{{
                row.status === 1 ? "停用" : "启用"
              }}</el-button>
            </div></template
          ></el-table-column
        >
      </el-table>
      <el-pagination
        v-if="total"
        :current-page="page"
        :page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100, 200]"
        layout="sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="changePage"
        @size-change="changeSize"
      />
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editingId === null ? '新增成员' : '编辑成员'"
      width="min(720px, calc(100vw - 24px))"
      :close-on-click-modal="false"
      @update:model-value="!$event && closeForm()"
      @closed="!formVisible && formRef?.clearValidate()"
    >
      <el-form
        ref="formRef"
        v-loading="formLoading"
        :model="form"
        :rules="rules"
        :disabled="saving || formLoading"
        label-width="100px"
        class="member-form"
      >
        <el-form-item label="登录账号" prop="username"
          ><el-input v-model="form.username" :disabled="editingId !== null" placeholder="建议使用学号"
        /></el-form-item>
        <el-form-item label="姓名" prop="realName"
          ><el-input v-model="form.realName" :disabled="editingId !== null" /></el-form-item
        ><el-form-item label="学号" prop="studentId"
          ><el-input v-model="form.studentId" :disabled="editingId !== null"
        /></el-form-item>
        <el-form-item label="性别"
          ><el-select v-model="form.gender" clearable
            ><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select
        ></el-form-item>
        <el-form-item label="学院"><el-input v-model="form.college" :disabled="editingId !== null" /></el-form-item
        ><el-form-item label="年级"><el-input v-model="form.grade" placeholder="例如 2024" /></el-form-item>
        <el-form-item label="专业"><el-input v-model="form.major" /></el-form-item
        ><el-form-item label="班级"><el-input v-model="form.className" :disabled="editingId !== null" /></el-form-item>
        <el-form-item label="所属支部"
          ><el-select
            v-model="form.branchId"
            :clearable="editingId === null"
            :disabled="branchError"
            :placeholder="editingId === null ? '请选择' : '未分配（可保持或分配）'"
            ><el-option
              v-if="form.branchId && !branches.some((b) => b.id === form.branchId)"
              :value="form.branchId"
              :label="original?.branchName || '支部名称不可用（保留原关联）'"
              disabled /><el-option
              v-for="branch in branches"
              :key="branch.id"
              :label="branch.branchName"
              :value="branch.id" /></el-select
        ></el-form-item>
        <el-form-item label="角色"
          ><el-select
            v-model="form.roleId"
            :clearable="editingId === null"
            :disabled="roleError"
            :placeholder="editingId === null ? '默认普通成员' : '未关联角色（保持原值）'"
            ><el-option
              v-if="form.roleId && !roles.some((r) => r.id === form.roleId)"
              :value="form.roleId"
              :label="roleLabel(original?.role || null) + '（保留原关联）'"
              disabled /><el-option
              v-for="role in roles"
              :key="role.id"
              :label="roleLabel(role.roleCode)"
              :value="role.id" /></el-select
        ></el-form-item>
        <el-form-item label="手机号" prop="phone"><el-input v-model="form.phone" /></el-form-item
        ><el-form-item label="邮箱" prop="email"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="紧急联系人"><el-input v-model="form.contactPerson" /></el-form-item
        ><el-form-item label="备注" class="full-row"
          ><el-input v-model="form.remark" type="textarea" :rows="2"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="closeForm">取消</el-button
        ><el-button type="primary" :disabled="formLoading" :loading="saving" @click="saveMember"
          >保存</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="成员详情"
      width="min(620px, calc(100vw - 24px))"
      @update:model-value="!$event && detailEpoch++"
      ><el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="姓名">{{ detail.realName || "—" }}</el-descriptions-item
        ><el-descriptions-item label="学号">{{ detail.studentId || "—" }}</el-descriptions-item>
        <el-descriptions-item label="登录账号">{{ detail.username }}</el-descriptions-item
        ><el-descriptions-item label="角色">{{ roleLabel(detail.role) }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ detail.gender || "—" }}</el-descriptions-item
        ><el-descriptions-item label="状态">{{ detail.status === 1 ? "启用" : "停用" }}</el-descriptions-item>
        <el-descriptions-item label="学院">{{ detail.college || "—" }}</el-descriptions-item
        ><el-descriptions-item label="年级">{{ detail.grade || "—" }}</el-descriptions-item>
        <el-descriptions-item label="专业">{{ detail.major || "—" }}</el-descriptions-item
        ><el-descriptions-item label="班级">{{ detail.className || "—" }}</el-descriptions-item>
        <el-descriptions-item label="政治身份">{{ identityLabel(detail) }}</el-descriptions-item>
        <el-descriptions-item label="所属支部">{{ branchLabel(detail) }}</el-descriptions-item
        ><el-descriptions-item label="手机号">{{ detail.phone || "—" }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ detail.email || "—" }}</el-descriptions-item
        ><el-descriptions-item label="紧急联系人">{{ detail.contactPerson || "—" }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detail.remark || "—" }}</el-descriptions-item>
      </el-descriptions></el-dialog
    >

    <el-dialog
      v-model="importVisible"
      title="Excel 导入成员"
      width="min(680px, calc(100vw - 32px))"
      :close-on-click-modal="!importing"
      :close-on-press-escape="!importing"
      :show-close="!importing"
      @opened="scrollImportTop"
      @closed="onImportClosed"
    >
      <div ref="importDialogBody" class="import-dialog">
        <el-alert title="填写规则" type="info" show-icon :closable="false" class="import-rule">
          <template #default>
            <ul class="rule-list">
              <li>
                填写所属支部前，请先在<button
                  type="button"
                  class="rule-link"
                  :disabled="importing"
                  @click="goToBranches"
                >
                  支部管理</button
                >中维护对应支部。
              </li>
              <li>填写时须匹配系统中正常支部的名称；首尾空格由服务端处理，名称不一致的行会逐行失败。</li>
              <li>所属支部可以留空，留空表示未分配支部。</li>
              <li>模板自带的「张三、李四」是示例行，导入前必须删除，否则会按行失败。</li>
              <li>重复的账号/学号、手机号或邮箱会按行失败，不会覆盖已有成员。</li>
              <li>部分成功后重新上传整个文件时，已成功的行可能因重复再次失败。</li>
            </ul>
          </template>
        </el-alert>

        <section class="import-branches">
          <div class="import-branches-header">
            <strong>可匹配的正常支部</strong>
            <span class="import-branches-state">{{ importBranchStateText }}</span>
            <el-button
              link
              type="primary"
              :disabled="importing"
              :loading="importBranchState === 'loading'"
              @click="loadImportBranches"
            >
              刷新
            </el-button>
          </div>
          <el-input
            v-model="importBranchKeyword"
            clearable
            placeholder="按名称筛选支部（仅本地筛选，不代表文件已匹配）"
            :disabled="importing || importBranchState !== 'ready'"
            class="import-branch-filter"
          />
          <el-alert
            v-if="importBranchState === 'error'"
            title="暂时无法核对支部名称"
            type="error"
            show-icon
            :closable="false"
            class="import-branch-alert"
          >
            <template #default>
              <p>
                支部选项加载失败，无法确认系统内的正常支部。请点击「刷新」重试；这不影响提交，所属支部是否有效仍由服务端判定。
              </p>
              <el-button link type="primary" :disabled="importing" @click="loadImportBranches">重试</el-button>
            </template>
          </el-alert>
          <el-alert
            v-else-if="importBranchState === 'empty'"
            title="系统中暂无正常状态的支部"
            type="warning"
            show-icon
            :closable="false"
            class="import-branch-alert"
          >
            <template #default>
              <p>
                填写了支部名称的行会因无法匹配而失败。可先到支部管理维护支部，也可以把所属支部留空后导入（成员将未分配支部）。
              </p>
            </template>
          </el-alert>
          <el-skeleton v-if="importBranchState === 'loading'" :rows="2" animated class="import-branch-alert" />
          <p v-else-if="importBranchState === 'ready' && !importBranchOptions.length" class="import-branch-empty">
            没有符合当前筛选条件的支部名称。
          </p>
          <ul v-else-if="importBranchState === 'ready'" class="import-branch-list" data-testid="import-branch-list">
            <li v-for="branch in importBranchOptions" :key="branch.id">{{ branch.branchName }}</li>
          </ul>
        </section>

        <section class="import-submit">
          <el-button :icon="Download" :disabled="importing" @click="downloadTemplate">下载导入模板</el-button>
          <input
            ref="importFileInput"
            class="file-input"
            data-testid="import-file-input"
            type="file"
            accept=".xlsx"
            :disabled="importing"
            @change="chooseFile"
          />
          <p v-if="importFile" class="import-file-name">已选择：{{ importFile.name }}</p>
          <p v-else class="import-file-name">请选择 .xlsx 文件，大小不超过 10 MB。</p>
        </section>

        <el-progress v-if="importing" :percentage="importProgress" class="progress" />
        <p v-if="importing" class="import-waiting" data-testid="import-waiting">
          {{
            importProgress >= 100
              ? "文件已上传，正在等待服务端处理，请勿关闭弹窗或重复提交。"
              : "正在上传文件，服务端尚未返回处理结果；完成前不会显示导入结果。"
          }}
        </p>

        <div v-if="importFailure || (importResult && importOutcome)" ref="importResultAnchor" class="import-outcome">
          <el-alert v-if="importFailure" :title="importFailure" type="error" show-icon :closable="false" />
          <template v-else-if="importResult && importOutcome">
            <el-alert
              :title="`${importOutcome.title}：${importSummary}`"
              :type="importOutcome.type"
              show-icon
              :closable="false"
              data-testid="import-result-summary"
            />
            <p v-if="importResult.successCount > 0" class="import-readback-hint">
              已成功的成员已写入服务端，列表已回到第一页并保留当前筛选条件。
            </p>
            <el-alert
              v-if="loadError && importResult.successCount > 0"
              title="成员列表回读失败，导入结果仍然有效"
              type="warning"
              show-icon
              :closable="false"
              class="import-readback-error"
            >
              <template #default>
                <p>导入结果不受列表刷新失败影响，请稍后在列表重试或重新搜索确认。</p>
              </template>
            </el-alert>
            <template v-if="importResult.errors?.length"
              ><el-table :data="importResult.errors" max-height="240" stripe class="import-error-table"
                ><el-table-column prop="row" label="Excel 行号" width="110" /><el-table-column
                  prop="reason"
                  label="失败原因" /></el-table
              ><el-button :icon="Download" @click="downloadErrors">下载错误报告</el-button></template
            >
          </template>
        </div>
      </div>
      <template #footer
        ><el-button :disabled="importing" @click="importVisible = false">关闭</el-button
        ><el-button type="primary" :loading="importing" :disabled="importing" @click="submitImport"
          >开始导入</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.members-page {
  padding: 24px 0 40px;
}
.members-page.page-container {
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
.filters,
.batch-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.batch-actions {
  margin: 16px 0;
}
.batch-actions .el-select {
  width: 220px;
  max-width: 100%;
}
.batch-actions .el-button + .el-button {
  margin-left: 0;
}
.batch-report {
  margin: 16px 0;
  overflow-wrap: anywhere;
}
.scope-hint {
  color: var(--text-secondary);
  line-height: 1.7;
  overflow-wrap: anywhere;
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
.filters .el-select {
  width: 170px;
}
.load-error {
  margin-bottom: 16px;
}
.members-table :deep(.created-at-column .cell),
.members-table :deep(.created-at-header .cell) {
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
  flex-wrap: wrap;
  gap: 8px;
}
.member-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 16px;
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}
.members-page :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}
.member-form .el-select {
  width: 100%;
}
.full-row {
  grid-column: 1 / -1;
}
.import-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 窄屏或长支部名称时只滚动内容区，保留底部提交按钮可见。 */
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding-right: 4px;
}
/* 禁止子项被压缩，否则 el-alert 会裁掉文字而不是让内容区滚动。 */
.import-dialog > * {
  flex: 0 0 auto;
}
.rule-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
.rule-link {
  display: inline;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--party-red);
  cursor: pointer;
  text-decoration: underline;
}
.rule-link:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}
.import-branches {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  padding: 12px 14px;
}
.import-branches-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.import-branches-state {
  color: var(--text-secondary);
  font-size: 13px;
}
.import-branch-filter {
  margin-bottom: 10px;
}
.import-branch-list {
  margin: 0;
  padding: 0 0 0 18px;
  max-height: 160px;
  overflow-y: auto;
  line-height: 1.8;
  word-break: break-all;
}
.import-branch-alert {
  margin-top: 4px;
}
.import-branch-empty {
  color: var(--text-secondary);
  font-size: 13px;
}
.import-submit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.import-file-name {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0;
  word-break: break-all;
}
.import-waiting,
.import-readback-hint {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  margin: 8px 0 0;
}
.import-readback-error {
  margin-top: 10px;
}
.file-input {
  display: block;
  margin: 0;
  max-width: 100%;
}
.progress,
.import-outcome {
  margin-top: 0;
}
.import-outcome {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.import-outcome .el-table {
  margin: 0;
}
.import-error-table {
  width: 100%;
}
@media (max-width: 768px) {
  .members-page.page-container {
    width: 100%;
  }
  .member-form {
    grid-template-columns: 1fr;
  }
  .filters .el-input,
  .filters .el-select {
    width: 100%;
  }
}
</style>
