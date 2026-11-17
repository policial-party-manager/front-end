<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormItemRule } from "element-plus";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { loadAllIdentities, type IdentityOption } from "@/api/members";
import {
  applyIdentityChange,
  IDENTITY_CHANGE_REASON_MAX,
  type IdentityChangeApplyRequest,
} from "@/api/identity-changes";

/**
 * 发起政治身份变更（接管 `AdjustIdentityDialog.vue`，那个组件是硬编码五个身份名的 Mock）。
 *
 * 只负责「发起」这一步：提交成功后变更单处于待审批，**身份尚未生效**，
 * 因此既不刷新父级档案，也不改写任何 `identityName` 伪造已变更。
 *
 * 契约（后端 `IdentityChangeServiceImpl.apply`）：
 * - 请求体只有 `userId` / `toIdentity` / `reason`，`fromIdentity` 由服务端取当前身份快照。
 * - 目标身份必须来自真实字典 `GET /v2/content/identities/page`；加载失败时禁用提交并提供重试，
 *   不用本地兜底列表，也不硬编码「积极分子 / 发展对象」等名称。
 * - 「目标身份与当前身份相同」「该用户已有待审批的身份变更单」都是服务端校验，
 *   前端不预判、不禁用选项，提交后原样展示服务端原文。
 * - 生效不联动登录角色，弹窗里也只字不提角色变化。
 */
const props = defineProps<{
  /** 目标成员编号，来自档案页路由参数。 */
  userId: number;
  /** 成员姓名，仅用于二次确认文案。 */
  memberName: string;
  /** 档案里的当前身份编号；档案接口可能返回 null，此时视为未登记。 */
  currentIdentityId: number | null;
  /** 档案里的当前身份名；管理侧档案接口不填充该字段，通常为 null。 */
  currentIdentityName: string | null;
}>();

const emit = defineEmits<{ submitted: [] }>();

/** 弹窗显隐由父级控制，关闭时撤销在途响应。 */
const visible = defineModel<boolean>("visible", { required: true });

const formRef = ref<FormInstance | null>(null);
const form = ref<{ toIdentity: number | null; reason: string }>({ toIdentity: null, reason: "" });

const identities = ref<IdentityOption[]>([]);
const identityState = ref<"idle" | "loading" | "ready" | "error">("idle");
/** 字典超过 20 × 100 条时的降级标记，提示「可能不全」而不是假装拉全。 */
const identityTruncated = ref(false);

const submitting = ref(false);
/** 提交失败的服务端原文，留在弹窗内，避免用户关闭提示后不知为何失败。 */
const submitError = ref("");

const canSubmit = computed(() => sessionHasAccessToken.value && identityState.value === "ready");

/** 当前身份展示：编号为空显示「未登记」，有编号但字典没覆盖时显示编号，不猜名称。 */
const currentIdentityText = computed(() => {
  const name = (props.currentIdentityName ?? "").trim();
  if (name) return name;
  if (props.currentIdentityId == null) return "未登记";
  const matched = identities.value.find((item) => item.id === props.currentIdentityId);
  return matched ? matched.identityName : `身份 #${props.currentIdentityId}`;
});

const targetIdentityText = computed(() => {
  const matched = identities.value.find((item) => item.id === form.value.toIdentity);
  return matched ? matched.identityName : "未选择";
});

let disposed = false;
let sequence = 0;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && visible.value && isSessionIdentityCurrent(snapshot);
}

function cancelInFlight(): void {
  sequence++;
}

async function loadIdentities(): Promise<void> {
  if (!visible.value || disposed) return;
  const snapshot = captureSessionIdentity();
  const current = ++sequence;
  identityState.value = "loading";
  identityTruncated.value = false;
  try {
    const result = await loadAllIdentities(() => disposed || current !== sequence || !sessionOk(snapshot));
    if (disposed || current !== sequence || !sessionOk(snapshot) || result.cancelled) return;
    identities.value = result.records;
    identityTruncated.value = result.truncated;
    identityState.value = "ready";
  } catch {
    if (disposed || current !== sequence || !sessionOk(snapshot)) return;
    // 字典失败时不给兜底列表：宁可让用户重试，也不提交一个可能不存在的身份编号。
    identities.value = [];
    identityState.value = "error";
  }
}

function retryIdentities(): void {
  void loadIdentities();
}

const rules: Partial<Record<"toIdentity" | "reason", FormItemRule[]>> = {
  toIdentity: [{ required: true, message: "请选择目标身份", trigger: "change" }],
  reason: [
    {
      trigger: "blur",
      validator: (_rule, value: string, callback) => {
        if (typeof value === "string" && value.length > IDENTITY_CHANGE_REASON_MAX) {
          callback(new Error(`变更原因不能超过 ${IDENTITY_CHANGE_REASON_MAX} 字，当前 ${value.length} 字`));
          return;
        }
        callback();
      },
    },
  ],
};

/** 长度在提交前再校验一次：`maxlength` 可被绕过（粘贴、脚本、测试），提交层不能只信 DOM。 */
function reasonTooLong(): boolean {
  return form.value.reason.length > IDENTITY_CHANGE_REASON_MAX;
}

function resetForm(): void {
  form.value = { toIdentity: null, reason: "" };
  submitError.value = "";
  identities.value = [];
  identityTruncated.value = false;
  identityState.value = "idle";
  formRef.value?.clearValidate();
}

async function confirmSubmit(): Promise<boolean> {
  const message = [
    `成员：${props.memberName || "未登记姓名"}`,
    `当前身份：${currentIdentityText.value}`,
    `目标身份：${targetIdentityText.value}`,
    `变更原因：${form.value.reason.trim() || "未填写"}`,
  ].join("\n");
  try {
    await ElMessageBox.confirm(message, "确认发起身份变更", {
      confirmButtonText: "确认提交",
      cancelButtonText: "再检查一下",
      type: "warning",
      // 纯文本确认框：原因由用户自由输入，不能拼进 HTML。
      customClass: "identity-change-confirm",
    });
    return true;
  } catch {
    return false;
  }
}

async function submit(): Promise<void> {
  // 同步置位：同一事件循环内的第二次点击直接被挡掉，不会发出第二个请求。
  if (submitting.value || !canSubmit.value) return;
  submitting.value = true;
  submitError.value = "";
  const snapshot = captureSessionIdentity();
  const current = sequence;
  try {
    const valid = await (formRef.value?.validate().catch(() => false) ?? false);
    if (!valid) {
      formRef.value?.scrollToField(reasonTooLong() ? "reason" : "toIdentity");
      return;
    }
    if (current !== sequence || !sessionOk(snapshot)) return;
    if (reasonTooLong()) {
      formRef.value?.scrollToField("reason");
      await formRef.value?.validateField("reason").catch(() => undefined);
      return;
    }
    if (form.value.toIdentity == null) {
      formRef.value?.scrollToField("toIdentity");
      return;
    }
    if (!(await confirmSubmit())) return;
    if (current !== sequence || !sessionOk(snapshot)) return;
    const payload: IdentityChangeApplyRequest = {
      userId: props.userId,
      toIdentity: form.value.toIdentity,
      reason: form.value.reason.trim(),
    };
    await applyIdentityChange(payload);
    if (current !== sequence || !sessionOk(snapshot)) return;
    ElMessage.success("变更单已提交，等待超级管理员审批");
    emit("submitted");
    visible.value = false;
  } catch (error) {
    if (current !== sequence || !sessionOk(snapshot)) return;
    // 保留已填内容，原文照转达（例如「该用户已有待审批的身份变更单」）。
    submitError.value = getApiErrorMessage(error, "提交失败，请稍后重试");
  } finally {
    if (current === sequence) submitting.value = false;
  }
}

function close(): void {
  if (submitting.value) return;
  visible.value = false;
}

watch(visible, (open) => {
  if (open) {
    resetForm();
    void loadIdentities();
    return;
  }
  // 关闭即撤销在途字典请求与提交回写，下次打开重新拉字典。
  cancelInFlight();
});

watch(
  () => props.userId,
  () => {
    // 弹窗开着时父级换了成员：旧表单与旧字典结果都不能留给新成员。
    cancelInFlight();
    resetForm();
    if (visible.value) void loadIdentities();
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    title="发起政治身份变更"
    width="min(560px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    append-to-body
    class="identity-change-dialog"
    @closed="cancelInFlight"
  >
    <div class="member-summary">
      <div class="summary-item">
        <span class="summary-label">成员</span>
        <span class="summary-value">{{ memberName || "未登记姓名" }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">当前身份</span>
        <el-tag type="info" size="small" effect="plain" data-testid="identity-change-current">
          {{ currentIdentityText }}
        </el-tag>
      </div>
    </div>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="identity-change-no-token"
      type="warning"
      :closable="false"
      show-icon
      title="发起身份变更需要登录"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不能发起真实变更单。</p>
      </template>
    </el-alert>

    <template v-else>
      <el-alert
        v-if="identityState === 'error'"
        data-testid="identity-change-dictionary-error"
        type="error"
        :closable="false"
        show-icon
        title="身份字典加载失败"
      >
        <template #default>
          <p>无法获取真实政治身份字典，因此不能提交变更单。页面不使用本地兜底身份列表。</p>
          <el-button
            size="small"
            type="primary"
            plain
            data-testid="identity-change-dictionary-retry"
            @click="retryIdentities"
          >
            重新加载身份字典
          </el-button>
        </template>
      </el-alert>
      <p v-else-if="identityTruncated" class="form-hint" data-testid="identity-change-dictionary-truncated">
        身份字典条目过多，仅加载了前 2000 条，可能未覆盖全部身份。
      </p>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="88px"
        label-position="right"
        class="identity-form"
        data-testid="identity-change-form"
        @submit.prevent
      >
        <el-form-item label="目标身份" prop="toIdentity">
          <el-select
            v-model="form.toIdentity"
            class="identity-select"
            data-testid="identity-change-target"
            :disabled="identityState !== 'ready' || submitting"
            :loading="identityState === 'loading'"
            :placeholder="identityState === 'loading' ? '正在加载身份字典…' : '请选择目标身份'"
            filterable
          >
            <el-option v-for="item in identities" :key="item.id" :label="item.identityName" :value="item.id">
              <span>{{ item.identityName }}</span>
              <span v-if="item.id === currentIdentityId" class="option-note">当前身份</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="变更原因" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            :maxlength="IDENTITY_CHANGE_REASON_MAX"
            show-word-limit
            :disabled="submitting"
            data-testid="identity-change-reason"
            placeholder="说明本次身份变更的依据，例如支部大会讨论结论（可不填）"
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="submitError"
        data-testid="identity-change-submit-error"
        type="error"
        :closable="false"
        show-icon
        :title="submitError"
      />

      <p class="form-hint">
        提交后只是生成待审批变更单，<strong>审批通过前身份不会变化</strong>；审批由超级管理员在「身份变更审批」页完成。身份变更不影响系统角色、菜单与权限。
      </p>
    </template>

    <template #footer>
      <el-button :disabled="submitting" data-testid="identity-change-cancel" @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit || submitting"
        data-testid="identity-change-submit"
        @click="submit"
      >
        提交变更单
      </el-button>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
.member-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: var(--radius-base);
  background: var(--party-red-bg);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.summary-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.identity-form {
  margin-top: 16px;

  .identity-select {
    width: 100%;
  }
}

.option-note {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.form-hint {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
</style>
