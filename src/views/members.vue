<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Download, Plus, Upload } from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import { sessionHasAccessToken } from "@/utils/session";
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
  type ImportResult,
  type MemberFilters,
  type UserSaveRequest,
  type UserVo,
} from "@/api/members";

const store = useAppStore();
const canManage = computed(() => store.currentRole === "super_admin" && sessionHasAccessToken.value);
const rows = ref<UserVo[]>([]);
const branches = ref<{ id: number; branchName: string }[]>([]);
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
});
const applied = ref<MemberFilters>({});
const roleLabel = (role: string | null) =>
  ({ super_admin: "超级管理员", branch_admin: "支部管理员", student: "普通成员" })[role || ""] || role || "—";
const dateLabel = (date: string | null) => (date ? date.replace("T", " ").slice(0, 16) : "—");

let requestSequence = 0;
async function loadMembers() {
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = false;
  try {
    const result = await pageMembers({ page: page.value, size: size.value, ...applied.value });
    if (sequence !== requestSequence) return;
    rows.value = result.records;
    total.value = result.total;
  } catch {
    if (sequence === requestSequence) {
      rows.value = [];
      total.value = 0;
      loadError.value = true;
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}
function search() {
  applied.value = { keyword: filters.keyword.trim() || undefined, branchId: filters.branchId, status: filters.status };
  page.value = 1;
  void loadMembers();
}
function reset() {
  filters.keyword = "";
  filters.branchId = undefined;
  filters.status = undefined;
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
  try {
    [branches.value, roles.value] = await Promise.all([listBranches(), listRoles()]);
  } catch {
    ElMessage.warning("支部或角色选项加载失败，请刷新页面重试");
  }
}
onMounted(() => {
  if (canManage.value) {
    void loadMembers();
    void loadOptions();
  }
});
watch(canManage, (enabled) => {
  rows.value = [];
  total.value = 0;
  if (enabled) {
    void loadMembers();
    void loadOptions();
  }
});

const detailVisible = ref(false);
const detail = ref<UserVo | null>(null);
async function viewMember(row: UserVo) {
  try {
    detail.value = await getMember(row.id);
    detailVisible.value = true;
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
const rules: FormRules = {
  username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
  realName: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  studentId: [{ required: true, message: "请输入学号", trigger: "blur" }],
  phone: [{ pattern: /^1\d{10}$/, message: "手机号格式不正确", trigger: "blur" }],
  email: [{ type: "email", message: "邮箱格式不正确", trigger: "blur" }],
};
function addMember() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
async function editMember(row: UserVo) {
  try {
    const value = await getMember(row.id);
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
    /* 请求层提示错误 */
  }
}
async function saveMember() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return;
  saving.value = true;
  try {
    const payload = { ...form };
    if (editingId.value !== null) {
      delete payload.username;
      await updateMember(editingId.value, payload);
    } else await createMember(payload);
    ElMessage.success(editingId.value === null ? "成员添加成功" : "成员信息已更新");
    formVisible.value = false;
    await loadMembers();
  } catch {
    /* 保留表单，便于修改 */
  } finally {
    saving.value = false;
  }
}
async function changeStatus(row: UserVo) {
  const next = row.status === 1 ? 2 : 1;
  const action = next === 2 ? "停用" : "启用";
  try {
    await ElMessageBox.confirm(`确定${action}成员「${row.realName || row.username}」吗？`, `${action}确认`, {
      type: "warning",
      confirmButtonText: `确定${action}`,
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await updateMemberStatus(row.id, next);
    ElMessage.success(`已${action}`);
    await loadMembers();
  } catch {
    /* 请求层提示错误 */
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
  try {
    saveFile(await downloadMemberTemplate(), "用户导入模板.xlsx");
  } catch {
    /* 请求层提示错误 */
  }
}
const importVisible = ref(false);
const importFile = ref<File | null>(null);
const importing = ref(false);
const importProgress = ref(0);
const importResult = ref<ImportResult | null>(null);
function chooseFile(event: Event) {
  importFile.value = (event.target as HTMLInputElement).files?.[0] || null;
  importResult.value = null;
}
async function submitImport() {
  const file = importFile.value;
  if (!file) {
    ElMessage.warning("请选择 Excel 文件");
    return;
  }
  if (!/\.xlsx$/i.test(file.name)) {
    ElMessage.warning("请上传 .xlsx 格式文件");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning("文件不能超过 10 MB");
    return;
  }
  importing.value = true;
  importProgress.value = 0;
  try {
    importResult.value = await importMembers(file, (percent) => {
      importProgress.value = percent;
    });
    ElMessage.success(`导入完成：成功 ${importResult.value.successCount} 条，失败 ${importResult.value.failCount} 条`);
    page.value = 1;
    await loadMembers();
  } catch {
    /* 文件保留供重试 */
  } finally {
    importing.value = false;
  }
}
function downloadErrors() {
  if (!importResult.value) return;
  const lines = [
    "行号,失败原因",
    ...importResult.value.errors.map(({ row, reason }) => `${row},"${reason.replace(/"/g, '""')}"`),
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
          <el-button :icon="Download" @click="downloadTemplate">下载导入模板</el-button
          ><el-button :icon="Upload" @click="importVisible = true">Excel 导入</el-button
          ><el-button type="primary" :icon="Plus" @click="addMember">新增成员</el-button>
        </div>
      </div>
      <div class="filters">
        <el-input
          v-model="filters.keyword"
          clearable
          placeholder="姓名 / 用户名 / 学号 / 手机 / 邮箱"
          @keyup.enter="search"
        />
        <el-select v-model="filters.branchId" clearable placeholder="全部支部"
          ><el-option v-for="branch in branches" :key="branch.id" :label="branch.branchName" :value="branch.id"
        /></el-select>
        <el-select v-model="filters.status" clearable placeholder="全部状态"
          ><el-option label="启用" :value="1" /><el-option label="停用" :value="2"
        /></el-select>
        <el-button type="primary" @click="search">搜索</el-button><el-button @click="reset">重置</el-button>
      </div>
      <el-alert v-if="loadError" title="成员数据加载失败" type="error" show-icon :closable="false" class="load-error"
        ><template #default><el-button link type="primary" @click="loadMembers">重试</el-button></template></el-alert
      >
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
        style="width: 100%"
        class="members-table"
        empty-text="暂无成员数据"
      >
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
        />
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
        :page-sizes="[10, 20, 50]"
        layout="sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="changePage"
        @size-change="changeSize"
      />
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editingId === null ? '新增成员' : '编辑成员'"
      width="720px"
      :close-on-click-modal="false"
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="member-form">
        <el-form-item label="登录账号" prop="username"
          ><el-input v-model="form.username" :disabled="editingId !== null" placeholder="建议使用学号"
        /></el-form-item>
        <el-form-item label="姓名" prop="realName"><el-input v-model="form.realName" /></el-form-item
        ><el-form-item label="学号" prop="studentId"><el-input v-model="form.studentId" /></el-form-item>
        <el-form-item label="性别"
          ><el-select v-model="form.gender" clearable
            ><el-option label="男" value="男" /><el-option label="女" value="女" /></el-select
        ></el-form-item>
        <el-form-item label="学院"><el-input v-model="form.college" /></el-form-item
        ><el-form-item label="年级"><el-input v-model="form.grade" placeholder="例如 2024" /></el-form-item>
        <el-form-item label="专业"><el-input v-model="form.major" /></el-form-item
        ><el-form-item label="班级"><el-input v-model="form.className" /></el-form-item>
        <el-form-item label="所属支部"
          ><el-select v-model="form.branchId" clearable placeholder="请选择"
            ><el-option
              v-for="branch in branches"
              :key="branch.id"
              :label="branch.branchName"
              :value="branch.id" /></el-select
        ></el-form-item>
        <el-form-item label="角色"
          ><el-select v-model="form.roleId" clearable placeholder="默认普通成员"
            ><el-option
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
        ><el-button @click="formVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveMember">保存</el-button></template
      >
    </el-dialog>

    <el-dialog v-model="detailVisible" title="成员详情" width="620px"
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
        <el-descriptions-item label="所属支部">{{ detail.branchName || "—" }}</el-descriptions-item
        ><el-descriptions-item label="手机号">{{ detail.phone || "—" }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ detail.email || "—" }}</el-descriptions-item
        ><el-descriptions-item label="紧急联系人">{{ detail.contactPerson || "—" }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detail.remark || "—" }}</el-descriptions-item>
      </el-descriptions></el-dialog
    >

    <el-dialog
      v-model="importVisible"
      title="Excel 导入成员"
      width="620px"
      :close-on-click-modal="!importing"
      :show-close="!importing"
    >
      <p class="import-hint">请先下载系统模板，填写后上传 .xlsx 文件。导入会逐行处理，失败行可下载错误报告。</p>
      <el-button :icon="Download" @click="downloadTemplate">下载导入模板</el-button>
      <input class="file-input" type="file" accept=".xlsx" :disabled="importing" @change="chooseFile" />
      <el-progress v-if="importing" :percentage="importProgress" class="progress" />
      <div v-if="importResult" class="import-result">
        <el-alert
          :title="`共 ${importResult.total} 行，成功 ${importResult.successCount} 行，失败 ${importResult.failCount} 行`"
          :type="importResult.failCount ? 'warning' : 'success'"
          show-icon
          :closable="false"
        />
        <template v-if="importResult.errors?.length"
          ><el-table :data="importResult.errors" max-height="240" stripe
            ><el-table-column prop="row" label="Excel 行号" width="110" /><el-table-column
              prop="reason"
              label="失败原因" /></el-table
          ><el-button :icon="Download" @click="downloadErrors">下载错误报告</el-button></template
        >
      </div>
      <template #footer
        ><el-button :disabled="importing" @click="importVisible = false">关闭</el-button
        ><el-button type="primary" :loading="importing" @click="submitImport">开始导入</el-button></template
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
}
.member-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 16px;
}
.member-form .el-select {
  width: 100%;
}
.full-row {
  grid-column: 1 / -1;
}
.import-hint {
  color: var(--text-secondary);
  line-height: 1.6;
}
.file-input {
  display: block;
  margin: 18px 0;
  max-width: 100%;
}
.progress,
.import-result {
  margin-top: 18px;
}
.import-result .el-table {
  margin: 12px 0;
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
