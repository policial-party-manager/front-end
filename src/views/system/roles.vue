<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import { sessionHasAccessToken } from "@/utils/session";
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
// 与 members.vue 口径一致：角色 + token 双重判断
// （branches.vue 用纯 isSuperAdmin，本页采用更保守的写法）
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

let requestSequence = 0;
async function loadRoles() {
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = false;
  try {
    const result = await listRoles();
    if (sequence !== requestSequence) return;
    rows.value = result;
  } catch {
    if (sequence === requestSequence) {
      rows.value = [];
      loadError.value = true;
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

const permissionNames = ref<string[]>([]);
/** 权限点字典；失败时由请求层提示，调用方按返回值决定是否需要补充提示。 */
async function loadPermissionNames() {
  try {
    permissionNames.value = await listPermissionNames();
    return true;
  } catch {
    return false;
  }
}
async function initPermissionNames() {
  if (!(await loadPermissionNames())) ElMessage.warning("权限点字典加载失败，请刷新页面重试");
}

onMounted(() => {
  if (!canManage.value) return;
  void loadRoles();
  void initPermissionNames();
});
watch(canManage, (enabled) => {
  rows.value = [];
  if (enabled) {
    void loadRoles();
    void initPermissionNames();
  }
});

function emptyForm(): RoleSaveRequest {
  return { roleCode: "", description: "" };
}
const form = reactive<RoleSaveRequest>(emptyForm());
const formRef = ref<FormInstance>();
const formVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
/** roleCode 仅新增时必填且提交；编辑态锁定且不发送，由后端沿用原名。 */
const rules = computed<FormRules>(() => ({
  roleCode: editingId.value === null ? [{ required: true, message: "请输入角色编码", trigger: "blur" }] : [],
}));
function addRole() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
async function editRole(row: RoleVo) {
  try {
    const value = await getRole(row.id);
    editingId.value = row.id;
    Object.assign(form, { roleCode: value.roleCode, description: value.description || "" });
    formVisible.value = true;
  } catch {
    /* 请求层提示错误 */
  }
}
async function saveRole() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return;
  saving.value = true;
  const isCreate = editingId.value === null;
  try {
    const payload: RoleSaveRequest = { description: form.description?.trim() ?? "" };
    // 编辑态 roleCode 由后端沿用原值，前端不发送该字段。
    if (isCreate) payload.roleCode = form.roleCode?.trim();
    // 不传 permissionNames：编辑分支后端会忽略该字段，权限分配走独立弹窗。
    if (isCreate) await createRole(payload);
    else await updateRole(editingId.value as number, payload);
    ElMessage.success(isCreate ? "角色已新增" : "角色已更新");
    formVisible.value = false;
    await loadRoles();
  } catch {
    /* 请求层提示错误；保留表单内容，便于修改后重试 */
  } finally {
    saving.value = false;
  }
}

const permVisible = ref(false);
const permTarget = ref<RoleVo | null>(null);
const permSelection = ref<string[]>([]);
const permSaving = ref(false);
async function openPermissions(row: RoleVo) {
  permTarget.value = row;
  permSelection.value = [...(row.permissions || [])];
  permVisible.value = true;
  if (!permissionNames.value.length) await loadPermissionNames();
}
async function savePermissions() {
  const target = permTarget.value;
  if (!target) return;
  permSaving.value = true;
  try {
    await assignRolePermissions(target.id, permSelection.value);
    ElMessage.success("权限已保存");
    permVisible.value = false;
    await loadRoles();
  } catch {
    /* 请求层提示错误；保留勾选结果，便于重试 */
  } finally {
    permSaving.value = false;
  }
}

async function removeRole(row: RoleVo) {
  const inUse = row.userCount > 0;
  try {
    await ElMessageBox.confirm(
      inUse
        ? `确定删除角色「${row.roleCode}」吗？该角色仍有用户使用，后端可能拒绝本次删除。`
        : `确定删除角色「${row.roleCode}」吗？该操作不可恢复。`,
      inUse ? `该角色当前有 ${row.userCount} 个用户使用` : "删除确认",
      { type: "warning", confirmButtonText: "确定删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  try {
    await deleteRole(row.id);
    ElMessage.success("已删除");
    await loadRoles();
  } catch {
    /* 请求层提示错误 */
  }
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
              <el-button link type="primary" @click="editRole(row)">编辑</el-button
              ><el-button link type="primary" @click="openPermissions(row)">分配权限</el-button
              ><el-button link type="danger" @click="removeRole(row)">删除</el-button>
            </div></template
          ></el-table-column
        >
      </el-table>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editingId === null ? '新增角色' : '编辑角色'"
      width="560px"
      :close-on-click-modal="false"
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="role-form">
        <!-- 编辑态锁定角色编码：后端鉴权依赖 roleCode（如 AdminController 的 hasRole('SUPER_ADMIN')），
             改名风险大于收益，编辑只允许改描述；新增时仍可填写。 -->
        <el-form-item label="角色编码" prop="roleCode"
          ><el-input v-model="form.roleCode" :disabled="editingId !== null" placeholder="例如 branch_admin"
        /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="formVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveRole">保存</el-button></template
      >
    </el-dialog>

    <el-dialog v-model="permVisible" title="分配角色权限" width="560px" :close-on-click-modal="false">
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
      <el-alert v-if="!permissionNames.length" title="权限点字典加载失败" type="warning" show-icon :closable="false"
        ><template #default><el-button link type="primary" @click="loadPermissionNames">重试</el-button></template>
      </el-alert>
      <el-checkbox-group v-else v-model="permSelection" class="perm-group">
        <el-checkbox v-for="name in permissionNames" :key="name" :value="name">{{ name }}</el-checkbox>
      </el-checkbox-group>
      <p class="perm-hint">保存将以当前勾选结果全量覆盖该角色的权限。</p>
      <template #footer
        ><el-button @click="permVisible = false">取消</el-button
        ><el-button type="primary" :loading="permSaving" :disabled="!permissionNames.length" @click="savePermissions"
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
