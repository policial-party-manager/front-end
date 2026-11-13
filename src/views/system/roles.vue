<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getRole,
  listPermissionNames,
  listRoles,
  updateRole,
  type RoleSaveRequest,
  type RoleVo,
} from "@/api/roles";

const store = useAppStore();
// 与 members.vue 口径一致：角色 + token 双重判断，缺任一条都不发管理请求。
const canManage = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);
const rows = ref<RoleVo[]>([]);
const loading = ref(false);
const loadError = ref(false);
const filters = reactive({ keyword: "" });

/** 角色列表接口不分页、不支持 keyword，搜索为前端本地过滤。 */
const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase();
  if (!keyword) return rows.value;
  return rows.value.filter(
    (row) => row.roleCode.toLowerCase().includes(keyword) || (row.description || "").toLowerCase().includes(keyword),
  );
});
const emptyText = computed(() => (filters.keyword.trim() ? "没有匹配的角色" : "暂无角色数据"));

let disposed = false;
function current(snapshot: SessionIdentitySnapshot) {
  return !disposed && canManage.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;
/** 回读列表；返回是否成功，供写操作区分「写入失败」与「写入成功但回读失败」。 */
async function loadRoles(): Promise<boolean> {
  if (!canManage.value || disposed) return false;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = false;
  try {
    const result = await listRoles();
    if (sequence !== requestSequence || !current(snapshot)) return false;
    rows.value = Array.isArray(result) ? result : [];
    return true;
  } catch {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) {
      rows.value = [];
      loadError.value = true;
    }
    return false;
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

/** 权限点字典的三种状态：加载中、可用、失败；不能再用数组长度冒充加载状态。 */
const permissionNames = ref<string[]>([]);
const permDictState = ref<"loading" | "ready" | "error">("loading");
let dictSequence = 0;
async function loadPermissionNames(): Promise<boolean> {
  if (!canManage.value || disposed) return false;
  const sequence = ++dictSequence;
  const snapshot = captureSessionIdentity();
  permDictState.value = "loading";
  try {
    const result = await listPermissionNames();
    if (sequence !== dictSequence || !current(snapshot)) return false;
    if (!Array.isArray(result)) throw new Error("权限点字典响应格式不正确");
    permissionNames.value = result.filter((name): name is string => typeof name === "string" && !!name.trim());
    permDictState.value = "ready";
    return true;
  } catch {
    if (sequence === dictSequence && isSessionIdentityCurrent(snapshot)) {
      permissionNames.value = [];
      permDictState.value = "error";
    }
    return false;
  }
}

onMounted(() => {
  if (!canManage.value) return;
  void loadRoles();
  void loadPermissionNames();
});
watch([canManage, sessionIdentity], () => {
  // 退出、换号或权限变化：清除上一个会话的列表、字典、详情、表单与权限选择，并使在途回调失效。
  invalidate();
  if (canManage.value) {
    void loadRoles();
    void loadPermissionNames();
  }
});
onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});

// ============ 新增 / 编辑 ============
function emptyForm(): RoleSaveRequest {
  return { roleCode: "", description: "" };
}
const form = reactive<RoleSaveRequest>(emptyForm());
const formRef = ref<FormInstance>();
const formVisible = ref(false);
const editingId = ref<number | null>(null);
const formLoading = ref(false);
const saving = ref(false);
let formEpoch = 0;
/** roleCode 仅新增时必填且提交；编辑态锁定且不发送，由后端沿用原名。 */
const rules = computed<FormRules>(() => ({
  roleCode:
    editingId.value === null
      ? [
          {
            // 校验 trim 后的值：纯空格不能通过，避免把 "   " 提交给后端。
            validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) =>
              typeof value === "string" && value.trim() ? callback() : callback(new Error("请输入角色编码")),
            trigger: "blur",
          },
        ]
      : [],
}));
const formTitle = computed(() => (editingId.value === null ? "新增角色" : "编辑角色"));

function invalidateForm(): void {
  formEpoch++;
  formVisible.value = false;
  saving.value = false;
  formLoading.value = false;
  editingId.value = null;
  Object.assign(form, emptyForm());
  formRef.value?.clearValidate();
}
function addRole(): void {
  if (!canManage.value || saving.value) return;
  invalidateForm();
  formVisible.value = true;
}
async function editRole(row: RoleVo): Promise<void> {
  if (!canManage.value || saving.value || formLoading.value) return;
  invalidateForm();
  const epoch = formEpoch;
  const snapshot = captureSessionIdentity();
  editingId.value = row.id;
  formVisible.value = true;
  formLoading.value = true;
  try {
    const value = await getRole(row.id);
    if (epoch !== formEpoch || !formVisible.value || !current(snapshot)) return;
    editingId.value = value.id ?? row.id;
    form.roleCode = value.roleCode;
    form.description = value.description || "";
  } catch {
    // 详情失败不展示半成品表单，避免用列表旧快照发起更新。
    if (epoch === formEpoch && current(snapshot)) invalidateForm();
  } finally {
    if (epoch === formEpoch && isSessionIdentityCurrent(snapshot)) formLoading.value = false;
  }
}
function closeForm(): void {
  if (saving.value) return; // 写入期间不允许关闭，避免丢弃已在途的结果
  invalidateForm();
}
async function saveRole(): Promise<void> {
  if (saving.value || formLoading.value || !canManage.value) return;
  const epoch = formEpoch;
  const snapshot = captureSessionIdentity();
  // 先同步加锁再 await 校验：双击只会发出一次请求，校验失败时由 finally 释放。
  saving.value = true;
  try {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid || epoch !== formEpoch || !current(snapshot)) return;
    const isCreate = editingId.value === null;
    const description = (form.description || "").trim();
    if (isCreate) {
      const roleCode = (form.roleCode || "").trim();
      if (!roleCode) {
        ElMessage.warning("请输入角色编码");
        return;
      }
      // 新增只提交编码与描述，权限点走独立端点，不夹带权限。
      await createRole({ roleCode, description });
    } else {
      // 编辑不发送 roleCode（后端沿用原名），也不发送 permissionNames（后端会忽略）。
      await updateRole(editingId.value as number, { description });
    }
    if (epoch !== formEpoch || !current(snapshot)) return;
    ElMessage.success(isCreate ? "角色已新增" : "角色已更新");
    invalidateForm();
    const readback = await loadRoles();
    // 写入已经成功，回读失败只是列表陈旧，不能把它当成保存失败。
    if (!readback && current(snapshot))
      ElMessage.warning("角色已保存，但列表回读失败：请点击列表上方的「重试」确认最新数据");
  } catch {
    // 请求层已提示具体错误；保留表单内容与弹窗，便于修正后重试。
  } finally {
    if (epoch === formEpoch && isSessionIdentityCurrent(snapshot)) saving.value = false;
  }
}

// ============ 权限分配 ============
const permVisible = ref(false);
const permTarget = ref<{ id: number; roleCode: string } | null>(null);
const permSelection = ref<string[]>([]);
const permOriginal = ref<string[]>([]);
/** 服务端已有、但不在字典里的权限名；保留在提交结果中，不静默丢弃。 */
const permUnknown = ref<string[]>([]);
const permLoading = ref(false);
const permLoadError = ref(false);
const permSaving = ref(false);
let permEpoch = 0;

function invalidatePermissions(): void {
  permEpoch++;
  permVisible.value = false;
  permTarget.value = null;
  permSelection.value = [];
  permOriginal.value = [];
  permUnknown.value = [];
  permLoading.value = false;
  permLoadError.value = false;
  permSaving.value = false;
}
async function openPermissions(row: RoleVo): Promise<void> {
  if (!canManage.value || permSaving.value || saving.value) return;
  invalidatePermissions();
  const epoch = permEpoch;
  const snapshot = captureSessionIdentity();
  permTarget.value = { id: row.id, roleCode: row.roleCode };
  permVisible.value = true;
  permLoading.value = true;
  // 字典与详情并行加载；字典失败时禁止保存，详情失败时不展示可编辑的旧快照。
  const [dictReady, detail] = await Promise.allSettled([ensureDictionary(), getRole(row.id)]);
  if (epoch !== permEpoch || !permVisible.value || !current(snapshot)) return;
  permLoading.value = false;
  const dictOk = dictReady.status === "fulfilled" && dictReady.value === true;
  if (detail.status !== "fulfilled") {
    permLoadError.value = true;
    return;
  }
  const value = detail.value;
  const assigned = Array.isArray(value.permissions)
    ? value.permissions.filter((name): name is string => typeof name === "string")
    : [];
  permOriginal.value = [...assigned];
  permSelection.value = [...assigned];
  permUnknown.value = dictOk ? assigned.filter((name) => !permissionNames.value.includes(name)) : [];
}

/** 字典只在未就绪时重新拉取，返回是否可用。 */
async function ensureDictionary(): Promise<boolean> {
  if (permDictState.value === "ready") return true;
  return loadPermissionNames();
}
async function retryDictionary(): Promise<void> {
  if (!canManage.value) return;
  const target = permTarget.value;
  const snapshot = captureSessionIdentity();
  const epoch = permEpoch;
  const ready = await loadPermissionNames();
  if (epoch !== permEpoch || !permVisible.value || !current(snapshot) || !target) return;
  // 字典补齐后重新判定字典外权限，避免把合法权限误标成未知。
  permUnknown.value = ready ? permOriginal.value.filter((name) => !permissionNames.value.includes(name)) : [];
}

/** 提交结果 = 勾选值 + 字典外的既有权限（这些项没有对应勾选框，不能被悄悄清掉）。 */
function permissionPayload(): string[] {
  const known = permSelection.value.filter((name) => permissionNames.value.includes(name));
  return Array.from(new Set([...known, ...permUnknown.value]));
}

async function savePermissions(): Promise<void> {
  if (permSaving.value || permLoading.value || !canManage.value) return;
  const target = permTarget.value;
  if (!target) return;
  const epoch = permEpoch;
  const snapshot = captureSessionIdentity();
  if (permDictState.value !== "ready") {
    ElMessage.warning("权限点字典未加载成功，此时保存会覆盖为不完整结果，已阻止提交");
    return;
  }
  if (permLoadError.value) {
    ElMessage.warning("尚未成功读取该角色的当前权限，已阻止提交以免误覆盖");
    return;
  }
  const payload = permissionPayload();
  const clearing = permOriginal.value.length > 0 && payload.length === 0;
  if (clearing) {
    // 全量覆盖语义下，清空就是删除该角色的全部权限点，必须显式确认。
    try {
      await ElMessageBox.confirm(
        `确定清空角色「${target.roleCode}」的全部 ${permOriginal.value.length} 项权限吗？保存后该角色将不再关联任何权限点。`,
        "清空权限确认",
        { type: "warning", confirmButtonText: "确定清空", cancelButtonText: "取消" },
      );
    } catch {
      return;
    }
    if (epoch !== permEpoch || !permVisible.value || !current(snapshot)) return;
  }
  permSaving.value = true;
  try {
    await assignRolePermissions(target.id, payload);
    if (epoch !== permEpoch || !current(snapshot)) return;
    ElMessage.success("权限已保存");
    invalidatePermissions();
    const readback = await loadRoles();
    if (!readback && current(snapshot))
      ElMessage.warning("权限已保存，但角色列表回读失败：请点击列表上方的「重试」确认");
  } catch {
    // 请求层已提示错误；保留勾选结果便于重试。
  } finally {
    if (epoch === permEpoch && isSessionIdentityCurrent(snapshot)) permSaving.value = false;
  }
}

// ============ 删除 ============
const deleting = ref(false);
async function removeRole(row: RoleVo): Promise<void> {
  if (!canManage.value || deleting.value) return;
  const snapshot = captureSessionIdentity();
  const targetId = row.id;
  const inUse = row.userCount > 0;
  try {
    await ElMessageBox.confirm(
      `确定删除角色「${row.roleCode}」吗？该角色当前有 ${row.userCount} 个用户使用。删除后不可恢复。`,
      inUse ? "该角色仍有用户使用，服务端可能拒绝删除" : "删除确认",
      { type: "warning", confirmButtonText: "确定删除", cancelButtonText: "取消" },
    );
  } catch {
    return; // 取消不发送任何删除请求
  }
  // 确认期间可能换号、失权或列表已变：再次核对后才真正发送删除。
  if (!current(snapshot)) return;
  if (!rows.value.some((item) => item.id === targetId)) return;
  deleting.value = true;
  try {
    await deleteRole(targetId);
    if (!current(snapshot)) return;
    ElMessage.success("已删除");
    await loadRoles();
  } catch {
    // 被占用等拒绝按服务端真实结果提示；不先移除行，也不做本地假设。
  } finally {
    if (isSessionIdentityCurrent(snapshot)) deleting.value = false;
  }
}

/** 会话变化或卸载时让所有页面级操作失效。 */
function invalidate(): void {
  requestSequence++;
  dictSequence++;
  ElMessageBox.close();
  invalidateForm();
  invalidatePermissions();
  deleting.value = false;
  rows.value = [];
  loading.value = false;
  loadError.value = false;
  permissionNames.value = [];
  permDictState.value = "loading";
}
</script>

<template>
  <div class="roles-page page-container">
    <div class="page-header">
      <div>
        <h2 class="section-title">角色管理</h2>
        <p>维护系统角色及其权限点映射。</p>
      </div>
      <router-link class="logs-link" to="/system/logs">操作日志 →</router-link>
    </div>
    <el-alert v-if="!sessionHasAccessToken" title="角色管理需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌。请使用超级管理员账号登录后再访问角色管理。</p>
        <el-button type="primary" @click="$router.push('/login')">前往登录</el-button>
      </template>
    </el-alert>
    <el-alert
      v-else-if="!canManage"
      title="当前账号没有角色管理权限，请使用超级管理员账号登录"
      type="warning"
      show-icon
      :closable="false"
    />
    <div v-else class="content-card">
      <div class="card-header">
        <div>
          <strong>角色列表</strong><span class="total-label">共 {{ filteredRows.length }} 条</span>
        </div>
        <div class="actions">
          <el-button type="primary" :icon="Plus" @click="addRole">新增角色</el-button>
        </div>
      </div>
      <div class="filters">
        <el-input v-model="filters.keyword" clearable placeholder="角色编码 / 描述" />
      </div>
      <el-alert v-if="loadError" title="角色数据加载失败" type="error" show-icon :closable="false" class="load-error"
        ><template #default><el-button link type="primary" @click="loadRoles">重试</el-button></template></el-alert
      >
      <el-table
        v-loading="loading"
        :data="filteredRows"
        stripe
        style="width: 100%"
        class="roles-table"
        :empty-text="emptyText"
      >
        <el-table-column prop="roleCode" label="角色编码" min-width="150" />
        <el-table-column label="描述" min-width="200" show-overflow-tooltip
          ><template #default="{ row }">{{ row.description || "—" }}</template></el-table-column
        >
        <el-table-column label="已分配权限" min-width="280"
          ><template #default="{ row }"
            ><div v-if="row.permissions?.length" class="permission-tags">
              <el-tag v-for="name in row.permissions" :key="name" size="small" type="info">{{ name }}</el-tag>
            </div>
            <span v-else>—</span></template
          ></el-table-column
        >
        <el-table-column label="使用人数" width="100"
          ><template #default="{ row }">{{ row.userCount }}</template></el-table-column
        >
        <el-table-column label="操作" width="210" fixed="right"
          ><template #default="{ row }"
            ><div class="row-actions">
              <el-button link type="primary" :disabled="saving || formLoading" @click="editRole(row)">编辑</el-button
              ><el-button link type="primary" :disabled="permSaving || saving" @click="openPermissions(row)"
                >分配权限</el-button
              ><el-button link type="danger" :disabled="deleting" @click="removeRole(row)">删除</el-button>
            </div></template
          ></el-table-column
        >
      </el-table>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="formTitle"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!saving && !formLoading"
      :before-close="(done: () => void) => (saving ? undefined : done())"
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" v-loading="formLoading" :model="form" :rules="rules" label-width="100px" class="role-form">
        <!-- 编辑态锁定角色编码：后端鉴权依赖 roleCode（如 AdminController 的 hasRole('SUPER_ADMIN')），
             改名风险大于收益，编辑只允许改描述；新增时仍可填写。 -->
        <el-form-item label="角色编码" prop="roleCode"
          ><el-input v-model="form.roleCode" :disabled="editingId !== null" placeholder="例如 branch_admin"
        /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer
        ><el-button :disabled="saving" @click="closeForm">取消</el-button
        ><el-button type="primary" :disabled="formLoading" :loading="saving" @click="saveRole"
          >保存</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="permVisible"
      title="分配角色权限"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!permSaving"
      :before-close="(done: () => void) => (permSaving ? undefined : done())"
    >
      <p class="perm-target">
        角色：<strong>{{ permTarget?.roleCode }}</strong>
      </p>
      <el-alert
        title="权限点用于维护角色-权限映射，当前后端为角色级鉴权，修改暂不影响接口放行"
        type="info"
        show-icon
        :closable="false"
        class="perm-note"
      />
      <div v-loading="permLoading" class="perm-body">
        <el-alert v-if="permLoadError" title="未能读取该角色的当前权限" type="error" show-icon :closable="false">
          <template #default>
            <p>为避免用旧快照覆盖服务端权限，本次已阻止保存。请关闭弹窗后重新打开。</p>
          </template>
        </el-alert>
        <template v-else-if="!permLoading">
          <el-alert
            v-if="permDictState === 'error'"
            title="权限点字典加载失败，无法安全保存"
            type="warning"
            show-icon
            :closable="false"
            class="perm-dict-alert"
          >
            <template #default>
              <p>全量覆盖语义下，字典缺失会把勾选不到的权限点清空，因此禁用保存。</p>
              <el-button link type="primary" @click="retryDictionary">重试加载</el-button>
            </template>
          </el-alert>
          <el-checkbox-group v-if="permDictState === 'ready'" v-model="permSelection" class="perm-group">
            <el-checkbox v-for="name in permissionNames" :key="name" :value="name">{{ name }}</el-checkbox>
          </el-checkbox-group>
          <p v-else-if="permDictState === 'loading'" class="perm-hint">权限点字典加载中…</p>
          <el-alert
            v-if="permUnknown.length"
            title="当前角色包含字典外的权限点"
            type="warning"
            show-icon
            :closable="false"
            class="perm-dict-alert"
          >
            <template #default>
              <p>以下权限点不在服务端字典中，已原样保留，不会被静默丢弃：</p>
              <p class="perm-unknown">{{ permUnknown.join("、") }}</p>
            </template>
          </el-alert>
        </template>
      </div>
      <p class="perm-hint">保存将以当前勾选结果全量覆盖该角色的权限；清空勾选等于移除该角色全部权限点。</p>
      <template #footer
        ><el-button :disabled="permSaving" @click="permVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="permSaving"
          :disabled="permLoading || permLoadError || permDictState !== 'ready'"
          @click="savePermissions"
          >保存</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.roles-page {
  padding: 24px 0 40px;
}
.roles-page.page-container {
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
.logs-link {
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
.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
.role-form {
  padding-right: 8px;
}
.perm-target {
  margin-bottom: 16px;
}
.perm-note {
  margin-bottom: 18px;
}
.perm-body {
  min-height: 60px;
}
.perm-dict-alert {
  margin-bottom: 12px;
}
.perm-unknown {
  margin-top: 6px;
  word-break: break-all;
}
.perm-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
}
.perm-group :deep(.el-checkbox) {
  width: 50%;
  margin-right: 0;
}
.perm-hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 16px;
}
@media (max-width: 768px) {
  .roles-page.page-container {
    width: 100%;
  }
  .page-header {
    flex-direction: column;
  }
  .filters .el-input {
    width: 100%;
  }
  .perm-group :deep(.el-checkbox) {
    width: 100%;
  }
}
</style>
