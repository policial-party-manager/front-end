<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import {
  createBranch,
  deleteBranch,
  getBranch,
  pageBranches,
  updateBranch,
  type BranchFilters,
  type BranchSaveRequest,
  type BranchVo,
} from "@/api/branches";

const rows = ref<BranchVo[]>([]);
const loading = ref(false);
const loadError = ref(false);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const filters = reactive({
  keyword: "",
  status: undefined as number | undefined,
});
const applied = ref<BranchFilters>({});
const statusLabel = (status: number) => (status === 1 ? "启用" : "停用");
const dateLabel = (date: string | null) => (date ? date.replace("T", " ").slice(0, 16) : "—");
/** 数据源为 Mock，没有统一错误提示层，由页面兜底展示错误信息。 */
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

let requestSequence = 0;
async function loadBranches() {
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = false;
  try {
    const result = await pageBranches({ page: page.value, size: size.value, ...applied.value });
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
  applied.value = { keyword: filters.keyword.trim() || undefined, status: filters.status };
  page.value = 1;
  void loadBranches();
}
function reset() {
  filters.keyword = "";
  filters.status = undefined;
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
onMounted(() => {
  void loadBranches();
});

const detailVisible = ref(false);
const detail = ref<BranchVo | null>(null);
async function viewBranch(row: BranchVo) {
  try {
    detail.value = await getBranch(row.id);
    detailVisible.value = true;
  } catch (error) {
    ElMessage.error(errorMessage(error, "支部详情加载失败"));
  }
}

function emptyForm(): BranchSaveRequest {
  return { branchName: "", status: 1, remark: "" };
}
const form = reactive<BranchSaveRequest>(emptyForm());
const formRef = ref<FormInstance>();
const formVisible = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const rules: FormRules = {
  branchName: [{ required: true, message: "请输入支部名称", trigger: "blur" }],
};
function addBranch() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  formVisible.value = true;
}
async function editBranch(row: BranchVo) {
  try {
    const value = await getBranch(row.id);
    editingId.value = row.id;
    Object.assign(form, {
      branchName: value.branchName,
      status: value.status,
      remark: value.remark,
    });
    formVisible.value = true;
  } catch (error) {
    ElMessage.error(errorMessage(error, "支部信息加载失败"));
  }
}
async function saveBranch() {
  if (!formRef.value || !(await formRef.value.validate().catch(() => false))) return;
  saving.value = true;
  const isCreate = editingId.value === null;
  try {
    const payload = { ...form };
    if (isCreate) await createBranch(payload);
    else await updateBranch(editingId.value as number, payload);
    ElMessage.success(isCreate ? "支部添加成功" : "支部信息已更新");
    formVisible.value = false;
    await loadBranches();
  } catch (error) {
    ElMessage.error(errorMessage(error, isCreate ? "支部添加失败" : "支部信息更新失败"));
  } finally {
    saving.value = false;
  }
}
async function removeBranch(row: BranchVo) {
  try {
    await ElMessageBox.confirm(`确定删除支部「${row.branchName}」吗？该操作会将支部置为停用状态。`, "删除确认", {
      type: "warning",
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await deleteBranch(row.id);
    ElMessage.success("已删除");
    await loadBranches();
  } catch (error) {
    ElMessage.error(errorMessage(error, "删除失败"));
  }
}
</script>

<template>
  <div class="branches-page page-container">
    <div class="page-header">
      <h2 class="section-title">支部管理</h2>
      <p>维护党支部基础信息，支持新增、编辑与删除。</p>
    </div>
    <div class="content-card">
      <div class="card-header">
        <div>
          <strong>支部列表</strong><span class="total-label">共 {{ total }} 条</span>
        </div>
        <div class="actions">
          <el-button type="primary" :icon="Plus" @click="addBranch">新增支部</el-button>
        </div>
      </div>
      <div class="filters">
        <el-input v-model="filters.keyword" clearable placeholder="支部名称" @keyup.enter="search" />
        <el-select v-model="filters.status" clearable placeholder="全部状态"
          ><el-option label="启用" :value="1" /><el-option label="停用" :value="2"
        /></el-select>
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
        <el-table-column prop="branchName" label="支部名称" min-width="220" /><el-table-column label="状态" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 1 ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag></template
          ></el-table-column
        >
        <el-table-column prop="memberCount" label="成员数" width="100" /><el-table-column
          label="创建时间"
          width="172"
          class-name="created-at-column"
          label-class-name="created-at-header"
          ><template #default="{ row }">{{ dateLabel(row.createTime) }}</template></el-table-column
        >
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right"
          ><template #default="{ row }"
            ><div class="row-actions">
              <el-button link type="primary" @click="viewBranch(row)">详情</el-button
              ><el-button link type="primary" @click="editBranch(row)">编辑</el-button
              ><el-button
                link
                type="danger"
                :disabled="row.status === 2"
                :title="row.status === 2 ? '该支部已停用' : undefined"
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
      width="560px"
      :close-on-click-modal="false"
      @closed="formRef?.clearValidate()"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="branch-form">
        <el-form-item label="支部名称" prop="branchName"><el-input v-model="form.branchName" /></el-form-item>
        <el-form-item label="状态"
          ><el-radio-group v-model="form.status"
            ><el-radio :value="1">启用</el-radio><el-radio :value="2">停用</el-radio></el-radio-group
          ></el-form-item
        >
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="formVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveBranch">保存</el-button></template
      >
    </el-dialog>

    <el-dialog v-model="detailVisible" title="支部详情" width="520px"
      ><el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="支部名称" :span="2">{{ detail.branchName }}</el-descriptions-item
        ><el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item
        ><el-descriptions-item label="成员数">{{ detail.memberCount }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ dateLabel(detail.createTime) }}</el-descriptions-item
        ><el-descriptions-item label="备注" :span="2">{{ detail.remark || "—" }}</el-descriptions-item>
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
.filters .el-select {
  width: 170px;
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
@media (max-width: 768px) {
  .branches-page.page-container {
    width: 100%;
  }
  .filters .el-input,
  .filters .el-select {
    width: 100%;
  }
}
</style>
