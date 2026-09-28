<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { ArrowLeft } from "@element-plus/icons-vue";
import {
  createAdminActivity,
  getAdminActivity,
  listAdminActivityTypes,
  updateAdminActivity,
  type ActivityBranchOption,
  type ActivitySaveRequest,
  type ActivityStatus,
  type ActivityTypeOption,
  type ActivityVo,
} from "@/api/activities";
import { listBranches } from "@/api/members";
import { getApiErrorMessage as getErrorMessage } from "@/utils/apiError";
import { activityStatusLabel } from "./activityStatus";

const route = useRoute();
const router = useRouter();
const isEditMode = computed(() => route.name === "ActivityEdit");
const editId = computed(() => Number(route.params.id));
const formRef = ref<FormInstance>();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const referenceMessage = ref("");
const editLoadFailed = ref(false);
const typeOptions = ref<ActivityTypeOption[]>([]);
const branchOptions = ref<ActivityBranchOption[]>([]);
const formData = reactive<ActivitySaveRequest>({
  branchId: null,
  title: "",
  description: "",
  type: null,
  cover: "",
  startTime: null,
  endTime: null,
  location: null,
  locationDescription: "",
  signStart: null,
  signEnd: null,
  maxParticipants: null,
  status: 0,
});

const rules: FormRules = {
  title: [
    { required: true, message: "请输入活动名称", trigger: "blur" },
    { min: 2, max: 100, message: "活动名称长度为 2 至 100 个字符", trigger: "blur" },
  ],
};

function fromApiDate(value: string | null): string | null {
  if (!value) return null;
  return value.replace("T", " ").slice(0, 19);
}

function toApiDate(value: string | null): string | null {
  return value ? value.replace(" ", "T") : null;
}

function fillForm(activity: ActivityVo): void {
  formData.branchId = activity.branchId;
  formData.title = activity.title || "";
  formData.description = activity.description || "";
  formData.type = activity.type;
  formData.cover = activity.cover || "";
  formData.startTime = fromApiDate(activity.startTime);
  formData.endTime = fromApiDate(activity.endTime);
  formData.location = activity.location;
  formData.locationDescription = activity.locationDescription || "";
  formData.signStart = fromApiDate(activity.signStart);
  formData.signEnd = fromApiDate(activity.signEnd);
  formData.maxParticipants = activity.maxParticipants;
  formData.status = activity.status ?? 0;
}

async function loadOptions(): Promise<void> {
  referenceMessage.value = "";
  const [typesResult, branchesResult] = await Promise.allSettled([listAdminActivityTypes(), listBranches()]);
  const issues: string[] = [];
  if (typesResult.status === "fulfilled") {
    typeOptions.value = typesResult.value;
  } else {
    issues.push("活动类型：" + getErrorMessage(typesResult.reason));
  }
  if (branchesResult.status === "fulfilled") {
    branchOptions.value = branchesResult.value;
  } else {
    issues.push("支部列表：" + getErrorMessage(branchesResult.reason));
  }
  if (issues.length) referenceMessage.value = "选项数据加载失败。" + issues.join("；");
}

async function loadEditData(): Promise<void> {
  if (!isEditMode.value || !Number.isFinite(editId.value) || editId.value <= 0) return;
  loading.value = true;
  errorMessage.value = "";
  editLoadFailed.value = false;
  try {
    const activity = await getAdminActivity(editId.value);
    fillForm(activity);
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
    editLoadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

function buildPayload(status: ActivityStatus): ActivitySaveRequest {
  return {
    branchId: formData.branchId,
    title: formData.title.trim(),
    description: formData.description?.trim() || null,
    type: formData.type,
    cover: formData.cover?.trim() || null,
    startTime: toApiDate(formData.startTime),
    endTime: toApiDate(formData.endTime),
    location: formData.location?.trim() || null,
    locationDescription: formData.locationDescription?.trim() || null,
    signStart: toApiDate(formData.signStart),
    signEnd: toApiDate(formData.signEnd),
    maxParticipants: formData.maxParticipants,
    status,
  };
}

function validateTimeRanges(): boolean {
  if (formData.startTime && formData.endTime && formData.endTime <= formData.startTime) {
    errorMessage.value = "活动结束时间必须晚于活动开始时间。";
    return false;
  }
  if (formData.signStart && formData.signEnd && formData.signEnd <= formData.signStart) {
    errorMessage.value = "签到结束时间必须晚于签到开始时间。";
    return false;
  }
  return true;
}

async function submit(status: ActivityStatus): Promise<void> {
  errorMessage.value = "";
  if (!validateTimeRanges()) return;

  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  saving.value = true;
  const payload = buildPayload(status);
  try {
    if (isEditMode.value) {
      await updateAdminActivity(editId.value, payload);
      ElMessage.success("活动信息已保存");
      try {
        const refreshed = await getAdminActivity(editId.value);
        fillForm(refreshed);
      } catch (error) {
        errorMessage.value = "保存成功，但刷新活动数据失败：" + getErrorMessage(error);
        editLoadFailed.value = true;
        return;
      }
      await router.push("/activity/" + editId.value);
    } else {
      await createAdminActivity(payload);
      ElMessage.success(status === 1 ? "活动已发布" : "活动草稿已保存");
      await router.push("/activity");
    }
  } catch (error) {
    // 保留输入值，便于根据后端校验信息修正后重试。
    errorMessage.value = getErrorMessage(error);
  } finally {
    saving.value = false;
  }
}

function goBack(): void {
  void router.push("/activity");
}

onMounted(async () => {
  loading.value = true;
  await loadOptions();
  loading.value = false;
  await loadEditData();
});
</script>

<template>
  <main class="activity-form-page">
    <div class="activity-form-container">
      <header class="form-intro">
        <button class="back-link" type="button" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回活动列表
        </button>
        <div class="form-kicker">活动工作台 <span></span> 发布管理</div>
        <div class="form-heading">
          <div>
            <h1>{{ isEditMode ? "编辑活动" : "发布活动" }}</h1>
            <p>{{ isEditMode ? "更新活动内容并同步保存到平台。" : "完善活动信息，保存草稿或立即发布。" }}</p>
          </div>
          <div class="form-number">{{ isEditMode ? "编辑" : "新建" }}</div>
        </div>
      </header>

      <el-alert
        v-if="referenceMessage"
        class="reference-alert"
        :title="referenceMessage"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-alert v-if="errorMessage" class="form-alert" :title="errorMessage" type="error" show-icon :closable="false">
        <template v-if="editLoadFailed" #default>
          <el-button text type="primary" @click="loadEditData">重新加载活动数据</el-button>
        </template>
      </el-alert>

      <el-alert
        class="assumption-alert"
        title="状态值 0（未发布）与 2（已下线）的名称为原型约定；后端明确状态 1 为已发布。"
        type="info"
        :closable="false"
        show-icon
      />

      <div v-loading="loading" class="form-card" element-loading-text="正在读取活动信息…">
        <el-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          :disabled="saving || editLoadFailed"
          label-position="top"
          class="activity-form"
          @submit.prevent
        >
          <section class="form-section">
            <div class="section-heading">
              <span class="section-number">01</span>
              <div>
                <h2>活动信息</h2>
                <p>活动标题必填，类型与支部可按实际安排选择。</p>
              </div>
            </div>

            <el-form-item label="活动名称" prop="title">
              <el-input
                v-model="formData.title"
                maxlength="100"
                show-word-limit
                placeholder="例如：学习贯彻党的二十届三中全会精神主题党日"
              />
            </el-form-item>

            <div class="form-grid">
              <el-form-item label="活动类型">
                <el-select v-model="formData.type" clearable placeholder="请选择活动类型">
                  <el-option v-for="item in typeOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="所属支部">
                <el-select v-model="formData.branchId" clearable placeholder="校级活动">
                  <el-option :value="null" label="校级活动" />
                  <el-option v-for="item in branchOptions" :key="item.id" :value="item.id" :label="item.branchName" />
                </el-select>
              </el-form-item>
            </div>

            <el-form-item label="活动简介">
              <el-input
                v-model="formData.description"
                type="textarea"
                :rows="4"
                maxlength="2000"
                show-word-limit
                resize="vertical"
                placeholder="介绍活动主题、主要内容与参与安排"
              />
            </el-form-item>

            <div class="form-grid">
              <el-form-item label="地点说明">
                <el-input
                  v-model="formData.locationDescription"
                  maxlength="200"
                  placeholder="如：学院楼 A 座 301 会议室"
                />
              </el-form-item>
              <el-form-item label="活动封面地址">
                <el-input v-model="formData.cover" placeholder="填写可访问的图片 URL（选填）" />
              </el-form-item>
            </div>

            <el-form-item label="活动地理范围（WKT）">
              <el-input
                v-model="formData.location"
                type="textarea"
                :rows="2"
                resize="vertical"
                placeholder="选填；留空表示线上活动，线下范围可填写 Polygon WKT"
              />
              <span class="field-hint">目前页面不提供地图绘制；已有地理范围会在编辑时保留。</span>
            </el-form-item>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <span class="section-number">02</span>
              <div>
                <h2>时间与人数</h2>
                <p>时间字段按服务端活动契约保存；签到窗口仅保存时间配置。</p>
              </div>
            </div>

            <div class="form-grid">
              <el-form-item label="活动开始时间">
                <el-date-picker
                  v-model="formData.startTime"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择开始时间"
                />
              </el-form-item>
              <el-form-item label="活动结束时间">
                <el-date-picker
                  v-model="formData.endTime"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择结束时间"
                />
              </el-form-item>
            </div>

            <div class="form-grid">
              <el-form-item label="签到开始时间">
                <el-date-picker
                  v-model="formData.signStart"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择签到开始时间"
                />
              </el-form-item>
              <el-form-item label="签到结束时间">
                <el-date-picker
                  v-model="formData.signEnd"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择签到结束时间"
                />
              </el-form-item>
            </div>

            <el-form-item label="人数上限">
              <el-input-number
                v-model="formData.maxParticipants"
                :min="1"
                :max="100000"
                :step="10"
                controls-position="right"
                placeholder="不限制"
              />
              <span class="field-hint">留空表示不设置人数上限。</span>
            </el-form-item>
          </section>

          <footer class="form-footer">
            <div class="footer-copy">
              <span class="current-state">{{ isEditMode ? "当前状态" : "新建默认状态" }}</span>
              <strong>{{ activityStatusLabel(formData.status) }}</strong>
              <small>保存成功后将重新读取服务端数据。</small>
            </div>
            <div class="footer-actions">
              <el-button :disabled="saving" @click="goBack">取消</el-button>
              <template v-if="isEditMode">
                <el-button :loading="saving" @click="submit(formData.status)">保存修改</el-button>
              </template>
              <el-button :loading="saving" @click="submit(0)">保存草稿</el-button>
              <el-button class="publish-button" type="primary" :loading="saving" @click="submit(1)">
                {{ isEditMode ? "保存并发布" : "发布活动" }}
              </el-button>
            </div>
          </footer>
        </el-form>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.activity-form-page {
  min-height: 100%;
  padding: 30px 0 56px;
  color: #292c2d;
  background: radial-gradient(circle at 91% 1%, rgba(181, 139, 77, 0.075), transparent 22rem), #f4f2ec;
}

.activity-form-container {
  width: min(1060px, calc(100% - 56px));
  margin: 0 auto;
}

.form-intro {
  margin-bottom: 22px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 23px;
  padding: 0;
  border: 0;
  color: #827e74;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--party-red);
}

.form-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9b7c4c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.form-kicker span {
  width: 22px;
  height: 1px;
  background: #c7b18c;
}

.form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 7px;
}

.form-heading h1 {
  color: #292c2d;
  font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
  font-size: clamp(27px, 3vw, 35px);
  font-weight: 600;
  letter-spacing: 0.045em;
}

.form-heading p {
  margin-top: 5px;
  color: #777a77;
  font-size: 14px;
}

.form-number {
  color: rgba(163, 39, 33, 0.1);
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 45px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.form-alert,
.reference-alert,
.assumption-alert {
  margin-bottom: 13px;
  border-radius: 8px;
}

.form-card {
  border: 1px solid var(--workspace-line);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 10px 28px rgba(46, 37, 27, 0.045);
}

.activity-form {
  padding: 8px 32px 0;
}

.form-section {
  padding: 26px 0 18px;
  border-bottom: 1px solid #eeeae2;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  margin-bottom: 20px;
}

.section-number {
  display: grid;
  width: 29px;
  height: 29px;
  flex: 0 0 29px;
  place-items: center;
  border: 1px solid #eadbc7;
  border-radius: 50%;
  color: #a37840;
  background: #fbf7ee;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 12px;
}

.section-heading h2 {
  color: #343735;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 17px;
  font-weight: 600;
}

.section-heading p {
  margin-top: 3px;
  color: #989890;
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 22px;
}

.activity-form :deep(.el-form-item) {
  margin-bottom: 17px;
}

.activity-form :deep(.el-form-item__label) {
  padding-bottom: 6px;
  color: #646761;
  font-size: 13px;
  line-height: 1.3;
}

.activity-form :deep(.el-input__wrapper),
.activity-form :deep(.el-select__wrapper),
.activity-form :deep(.el-textarea__inner) {
  border-radius: 7px;
  background: #fbfaf7;
  box-shadow: 0 0 0 1px #e9e5dc inset;
}

.activity-form :deep(.el-input__wrapper),
.activity-form :deep(.el-select__wrapper) {
  min-height: 39px;
}

.activity-form :deep(.el-input__wrapper.is-focus),
.activity-form :deep(.el-select__wrapper.is-focused),
.activity-form :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #bc6e63 inset;
}

.activity-form :deep(.el-select),
.activity-form :deep(.el-date-editor) {
  width: 100%;
}

.activity-form :deep(.el-input-number) {
  width: 210px;
}

.field-hint {
  display: block;
  margin-top: 6px;
  color: #989890;
  font-size: 12px;
  line-height: 1.55;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 0 24px;
}

.footer-copy {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  column-gap: 8px;
}

.current-state {
  color: #93938c;
  font-size: 12px;
}

.footer-copy strong {
  color: var(--party-red);
  font-size: 13px;
}

.footer-copy small {
  grid-column: 1 / -1;
  margin-top: 4px;
  color: #9b9b94;
  font-size: 11px;
}

.footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.footer-actions :deep(.el-button) {
  min-height: 37px;
  margin-left: 0;
  border-radius: 7px;
}

.publish-button {
  border-color: var(--party-red);
  background: var(--party-red);
}

.publish-button:hover {
  border-color: var(--party-red-dark);
  background: var(--party-red-dark);
}

@media (max-width: 760px) {
  .activity-form-container {
    width: min(100% - 28px, 620px);
  }

  .activity-form {
    padding: 4px 20px 0;
  }

  .form-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .footer-actions {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-number {
    font-size: 30px;
  }

  .footer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .footer-actions .publish-button {
    grid-column: 1 / -1;
  }
}
</style>
