<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { UPLOAD_ACCEPT, uploadFile, validateUploadFile } from "@/api/uploads";
import { addMemberMaterial, MATERIAL_REMARK_MAX, MATERIAL_TYPES } from "@/api/cultivation-contacts";

/**
 * 上传并登记培养材料（档案页 09 区块的写入口）。
 *
 * 后端是两步写入，顺序不能颠倒：
 * 1. `POST /v4/uploads`（multipart，**必须显式 `category=material`**）拿到 `file:` 路径；
 * 2. `POST /v4/members/{userId}/materials` 用该路径登记类型、文件名与备注。
 * 第 1 步失败绝不调第 2 步（否则留下没有文件的登记）；
 * 第 2 步失败时 `file:` 路径已经产生，界面提示「文件已上传但登记失败，请重试登记」并保留该路径，
 * 重试只重发登记、不重新上传（后端没有删除端点，重复上传只会多出一份孤儿文件）。
 *
 * 材料类型固定五个值，顺序取 `MATERIAL_TYPES`（后端 `Set.of(...)` 的迭代顺序不稳定，
 * 错误文案里的顺序不能当展示顺序）。备注 ≤200 字，前端拦截一次，服务端是最终判定者。
 * 界面不渲染 `file:` 路径、不生成下载或预览（后端没有下载端点）。
 */
const props = defineProps<{
  /** 归属成员编号，来自档案页路由参数。 */
  userId: number;
  /** 成员姓名，仅用于文案。 */
  memberName: string;
}>();

const emit = defineEmits<{ registered: [] }>();

const visible = defineModel<boolean>("visible", { required: true });

const materialType = ref<string>("");
const remark = ref("");
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();

/** 字段级错误（前端预检），与接口错误分开，避免把预检提示说成服务端拒绝。 */
const fileError = ref("");
const typeError = ref("");
/** 上传进度百分比；未上传时为 0。 */
const progress = ref(0);
/** 第 1 步已产出的 `file:` 路径；有值时重试只做登记。 */
const uploadedUrl = ref("");
const uploadError = ref("");
const registerError = ref("");
/** 同步置位：上传与登记共用，防止同一事件循环内重复提交。 */
const submitting = ref(false);

const canSubmit = computed(() => sessionHasAccessToken.value && !!materialType.value && !!file.value);

const remarkTooLong = computed(() => remark.value.length > MATERIAL_REMARK_MAX);

let disposed = false;
let sequence = 0;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && visible.value && isSessionIdentityCurrent(snapshot);
}

function cancelInFlight(): void {
  sequence++;
}

function resetFileInput(): void {
  if (fileInput.value) fileInput.value.value = "";
}

function reset(): void {
  materialType.value = "";
  remark.value = "";
  file.value = null;
  fileError.value = "";
  typeError.value = "";
  progress.value = 0;
  uploadedUrl.value = "";
  uploadError.value = "";
  registerError.value = "";
  // 上一轮若因换号/换成员被序号拦住，`finally` 不会复位，这里无条件清。
  submitting.value = false;
  resetFileInput();
}

function chooseFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0] ?? null;
  // 换文件即作废上一步的上传结果：那份文件不归属于这次登记。
  uploadedUrl.value = "";
  uploadError.value = "";
  registerError.value = "";
  progress.value = 0;
  fileError.value = "";
  file.value = picked;
  if (!picked) return;
  const invalid = validateUploadFile(picked);
  if (invalid) {
    file.value = null;
    resetFileInput();
    fileError.value = invalid;
  }
}

async function submit(): Promise<void> {
  // 同步置位：双击只发一次。
  if (submitting.value || !canSubmit.value) return;
  typeError.value = "";
  fileError.value = "";
  registerError.value = "";
  if (!materialType.value) {
    typeError.value = "请选择材料类型";
    return;
  }
  if (!file.value) {
    fileError.value = "请选择要上传的文件";
    return;
  }
  if (!uploadedUrl.value) {
    const invalid = validateUploadFile(file.value);
    if (invalid) {
      fileError.value = invalid;
      return;
    }
  }
  if (remarkTooLong.value) {
    registerError.value = `备注不能超过 ${MATERIAL_REMARK_MAX} 字，当前 ${remark.value.length} 字`;
    return;
  }

  submitting.value = true;
  const snapshot = captureSessionIdentity();
  const current = sequence;
  try {
    if (!uploadedUrl.value) {
      // 第 1 步：显式 category=material，漏传会把文件写进 thought 目录。
      progress.value = 0;
      uploadError.value = "";
      const uploaded = await uploadFile(file.value, "material", (percent) => {
        if (current === sequence && sessionOk(snapshot)) progress.value = percent;
      });
      if (current !== sequence || !sessionOk(snapshot)) return;
      uploadedUrl.value = uploaded.url;
      progress.value = 100;
    }

    // 第 2 步：登记。上传失败时执行不到这里，因此不会留下孤儿登记。
    try {
      await addMemberMaterial(props.userId, {
        materialType: materialType.value,
        file: uploadedUrl.value,
        fileName: file.value.name,
        remark: remark.value,
      });
    } catch (error) {
      if (current !== sequence || !sessionOk(snapshot)) return;
      // 文件已经落盘，路径必须保留：重新上传只会多一份无人引用的文件。
      registerError.value = `文件已上传但登记失败：${getApiErrorMessage(
        error,
        "请重试登记",
      )}。可调整材料类型或备注后再次提交，页面不会重复上传该文件。`;
      return;
    }
    if (current !== sequence || !sessionOk(snapshot)) return;
    ElMessage.success("培养材料已登记，档案将重新读取");
    emit("registered");
    visible.value = false;
  } catch (error) {
    if (current !== sequence || !sessionOk(snapshot)) return;
    // 第 1 步失败：不调登记接口，也不保留半成品路径。
    uploadError.value = getApiErrorMessage(error, "文件上传失败，请重试");
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
    reset();
    return;
  }
  cancelInFlight();
});

watch(
  () => props.userId,
  () => {
    cancelInFlight();
    reset();
  },
);

onBeforeUnmount(() => {
  disposed = true;
  cancelInFlight();
});
</script>

<template>
  <el-dialog
    v-model="visible"
    title="上传并登记培养材料"
    width="min(540px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    append-to-body
    @closed="cancelInFlight"
  >
    <div class="member-summary">
      <div class="summary-item">
        <span class="summary-label">归属成员</span>
        <span class="summary-value">{{ memberName || "未登记姓名" }}</span>
      </div>
    </div>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="material-upload-no-token"
      type="warning"
      :closable="false"
      show-icon
      title="上传培养材料需要登录"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不能上传或登记材料。</p>
      </template>
    </el-alert>

    <template v-else>
      <el-form label-width="88px" label-position="right" @submit.prevent>
        <el-form-item label="材料类型" :error="typeError">
          <el-select
            v-model="materialType"
            class="type-select"
            data-testid="material-upload-type"
            :disabled="submitting"
            placeholder="请选择材料类型"
          >
            <!-- 固定五项、固定顺序：不依赖后端错误文案里的顺序。 -->
            <el-option v-for="item in MATERIAL_TYPES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>

        <el-form-item label="材料文件" :error="fileError">
          <input
            ref="fileInput"
            class="file-input"
            data-testid="material-upload-file"
            type="file"
            :accept="UPLOAD_ACCEPT"
            :disabled="submitting"
            @change="chooseFile"
          />
          <p v-if="file" class="form-hint" data-testid="material-upload-file-name">
            已选择：{{ file.name }}（{{ Math.max(1, Math.round(file.size / 1024)) }} KB）
          </p>
          <p v-else class="form-hint">支持 pdf/doc/docx/jpg/jpeg/png/zip，单个文件不超过 10 MB。</p>
        </el-form-item>

        <el-form-item label="备注" :error="remarkTooLong ? `备注不能超过 ${MATERIAL_REMARK_MAX} 字` : ''">
          <el-input
            v-model="remark"
            type="textarea"
            :rows="2"
            :maxlength="MATERIAL_REMARK_MAX"
            show-word-limit
            :disabled="submitting"
            data-testid="material-upload-remark"
            placeholder="材料说明（可不填）"
          />
        </el-form-item>
      </el-form>

      <el-progress
        v-if="submitting || progress > 0"
        :percentage="progress"
        class="progress"
        data-testid="material-upload-progress"
      />
      <p v-if="uploadedUrl" class="form-hint" data-testid="material-upload-uploaded">
        文件已上传，等待登记。重新提交只会重发登记，不会重复上传该文件。
      </p>

      <el-alert
        v-if="uploadError"
        data-testid="material-upload-error"
        type="error"
        :closable="false"
        show-icon
        :title="uploadError"
      />
      <el-alert
        v-if="registerError"
        data-testid="material-register-error"
        type="error"
        :closable="false"
        show-icon
        :title="registerError"
      />

      <p class="form-hint">
        材料文件保存在服务端内部，本页只登记类型、文件名与备注，<strong>不提供下载或预览</strong>。提交顺序固定为「先上传文件、再登记信息」。
      </p>
    </template>

    <template #footer>
      <el-button :disabled="submitting" data-testid="material-upload-cancel" @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        data-testid="material-upload-submit"
        @click="submit"
      >
        {{ uploadedUrl ? "重试登记" : "上传并登记" }}
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

.type-select {
  width: 100%;
}

.file-input {
  font-size: 13px;
  max-width: 100%;
}

.progress {
  margin-bottom: 12px;
}

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.el-alert + .el-alert {
  margin-top: 12px;
}
</style>
