<script setup lang="ts">
/**
 * AdjustIdentityDialog.vue - 调整身份弹窗组件
 *
 * 在成员培养主页点击【调整身份】按钮时弹出。
 * 支持选择目标身份、填写调整原因。
 *
 * Props:
 *   visible    - 弹窗显隐（配合 v-model:visible 使用）
 *   memberInfo - 成员基本信息 { id, name, studentNo, currentIdentity }
 *
 * Emits:
 *   update:visible - 弹窗关闭时触发
 *   success        - 调整成功后触发，通知父组件刷新数据
 */

import { ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance } from "element-plus";

// ============================================================
// Types
// ============================================================
export interface MemberInfo {
  id: string | number | null;
  name: string;
  studentNo: string;
  currentIdentity: string;
}

interface IdentityOption {
  value: string;
  label: string;
}

interface FormData {
  targetIdentity: string;
  reason: string;
}

// ============================================================
// Props & Emits
// ============================================================
const props = defineProps<{
  visible: boolean;
  memberInfo: MemberInfo;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "success"): void;
}>();

// ============================================================
// 身份列表（所有可选身份）
// ============================================================
const identityOptions: IdentityOption[] = [
  { value: "入党申请人", label: "入党申请人" },
  { value: "积极分子", label: "积极分子" },
  { value: "发展对象", label: "发展对象" },
  { value: "预备党员", label: "预备党员" },
  { value: "正式党员", label: "正式党员" },
];

// ============================================================
// 身份标签颜色映射（用于当前身份展示）
// ============================================================
const identityTagMap: Record<string, string> = {
  入党申请人: "info",
  积极分子: "warning",
  发展对象: "primary",
  预备党员: "success",
  正式党员: "danger",
};

// ============================================================
// 表单相关
// ============================================================
const formRef = ref<FormInstance | null>(null);

// 表单数据
const formData = ref<FormData>({
  targetIdentity: "", // 目标身份
  reason: "", // 调整原因
});

// 表单校验规则
const formRules = {
  targetIdentity: [{ required: true, message: "请选择目标身份", trigger: "change" }],
  reason: [
    { required: true, message: "请填写调整原因", trigger: "blur" },
    { min: 10, message: "调整原因至少 10 个字", trigger: "blur" },
  ],
};

// 提交加载状态
const submitting = ref(false);

// ============================================================
// 监听弹窗打开，重置表单
// ============================================================
watch(
  () => props.visible,
  (newVal: boolean) => {
    if (newVal) {
      resetForm();
    }
  },
);

// ============================================================
// 重置表单
// ============================================================
function resetForm(): void {
  formData.value = {
    targetIdentity: "",
    reason: "",
  };
  // 清除表单校验状态
  if (formRef.value) {
    formRef.value.clearValidate();
  }
}

// ============================================================
// 关闭弹窗
// ============================================================
function handleClose(): void {
  emit("update:visible", false);
}

// ============================================================
// 确认调整
// ============================================================
async function handleConfirm(): Promise<void> {
  // 1. 表单校验
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  // 2. 二次确认
  try {
    await confirmAdjust();
  } catch {
    // 用户取消
    return;
  }

  // 3. 提交调整
  submitting.value = true;
  try {
    // TODO: 替换为真实 API 调用
    // await api.adjustIdentity({
    //   memberId: props.memberInfo.id,
    //   targetIdentity: formData.value.targetIdentity,
    //   reason: formData.value.reason,    // })

    // 模拟接口延迟
    await new Promise((resolve) => setTimeout(resolve, 500));

    ElMessage.success("身份调整成功");
    emit("success");
    emit("update:visible", false);
  } catch {
    ElMessage.error("身份调整失败，请重试");
  } finally {
    submitting.value = false;
  }
}

// ============================================================
// 二次确认弹窗
// ============================================================
async function confirmAdjust(): Promise<void> {
  const targetLabel =
    identityOptions.find((i) => i.value === formData.value.targetIdentity)?.label || formData.value.targetIdentity;
  const currentIdentity = props.memberInfo.currentIdentity || "未知";
  const message = `
    <div style="line-height: 2; font-size: 14px;">
      <p><strong>成员姓名：</strong>${props.memberInfo.name || "-"}</p>
      <p><strong>学号：</strong>${props.memberInfo.studentNo || "-"}</p>
      <p><strong>当前身份：</strong>${currentIdentity}</p>
      <p><strong>目标身份：</strong><span style="color: #C12C1F; font-weight: 600;">${targetLabel}</span></p>
      <p><strong>调整原因：</strong>${formData.value.reason}</p>
    </div>
  `;

  await ElMessageBox.confirm(message, "确认调整身份", {
    confirmButtonText: "确认调整",
    cancelButtonText: "取消",
    type: "warning",
    dangerouslyUseHTMLString: true,
    confirmButtonClass: "el-button--danger",
  });
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="调整身份"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <!-- 成员基本信息（只读） -->
    <div class="member-summary">
      <div class="summary-item">
        <span class="summary-label">成员姓名</span>
        <span class="summary-value">{{ memberInfo.name || "-" }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">学号</span>
        <span class="summary-value">{{ memberInfo.studentNo || "-" }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">当前身份</span>
        <el-tag :type="identityTagMap[memberInfo.currentIdentity] || 'info'" size="small">
          {{ memberInfo.currentIdentity || "未知" }}
        </el-tag>
      </div>
    </div>

    <!-- 调整表单 -->
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="100px"
      label-position="right"
      class="adjust-form"
    >
      <!-- 目标身份 -->
      <el-form-item label="目标身份" prop="targetIdentity">
        <el-select v-model="formData.targetIdentity" placeholder="请选择目标身份" style="width: 100%">
          <el-option
            v-for="item in identityOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
            :disabled="item.value === memberInfo.currentIdentity"
          >
            <span>{{ item.label }}</span>
            <el-tag v-if="item.value === memberInfo.currentIdentity" size="small" type="info" style="margin-left: 8px">
              当前身份
            </el-tag>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- 调整原因 -->
      <el-form-item label="调整原因" prop="reason">
        <el-input
          v-model="formData.reason"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="请填写调整身份的原因（至少 10 个字）"
        />
      </el-form-item>
    </el-form>

    <!-- 底部按钮 -->
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="danger" :loading="submitting" @click="handleConfirm"> 确认调整 </el-button>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
/* ---- 成员信息摘要 ---- */
.member-summary {
  background: var(--party-red-bg, rgba(193, 44, 31, 0.08));
  border-radius: var(--radius-base, 8px);
  padding: 16px 20px;
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px 32px;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

.summary-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #2c3e50);
}

/* ---- 表单 ---- */
.adjust-form {
  margin-top: 4px;
}

.form-tip {
  font-size: 12px;
  color: var(--text-placeholder, #c0c4cc);
  margin-top: 4px;
  line-height: 1.4;
}

/* ---- 联系人选项 ---- */
.teacher-option {
  display: flex;
  align-items: center;
  gap: 8px;

  .teacher-title {
    font-size: 12px;
    color: var(--text-secondary, #909399);
  }

  .teacher-dept {
    font-size: 12px;
    color: var(--text-placeholder, #c0c4cc);
    margin-left: auto;
  }
}
</style>
