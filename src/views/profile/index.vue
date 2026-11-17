<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { FormInstance, FormItemRule, FormRules } from "element-plus";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { getMyProfile, updateMyProfile, type ProfileResponse, type UserProfileUpdateRequest } from "@/api/profile";

/**
 * 个人中心（`/profile`）。
 *
 * 资料口径：`GET /v4/user/profile` 的 `UserProfileVo`。页面把字段分成两组：
 * - 只读组：姓名、学号、政治身份、性别、学院、年级、专业、班级、所属支部、身份证号。
 *   这些字段由管理侧维护；政治身份只能通过管理侧身份变更流程调整，本页不提供任何入口。
 * - 可编辑组：手机号、邮箱、紧急联系人、备注，经 `PUT /v4/user/profile` 部分更新。
 *
 * 后端语义约束（它们决定交互，而不是可有可无的注释）：
 * - **未传 = 不改**：`UserServiceImpl.updateProfile` 逐字段 `trimToNull`，为 null 即跳过赋值，
 *   因此保存时只提交实际变化的字段，避免整表回写覆盖管理侧同时修改的内容。
 * - **空串无法清空**：空串同样被归一为 null，`updateById` 走 MyBatis-Plus 默认 `NOT_NULL`
 *   策略跳过该列，接口返回 200 但库中值不变（与 `docs/前后端接入现状.md` 记录的
 *   `PUT /v4/members/{id}/contact` 缺陷同源）。因此界面不提供清空操作，也不静默忽略：
 *   某字段从有值改为空时给出字段级提示并阻止提交，而不是假装保存成功。
 */

/** 本页对所有已登录角色开放（路由 permission 为 home:view），仅要求真实登录令牌。 */
const canView = computed(() => sessionHasAccessToken.value);

/** 只读字段只可能是文本列，排除 id 类数值列，避免展示层拿到 number。 */
type TextFieldKey = {
  [K in keyof ProfileResponse]-?: ProfileResponse[K] extends string | null | undefined ? K : never;
}[keyof ProfileResponse];

/** 只读字段：顺序即展示顺序，全部由管理侧维护，页面不提供输入控件。 */
const readonlyFields: { label: string; key: TextFieldKey; placeholder: string }[] = [
  { label: "姓名", key: "realName", placeholder: "未登记" },
  { label: "学号 / 工号", key: "studentId", placeholder: "未登记" },
  { label: "政治身份", key: "identityName", placeholder: "未登记" },
  { label: "性别", key: "gender", placeholder: "未登记" },
  { label: "学院", key: "college", placeholder: "未登记" },
  { label: "年级", key: "grade", placeholder: "未登记" },
  { label: "专业", key: "major", placeholder: "未登记" },
  { label: "班级", key: "className", placeholder: "未登记" },
  { label: "所属支部", key: "branchName", placeholder: "未分配支部" },
  { label: "身份证号", key: "identityCardNumber", placeholder: "未填写" },
];

function displayValue(value: string | null | undefined, placeholder: string): string {
  return (value ?? "").trim() || placeholder;
}

// ============ 请求隔离：请求序号 + 会话快照 ============
const profile = ref<ProfileResponse | null>(null);
const loading = ref(false);
const loadError = ref("");

let disposed = false;
let requestSequence = 0;
let saveSequence = 0;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

/** silent 用于保存成功后的回读：保留当前展示，不整页退回骨架屏。 */
async function loadProfile(silent = false): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  if (!silent) {
    loading.value = true;
    profile.value = null;
  }
  loadError.value = "";
  try {
    const result = await getMyProfile();
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = result;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = null;
    loadError.value = getApiErrorMessage(error, "暂时无法加载本人资料");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

function retry(): void {
  void loadProfile();
}

const readonlyRows = computed(() =>
  readonlyFields.map((field) => ({
    label: field.label,
    key: field.key,
    text: displayValue(profile.value?.[field.key], field.placeholder),
  })),
);

// ============ 联系方式编辑 ============
type EditableKey = "phone" | "email" | "contactPerson" | "remark";

const EDITABLE_KEYS: readonly EditableKey[] = ["phone", "email", "contactPerson", "remark"];
const EDITABLE_LABELS: Record<EditableKey, string> = {
  phone: "手机号码",
  email: "电子邮箱",
  contactPerson: "紧急联系人",
  remark: "备注",
};

const PHONE_REGEX = /^1\d{10}$/;
/** 与后端 `UserProfileUpdateRequest.EMAIL_REGEX` 同一条正则。 */
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const editableRows = computed(() =>
  EDITABLE_KEYS.map((key) => ({
    label: EDITABLE_LABELS[key],
    key,
    text: displayValue(profile.value?.[key], "未填写"),
  })),
);

const drawerVisible = ref(false);
const submitting = ref(false);
const editFormRef = ref<FormInstance>();
/** 4 个输入控件实例；拦截提交时把焦点移到第一个出错字段。 */
const editFieldRefs: Partial<Record<EditableKey, { focus: () => void }>> = {};
const editForm = reactive<Record<EditableKey, string>>(
  EDITABLE_KEYS.reduce((form, key) => ({ ...form, [key]: "" }), {} as Record<EditableKey, string>),
);

/** 记录输入控件实例，供拦截提交时把焦点移到第一个出错字段。 */
function registerEditField(key: EditableKey, instance: unknown): void {
  const target = instance as { focus?: unknown } | null;
  if (target && typeof target.focus === "function") editFieldRefs[key] = target as { focus: () => void };
  else delete editFieldRefs[key];
}

/** 预先建好每字段的 ref 回调，避免模板里写内联函数触发重复挂载。 */
const editFieldSetters = EDITABLE_KEYS.reduce(
  (setters, key) => ({ ...setters, [key]: (instance: unknown) => registerEditField(key, instance) }),
  {} as Record<EditableKey, (instance: unknown) => void>,
);
/** 打开抽屉时的字段快照：既用于「只发变化字段」，也用于识别「有值改空」。 */
const initialSnapshot = ref<Record<EditableKey, string> | null>(null);

/** 与后端 `trimToNull` 对齐：比较、校验与提交都用同一个 trim 结果。 */
function normalize(value: string): string {
  return value.trim();
}

function clearsExisting(key: EditableKey): boolean {
  const initial = initialSnapshot.value;
  if (!initial) return false;
  return normalize(initial[key]) !== "" && normalize(editForm[key]) === "";
}

function clearBlockedMessage(key: EditableKey): string {
  // 不承诺「管理员能清空」：同一处后端缺陷也影响管理侧入口，能力由管理侧流程决定。
  return `当前接口不支持清空${EDITABLE_LABELS[key]}，如需清空请由管理侧另行处理`;
}

/** 逐字段校验，返回空串代表通过；约束逐条对齐后端。 */
function validateValue(key: EditableKey, raw: string): string {
  const text = normalize(raw);
  if (text === "") return clearsExisting(key) ? clearBlockedMessage(key) : "";
  if (key === "phone" && !PHONE_REGEX.test(text)) return "手机号格式不正确（应为 11 位大陆手机号）";
  if (key === "email") {
    if (text.length > 25) return "邮箱长度不能超过 25";
    if (!EMAIL_REGEX.test(text)) return "邮箱格式不正确";
  }
  if (key === "contactPerson" && text.length > 50) return "紧急联系人长度不能超过 50";
  if (key === "remark" && text.length > 500) return "备注长度不能超过 500";
  return "";
}

function ruleFor(key: EditableKey): FormItemRule {
  return {
    // 校验与提交共用同一个值（都先 trim），避免「 13800138000」校验失败却被提交成合法值。
    validator: (_rule, value, callback) => {
      const message = validateValue(key, typeof value === "string" ? value : "");
      return message ? callback(new Error(message)) : callback();
    },
    // 输入后即时反馈，错误定位到具体字段。
    trigger: ["blur", "change"],
  };
}

/** 校验规则由 EDITABLE_KEYS 派生，新增可编辑字段不必在两处各写一遍。 */
const editRules: FormRules = Object.fromEntries(EDITABLE_KEYS.map((key) => [key, [ruleFor(key)]]));

function resetEditState(): void {
  initialSnapshot.value = null;
  EDITABLE_KEYS.forEach((key) => {
    editForm[key] = "";
  });
  editFormRef.value?.clearValidate();
}

function openEditor(): void {
  if (!canView.value || disposed || !profile.value) return;
  const value = profile.value;
  // 打开即用当前资料预填，并记录初始快照作为「是否变化」的基准。
  const snapshot = editableSnapshotFrom(value);
  initialSnapshot.value = snapshot;
  EDITABLE_KEYS.forEach((key) => {
    editForm[key] = snapshot[key];
  });
  editFormRef.value?.clearValidate();
  drawerVisible.value = true;
}

function onDrawerClosed(): void {
  submitting.value = false;
  resetEditState();
}

/** 打开抽屉时的字段快照；与 editForm 同源，避免两处各自列举字段。 */
function editableSnapshotFrom(value: ProfileResponse): Record<EditableKey, string> {
  return EDITABLE_KEYS.reduce(
    (snapshot, key) => ({ ...snapshot, [key]: value[key] ?? "" }),
    {} as Record<EditableKey, string>,
  );
}

const changedKeys = computed<EditableKey[]>(() => {
  const initial = initialSnapshot.value;
  if (!initial) return [];
  return EDITABLE_KEYS.filter((key) => normalize(editForm[key]) !== normalize(initial[key]));
});

/** 有值改空但接口不支持清空的字段；必须在提交前显式提示，不能静默忽略。 */
const blockedClearKeys = computed(() => changedKeys.value.filter((key) => clearsExisting(key)));

const saveDisabled = computed(() => submitting.value || changedKeys.value.length === 0);

function buildPayload(): UserProfileUpdateRequest {
  const payload: UserProfileUpdateRequest = {};
  changedKeys.value.forEach((key) => {
    const value = normalize(editForm[key]);
    // 清空意图已单独提示，绝不把空串当作「已清空」提交。
    if (value === "") return;
    payload[key] = value;
  });
  return payload;
}

function onFieldInput(key: EditableKey): void {
  editFormRef.value?.clearValidate(key);
}

/** 让字段级错误显形并带着焦点定位到第一个出错字段。 */
async function highlightFields(keys: readonly EditableKey[]): Promise<void> {
  if (keys.length === 0) return;
  await Promise.all(keys.map((key) => editFormRef.value?.validateField(key).catch(() => undefined) ?? undefined));
  const first = keys[0];
  editFieldRefs[first]?.focus();
}

async function submit(): Promise<void> {
  // 同步置位后再进入异步校验，双击不会产生第二次提交。
  if (submitting.value || !canView.value || disposed || !initialSnapshot.value) return;
  const epoch = ++saveSequence;
  const snapshot = captureSessionIdentity();
  submitting.value = true;
  try {
    // 存在清空意图时整单不提交：接口无法表达清空，静默跳过等于欺骗用户。
    if (blockedClearKeys.value.length > 0) {
      await highlightFields(blockedClearKeys.value);
      if (epoch === saveSequence && sessionOk(snapshot)) ElMessage.warning("所选字段暂不支持清空，本次未提交任何修改");
      return;
    }
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      if (epoch === saveSequence && sessionOk(snapshot)) ElMessage.info("联系方式未修改");
      return;
    }
    // 只校验真正要提交的字段：存量里不合法的旧值不应拦住本次无关的修改，
    // 但它也不在 payload 中，不会被写回。
    const invalid = (Object.keys(payload) as EditableKey[]).filter((key) => validateValue(key, editForm[key]));
    if (invalid.length > 0) {
      await highlightFields(invalid);
      return;
    }
    await updateMyProfile(payload);
    if (epoch !== saveSequence || !sessionOk(snapshot)) return;
    ElMessage.success("联系方式已保存");
    drawerVisible.value = false;
    // 页面值以服务端回读为准，不做本地改写。
    await loadProfile(true);
    if (epoch !== saveSequence || !sessionOk(snapshot)) return;
    // 保存成功与回读失败是两件事：分别提示，不能把回读失败说成保存失败。
    if (loadError.value) ElMessage.warning("保存成功，但重新读取本人资料失败，请手动刷新");
  } catch (error) {
    if (epoch === saveSequence && sessionOk(snapshot))
      ElMessage.error(getApiErrorMessage(error, "保存失败，请稍后重试"));
  } finally {
    if (epoch === saveSequence && isSessionIdentityCurrent(snapshot)) submitting.value = false;
  }
}

// ============ 生命周期 ============
function invalidate(): void {
  requestSequence++;
  saveSequence++;
  profile.value = null;
  loading.value = false;
  loadError.value = "";
  drawerVisible.value = false;
  submitting.value = false;
  resetEditState();
}

onMounted(() => {
  if (!canView.value) return;
  void loadProfile();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或权限变化：丢弃旧会话已渲染数据与在途响应，再按新会话重新拉取。
  invalidate();
  if (canView.value) void loadProfile();
});

onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});
</script>

<template>
  <main class="profile-page page-container">
    <header class="page-heading">
      <div>
        <span class="eyebrow">PERSONAL FILE / 个人档案</span>
        <h1>个人中心</h1>
        <p>查看本人基础资料，并维护手机号、邮箱、紧急联系人与备注。</p>
      </div>
      <el-tag class="readonly-tag" effect="plain" type="info">基础资料 · 管理侧维护</el-tag>
    </header>

    <el-alert
      v-if="!sessionHasAccessToken"
      class="login-alert"
      title="个人中心需要登录"
      type="warning"
      show-icon
      :closable="false"
      data-testid="profile-login-tip"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实个人资料。请使用本人账号登录后再访问。</p>
      </template>
    </el-alert>

    <section class="profile-section" aria-labelledby="basic-info-title">
      <div class="section-heading">
        <div>
          <span class="section-index">01 / INFORMATION</span>
          <h2 id="basic-info-title">个人资料</h2>
        </div>
        <p>手机号、邮箱、紧急联系人、备注可自行修改；姓名、学号、学院、班级、所属支部与政治身份由管理员维护。</p>
      </div>

      <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
        <el-skeleton :rows="4" animated />
        <span class="state-caption">正在加载本人资料…</span>
      </div>
      <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="profile-error">
        <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
        <div class="state-copy">
          <h3>个人资料暂时无法加载</h3>
          <p>{{ loadError }}</p>
        </div>
        <el-button type="primary" plain data-testid="profile-retry" @click="retry">
          <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
        </el-button>
      </div>
      <el-empty v-else-if="!profile" description="暂未获取到个人资料">
        <el-button type="primary" plain @click="retry">重新加载</el-button>
      </el-empty>
      <template v-else>
        <el-form
          class="profile-form content-card"
          label-position="left"
          label-width="120px"
          data-testid="profile-readonly"
        >
          <el-form-item v-for="row in readonlyRows" :key="row.key" :label="row.label">
            <span class="form-value" :data-testid="'profile-value-' + row.key">{{ row.text }}</span>
          </el-form-item>
        </el-form>

        <section class="editable-card content-card" aria-labelledby="editable-title" data-testid="profile-editable">
          <div class="editable-heading">
            <div>
              <h3 id="editable-title">联系方式</h3>
              <p>支持修改手机号、邮箱、紧急联系人与备注；接口只更新提交的字段，且不支持清空已有内容。</p>
            </div>
            <el-button type="primary" data-testid="profile-edit-open" @click="openEditor">
              <el-icon aria-hidden="true"><Edit /></el-icon>编辑联系方式
            </el-button>
          </div>
          <dl class="editable-grid">
            <div v-for="row in editableRows" :key="row.key" class="editable-item">
              <dt>{{ row.label }}</dt>
              <dd :data-testid="'profile-value-' + row.key">{{ row.text }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </section>

    <section class="profile-section records-section" aria-labelledby="records-title">
      <div class="section-heading">
        <div>
          <span class="section-index">02 / MY RECORDS</span>
          <h2 id="records-title">个人记录</h2>
        </div>
        <p>相关查询接口就绪后，将在此展示本人记录。</p>
      </div>

      <div class="record-grid">
        <article class="record-card content-card">
          <span class="record-index">A</span>
          <div class="record-copy">
            <h3>个人培养档案</h3>
            <p>身份历史、思想汇报与培养材料</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
        <article class="record-card content-card">
          <span class="record-index">B</span>
          <div class="record-copy">
            <h3>活动与签到</h3>
            <p>本人参与活动及签到记录</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
        <article class="record-card content-card">
          <span class="record-index">C</span>
          <div class="record-copy">
            <h3>党校学习</h3>
            <p>课程参与与学习完成情况</p>
          </div>
          <div class="record-empty">
            <el-icon><InfoFilled /></el-icon><span>记录接口接入后展示</span>
          </div>
        </article>
      </div>
    </section>

    <el-drawer v-model="drawerVisible" title="编辑联系方式" size="420px" @closed="onDrawerClosed">
      <p class="edit-note">
        只提交实际修改的字段。当前接口按「未传即不改」处理，空值会被忽略，因此已填写的内容无法在此清空；如需清空需由管理侧另行处理。
      </p>
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-position="top"
        class="edit-form"
        data-testid="profile-edit-form"
      >
        <!-- 不提供 clearable：一键清空会引导用户做接口不支持的操作。 -->
        <el-form-item label="手机号码" prop="phone">
          <el-input
            :ref="editFieldSetters.phone"
            v-model="editForm.phone"
            data-testid="profile-edit-phone"
            placeholder="11 位手机号"
            @input="onFieldInput('phone')"
          />
        </el-form-item>
        <el-form-item label="电子邮箱" prop="email">
          <el-input
            :ref="editFieldSetters.email"
            v-model="editForm.email"
            data-testid="profile-edit-email"
            placeholder="合法邮箱，不超过 25 个字符"
            @input="onFieldInput('email')"
          />
        </el-form-item>
        <el-form-item label="紧急联系人" prop="contactPerson">
          <el-input
            :ref="editFieldSetters.contactPerson"
            v-model="editForm.contactPerson"
            data-testid="profile-edit-contactPerson"
            placeholder="姓名与联系方式，不超过 50 个字符"
            @input="onFieldInput('contactPerson')"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            :ref="editFieldSetters.remark"
            v-model="editForm.remark"
            data-testid="profile-edit-remark"
            type="textarea"
            :rows="3"
            placeholder="不超过 500 个字符"
            @input="onFieldInput('remark')"
          />
        </el-form-item>
        <el-alert
          v-if="blockedClearKeys.length > 0"
          class="clear-alert"
          type="warning"
          show-icon
          :closable="false"
          data-testid="profile-clear-blocked"
          :title="'当前接口不支持清空：' + blockedClearKeys.map((key) => EDITABLE_LABELS[key]).join('、')"
        >
          <template #default>
            <p>保存时会跳过空值，接口返回成功但库中数据不变。请填写新的非空内容；确需清空请由管理侧另行处理。</p>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <div class="drawer-footer">
          <el-button data-testid="profile-edit-cancel" @click="drawerVisible = false">取消</el-button>
          <el-button
            type="primary"
            data-testid="profile-edit-submit"
            :loading="submitting"
            :disabled="saveDisabled"
            @click="submit"
          >
            保存
          </el-button>
        </div>
      </template>
    </el-drawer>
  </main>
</template>

<style lang="scss" scoped>
.profile-page {
  padding-top: 30px;
  padding-bottom: 52px;
}

.page-heading,
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.page-heading {
  margin-bottom: 24px;

  h1 {
    margin-top: 8px;
    color: var(--text-primary);
    font-family: "Songti SC", "SimSun", serif;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  p {
    margin-top: 4px;
    color: var(--text-secondary);
  }
}

.eyebrow,
.section-index {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.readonly-tag {
  margin-bottom: 5px;
}

.login-alert {
  margin-top: 18px;
}

.profile-section {
  margin-top: 34px;
}

.section-heading {
  margin-bottom: 15px;

  h2 {
    margin-top: 3px;
    color: var(--text-primary);
    font-size: 22px;
    font-weight: 650;
  }

  > p {
    max-width: 620px;
    padding-bottom: 2px;
    color: var(--text-secondary);
    font-size: 12px;
    text-align: right;
  }
}

.section-index {
  color: var(--party-red);
  font-size: 9px;
}

.profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 20px 32px;

  :deep(.el-form-item) {
    min-width: 0;
    margin-bottom: 0;
    padding: 18px 16px;
    border-bottom: 1px solid var(--border-light);
  }

  :deep(.el-form-item__label) {
    color: var(--text-secondary);
    font-size: 15px;
  }

  :deep(.el-form-item__content) {
    min-width: 0;
    line-height: 36px;
  }
}

.form-value {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 600;
}

.editable-card {
  margin-top: 16px;
  padding: 20px 30px 10px;
}

.editable-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h3 {
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 650;
  }

  p {
    max-width: 620px;
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 12px;
  }
}

.editable-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 24px;
  margin-top: 14px;
}

.editable-item {
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);

  dt {
    color: var(--text-secondary);
    font-size: 13px;
  }

  dd {
    overflow-wrap: anywhere;
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 600;
  }
}

.edit-note {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-left: 3px solid var(--party-red);
  background: var(--party-red-bg);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.clear-alert {
  margin-top: 4px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.state-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 150px;
}

.state-card[aria-busy="true"] {
  display: block;
}

.state-caption {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.state-icon {
  flex: 0 0 auto;
  font-size: 24px;
}

.error-icon {
  color: var(--party-red);
}

.state-copy {
  flex: 1;

  h3 {
    font-size: 15px;
  }

  p {
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.record-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.record-card {
  position: relative;
  display: flex;
  min-height: 174px;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;

  &::before {
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: var(--party-red);
    content: "";
  }
}

.record-index {
  color: rgba(193, 44, 31, 0.7);
  font-family: "Songti SC", "SimSun", serif;
  font-size: 13px;
  letter-spacing: 0.1em;
}

.record-copy {
  margin-top: 8px;

  h3 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 650;
  }

  p {
    margin-top: 3px;
    color: var(--text-secondary);
    font-size: 12px;
  }
}

.record-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 17px;
  color: var(--text-secondary);
  font-size: 11px;

  .el-icon {
    color: var(--party-red);
  }
}

@media (max-width: 1200px) {
  .editable-heading {
    flex-direction: column;
  }
}

@media (max-width: 992px) {
  .record-grid {
    grid-template-columns: 1fr;
  }

  .record-card {
    min-height: 145px;
  }
}

@media (max-width: 680px) {
  .profile-page {
    padding-top: 20px;
    padding-bottom: 34px;
  }

  .page-heading,
  .section-heading {
    align-items: flex-start;
  }

  .page-heading h1 {
    font-size: 27px;
  }

  .section-heading {
    flex-direction: column;
    gap: 5px;

    > p {
      text-align: left;
    }
  }

  .readonly-tag {
    flex: 0 0 auto;
  }

  .profile-form,
  .editable-grid {
    grid-template-columns: 1fr;
  }

  .profile-form {
    padding: 12px 16px;
  }

  .editable-card {
    padding: 16px 16px 6px;
  }

  .state-card:not([aria-busy="true"]) {
    flex-wrap: wrap;
  }
}
</style>
