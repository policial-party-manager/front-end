<script setup lang="ts">
/**
 * ActivityForm.vue - 新建 / 编辑活动表单页
 *
 * 路由：
 *   /activity/create — 新建活动
 *   /activity/edit/:id — 编辑活动
 *
 * 权限说明：
 *   - super_admin（超级管理员）：所属支部可选全部
 *   - party_secretary（支委）：所属支部默认为本支部且不可修改
 *     【Mock 模拟】支委所属支部硬编码为"计算机学院学生第一党支部"
 *     TODO: 接入真实接口后，由后端根据当前登录用户的支部进行数据过滤
 */
import { ref, reactive, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules, UploadFile, UploadFiles } from "element-plus";
import { Plus, ArrowLeft } from "@element-plus/icons-vue";

const route = useRoute();
const router = useRouter();
const store = useAppStore();

// ============================================================
// 模式判断
// ============================================================
const isEditMode = computed(() => route.name === "ActivityEdit");
const editId = computed(() => (isEditMode.value ? Number(route.params.id) : null));

// ============================================================
// 角色权限
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
const isSecretary = computed(() => store.currentRole === "party_secretary");

// 支委所属支部（Mock 模拟）
// TODO: 接入真实接口后，从用户信息中获取所属支部
const branchOfSecretary = "计算机学院学生第一党支部";

// ============================================================
// 选项数据
// ============================================================

/** 活动类型选项 */
const activityTypeOptions = [
  { value: "", label: "请选择活动类型", disabled: true },
  { value: "组织生活", label: "组织生活" },
  { value: "主题党日", label: "主题党日" },
  { value: "党课学习", label: "党课学习" },
  { value: "二课活动", label: "二课活动" },
  { value: "志愿服务", label: "志愿服务" },
  { value: "其他", label: "其他" },
];

/** 支部选项（Mock） */
const branchOptions = [
  "计算机学院学生第一党支部",
  "计算机学院学生第二党支部",
  "软件学院学生党支部",
  "网络空间安全学院学生党支部",
];

/** 身份选项 */
const identityOptions = [
  { value: "入党申请人", label: "入党申请人" },
  { value: "积极分子", label: "积极分子" },
  { value: "发展对象", label: "发展对象" },
  { value: "预备党员", label: "预备党员" },
  { value: "正式党员", label: "正式党员" },
];

// ============================================================
// 表单引用
// ============================================================
const formRef = ref<FormInstance>();

// ============================================================
// 表单数据
// ============================================================
interface ActivityFormData {
  name: string;
  type: string;
  branch: string;
  location: string;
  description: string;
  coverUrl: string;
  activityStartTime: string;
  activityEndTime: string;
  signInStartTime: string;
  signInEndTime: string;
  participantScope: "all" | "specified";
  specifiedIdentities: string[];
}

const formData = reactive<ActivityFormData>({
  name: "",
  type: "",
  branch: "",
  location: "",
  description: "",
  coverUrl: "",
  activityStartTime: "",
  activityEndTime: "",
  signInStartTime: "",
  signInEndTime: "",
  participantScope: "all",
  specifiedIdentities: [],
});

// ============================================================
// 支委权限：设置默认支部
// ============================================================
if (isSecretary.value) {
  formData.branch = branchOfSecretary;
}

// ============================================================
// 封面图片上传
// ============================================================
const coverFileList = ref<UploadFile[]>([]);

/** el-upload change 事件：读取文件生成本地预览 */
function handleCoverChange(file: UploadFile, files: UploadFiles): void {
  // 限制只能上传一张
  coverFileList.value = [file];
  if (file.raw) {
    formData.coverUrl = URL.createObjectURL(file.raw);
  }
}

/** el-upload 移除文件 */
function handleCoverRemove(): void {
  coverFileList.value = [];
  // 释放之前的 object URL
  if (formData.coverUrl && formData.coverUrl.startsWith("blob:")) {
    URL.revokeObjectURL(formData.coverUrl);
  }
  formData.coverUrl = "";
}

/** 上传前校验文件类型与大小 */
function beforeCoverUpload(file: File): boolean {
  const isImage = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type);
  if (!isImage) {
    ElMessage.error("封面图片仅支持 JPG / PNG / GIF / WebP 格式");
    return false;
  }
  const isLt5M = file.size / 1024 / 1024 < 5;
  if (!isLt5M) {
    ElMessage.error("封面图片大小不能超过 5MB");
    return false;
  }
  return true;
}

// ============================================================
// 签到时间自动填充
// ============================================================
const signInTimesManuallySet = ref(false);

/** 在指定日期字符串上增减分钟数 */
function addMinutes(dateStr: string, minutes: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** 监听活动开始时间，自动填充签到开始时间（活动开始前 30 分钟） */
watch(
  () => formData.activityStartTime,
  (val) => {
    if (!val || signInTimesManuallySet.value) return;
    formData.signInStartTime = addMinutes(val, -30);
  },
);

/** 监听活动结束时间，自动填充签到截止时间（活动结束后 30 分钟） */
watch(
  () => formData.activityEndTime,
  (val) => {
    if (!val || signInTimesManuallySet.value) return;
    formData.signInEndTime = addMinutes(val, 30);
  },
);

/** 监听签到时间的用户手动修改 */
watch(
  () => formData.signInStartTime,
  () => {
    // 仅在非自动填充时标记为手动设置
    if (formData.activityStartTime && formData.signInStartTime) {
      const expected = addMinutes(formData.activityStartTime, -30);
      if (formData.signInStartTime !== expected) {
        signInTimesManuallySet.value = true;
      }
    }
  },
);

watch(
  () => formData.signInEndTime,
  () => {
    if (formData.activityEndTime && formData.signInEndTime) {
      const expected = addMinutes(formData.activityEndTime, 30);
      if (formData.signInEndTime !== expected) {
        signInTimesManuallySet.value = true;
      }
    }
  },
);

// ============================================================
// 自定义时间校验函数
// ============================================================

/** 校验活动结束时间 > 活动开始时间 */
function validateActivityEndTime(_rule: any, value: string, callback: (error?: Error) => void): void {
  if (!value) {
    callback(new Error("请选择活动结束时间"));
    return;
  }
  if (formData.activityStartTime && new Date(value) <= new Date(formData.activityStartTime)) {
    callback(new Error("活动结束时间必须晚于活动开始时间"));
    return;
  }
  callback();
}

/** 校验签到截止时间 > 签到开始时间 */
function validateSignInEndTime(_rule: any, value: string, callback: (error?: Error) => void): void {
  if (!value) {
    callback(new Error("请选择签到截止时间"));
    return;
  }
  if (formData.signInStartTime && new Date(value) <= new Date(formData.signInStartTime)) {
    callback(new Error("签到截止时间必须晚于签到开始时间"));
    return;
  }
  callback();
}

// ============================================================
// 表单校验规则
// ============================================================
const formRules: FormRules = {
  name: [
    { required: true, message: "请输入活动名称", trigger: "blur" },
    { min: 2, max: 50, message: "活动名称长度为 2 ~ 50 个字符", trigger: "blur" },
  ],
  type: [{ required: true, message: "请选择活动类型", trigger: "change" }],
  branch: [{ required: true, message: "请选择所属支部", trigger: "change" }],
  location: [
    { required: true, message: "请输入活动地点", trigger: "blur" },
    { max: 100, message: "活动地点不能超过 100 个字符", trigger: "blur" },
  ],
  activityStartTime: [{ required: true, message: "请选择活动开始时间", trigger: "change" }],
  activityEndTime: [
    { required: true, message: "请选择活动结束时间", trigger: "change" },
    { validator: validateActivityEndTime, trigger: "change" },
  ],
  signInStartTime: [{ required: true, message: "请选择签到开始时间", trigger: "change" }],
  signInEndTime: [
    { required: true, message: "请选择签到截止时间", trigger: "change" },
    { validator: validateSignInEndTime, trigger: "change" },
  ],
};

// ============================================================
// Mock 数据：编辑模式下根据 ID 获取活动详情
// TODO: 替换为真实 API 调用（GET /api/activity/:id）
// ============================================================
const editLoading = ref(false);

/** 模拟根据 ID 获取活动详情（含表单全部字段） */
async function fetchActivityDetail(id: number): Promise<ActivityFormData> {
  // 模拟接口延迟
  await new Promise((resolve) => setTimeout(resolve, 400));

  // Mock 数据集合（在列表页 Mock 基础上扩展）
  const mockDetailMap: Record<number, ActivityFormData> = {
    1: {
      name: "学习贯彻党的二十届三中全会精神主题党日",
      type: "主题党日",
      branch: "计算机学院学生第一党支部",
      location: "学院楼A座301会议室",
      description: "深入学习贯彻党的二十届三中全会精神，结合学院党建工作实际，开展专题学习研讨。",
      coverUrl: "",
      activityStartTime: "2026-08-15 14:00:00",
      activityEndTime: "2026-08-15 16:30:00",
      signInStartTime: "2026-08-15 13:30:00",
      signInEndTime: "2026-08-15 17:00:00",
      participantScope: "all",
      specifiedIdentities: [],
    },
    3: {
      name: "2026年第三季度支部组织生活会",
      type: "组织生活",
      branch: "计算机学院学生第二党支部",
      location: "学院楼B座201党员活动室",
      description: "开展批评与自我批评，总结第三季度支部工作，部署下一阶段重点任务。",
      coverUrl: "",
      activityStartTime: "2026-09-01 15:00:00",
      activityEndTime: "2026-09-01 17:00:00",
      signInStartTime: "2026-09-01 14:30:00",
      signInEndTime: "2026-09-01 17:30:00",
      participantScope: "specified",
      specifiedIdentities: ["预备党员", "正式党员"],
    },
    7: {
      name: "党史学习专题党课——从一大到二十大",
      type: "党课学习",
      branch: "计算机学院学生第二党支部",
      location: "学院楼C座阶梯教室101",
      description: "系统回顾中国共产党历次全国代表大会的历史背景、主要内容和重大意义。",
      coverUrl: "",
      activityStartTime: "2026-09-10 14:00:00",
      activityEndTime: "2026-09-10 16:00:00",
      signInStartTime: "2026-09-10 13:30:00",
      signInEndTime: "2026-09-10 16:30:00",
      participantScope: "all",
      specifiedIdentities: [],
    },
  };

  // 如果有对应 ID 的 Mock 数据则返回，否则生成默认编辑数据
  if (mockDetailMap[id]) {
    return mockDetailMap[id];
  }

  return {
    name: `活动 #${id}（Mock 编辑数据）`,
    type: "主题党日",
    branch: "计算机学院学生第一党支部",
    location: "学院楼会议室",
    description: "这是通过编辑模式加载的模拟活动数据。",
    coverUrl: "",
    activityStartTime: "2026-09-15 14:00:00",
    activityEndTime: "2026-09-15 16:00:00",
    signInStartTime: "2026-09-15 13:30:00",
    signInEndTime: "2026-09-15 16:30:00",
    participantScope: "all",
    specifiedIdentities: [],
  };
}

/** 加载编辑数据并回填表单 */
async function loadEditData(): Promise<void> {
  if (!editId.value) return;

  editLoading.value = true;
  try {
    const detail = await fetchActivityDetail(editId.value);

    // 回填表单
    formData.name = detail.name;
    formData.type = detail.type;
    formData.branch = detail.branch;
    formData.location = detail.location;
    formData.description = detail.description;
    formData.activityStartTime = detail.activityStartTime;
    formData.activityEndTime = detail.activityEndTime;
    formData.signInStartTime = detail.signInStartTime;
    formData.signInEndTime = detail.signInEndTime;
    formData.participantScope = detail.participantScope;
    formData.specifiedIdentities = detail.specifiedIdentities;

    // 封面回填（如果有的话）
    if (detail.coverUrl) {
      formData.coverUrl = detail.coverUrl;
      coverFileList.value = [{ name: "cover.jpg", url: detail.coverUrl } as UploadFile];
    }

    // 标记签到时间为已手动设置（编辑模式下不自动覆盖）
    signInTimesManuallySet.value = true;

    console.log("[Mock] 加载活动编辑数据：", detail.name);
  } catch {
    ElMessage.error("加载活动数据失败");
    router.push("/activity");
  } finally {
    editLoading.value = false;
  }
}

onMounted(() => {
  if (isEditMode.value) {
    loadEditData();
  }
});

// ============================================================
// 提交处理
// ============================================================

/** 表单提交中状态 */
const submitting = ref(false);

/** 保存草稿 — 状态为"未开始"，停留在当前页 */
async function handleSaveDraft(): Promise<void> {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
  } catch {
    ElMessage.warning("请完善表单必填信息后再保存");
    return;
  }

  submitting.value = true;
  try {
    // TODO: 替换为真实 API 调用（POST /api/activity 或 PUT /api/activity/:id）
    // const payload = { ...formData, status: '未开始' }
    // if (isEditMode.value) {
    //   await api.updateActivity(editId.value!, payload)
    // } else {
    //   await api.createActivity(payload)
    // }

    await new Promise((resolve) => setTimeout(resolve, 300));

    ElMessage.success(isEditMode.value ? "活动已更新（草稿）" : "活动已保存为草稿");
    console.log("[Mock] 保存草稿：", { ...formData, status: "未开始" });
  } finally {
    submitting.value = false;
  }
}

/** 发布活动 — 校验通过后保存并跳转到详情页 */
async function handlePublish(): Promise<void> {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
  } catch {
    ElMessage.warning("请完善表单必填信息后再发布");
    return;
  }

  submitting.value = true;
  try {
    // TODO: 替换为真实 API 调用
    // const payload = { ...formData }
    // let activityId: number
    // if (isEditMode.value) {
    //   await api.updateActivity(editId.value!, payload)
    //   activityId = editId.value!
    // } else {
    //   const res = await api.createActivity(payload)
    //   activityId = res.data.id
    // }

    await new Promise((resolve) => setTimeout(resolve, 300));

    ElMessage.success(isEditMode.value ? "活动已更新" : "活动发布成功");

    // 模拟新建时使用一个随机 ID 跳转
    const targetId = isEditMode.value ? editId.value! : Date.now();
    console.log("[Mock] 发布活动：", { id: targetId, ...formData });

    router.push(`/activity/${targetId}`);
  } finally {
    submitting.value = false;
  }
}

/** 取消 — 返回列表页 */
function handleCancel(): void {
  // 如果表单有未保存内容，给出提示
  const hasContent = formData.name || formData.type || formData.location;
  if (hasContent && !isEditMode.value) {
    ElMessageBox.confirm("确定要取消吗？未保存的内容将会丢失。", "提示", {
      confirmButtonText: "确定离开",
      cancelButtonText: "继续编辑",
      type: "warning",
    })
      .then(() => {
        router.push("/activity");
      })
      .catch(() => {
        // 用户选择继续编辑
      });
  } else {
    router.push("/activity");
  }
}

/** 返回按钮 */
function goBack(): void {
  handleCancel();
}
</script>

<template>
  <div class="activity-form-page" v-loading="editLoading" element-loading-text="正在加载活动数据...">
    <div class="page-container">
      <!-- ==================== 页面头部 ==================== -->
      <div class="page-header">
        <div class="header-left">
          <el-button text @click="goBack" class="back-btn">
            <el-icon><ArrowLeft /></el-icon>
            返回列表
          </el-button>
          <h2 class="section-title">
            {{ isEditMode ? "编辑活动" : "新建活动" }}
          </h2>
          <p class="page-desc">
            {{ isEditMode ? "修改活动信息并保存" : "填写活动信息，创建新的党建活动" }}
          </p>
        </div>
      </div>

      <!-- ==================== 表单 ==================== -->
      <div class="content-card">
        <el-form
          ref="formRef"
          :model="formData"
          :rules="formRules"
          label-width="120px"
          label-position="right"
          size="large"
          @submit.prevent
        >
          <!-- ========== 区块一：基本信息 ========== -->
          <div class="form-section">
            <h3 class="section-subtitle">基本信息</h3>

            <el-row :gutter="24">
              <!-- 活动名称 -->
              <el-col :span="24">
                <el-form-item label="活动名称" prop="name">
                  <el-input
                    v-model="formData.name"
                    placeholder="请输入活动名称"
                    maxlength="50"
                    show-word-limit
                    clearable
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="24">
              <!-- 活动类型 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="活动类型" prop="type">
                  <el-select v-model="formData.type" placeholder="请选择活动类型" style="width: 100%">
                    <el-option
                      v-for="item in activityTypeOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                      :disabled="item.disabled"
                    />
                  </el-select>
                </el-form-item>
              </el-col>

              <!-- 所属支部 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="所属支部" prop="branch">
                  <el-select
                    v-model="formData.branch"
                    placeholder="请选择所属支部"
                    style="width: 100%"
                    :disabled="isSecretary"
                  >
                    <el-option v-for="b in branchOptions" :key="b" :label="b" :value="b" />
                  </el-select>
                  <!-- 支委权限提示 -->
                  <span v-if="isSecretary" class="form-hint"> 支委仅可创建本支部活动 </span>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="24">
              <!-- 活动地点 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="活动地点" prop="location">
                  <el-input
                    v-model="formData.location"
                    placeholder="请输入活动地点"
                    maxlength="100"
                    show-word-limit
                    clearable
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="24">
              <!-- 活动简介 -->
              <el-col :span="24">
                <el-form-item label="活动简介" prop="description">
                  <el-input
                    v-model="formData.description"
                    type="textarea"
                    placeholder="请输入活动简介（选填）"
                    :rows="4"
                    maxlength="500"
                    show-word-limit
                    resize="none"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="24">
              <!-- 活动封面 -->
              <el-col :span="24">
                <el-form-item label="活动封面">
                  <div class="cover-upload-wrapper">
                    <el-upload
                      v-model:file-list="coverFileList"
                      list-type="picture-card"
                      :limit="1"
                      :auto-upload="false"
                      :on-change="handleCoverChange"
                      :on-remove="handleCoverRemove"
                      :before-upload="beforeCoverUpload"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                    >
                      <el-icon><Plus /></el-icon>
                    </el-upload>
                    <span class="upload-tip"> 支持 JPG / PNG / GIF / WebP 格式，大小不超过 5MB </span>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </div>

          <!-- ========== 区块二：时间设置 ========== -->
          <div class="form-section">
            <h3 class="section-subtitle">时间设置</h3>

            <el-row :gutter="24">
              <!-- 活动开始时间 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="活动开始时间" prop="activityStartTime">
                  <el-date-picker
                    v-model="formData.activityStartTime"
                    type="datetime"
                    placeholder="请选择活动开始时间"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    style="width: 100%"
                    :disabled-date="(date: Date) => date.getTime() < Date.now() - 86400000"
                  />
                </el-form-item>
              </el-col>

              <!-- 活动结束时间 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="活动结束时间" prop="activityEndTime">
                  <el-date-picker
                    v-model="formData.activityEndTime"
                    type="datetime"
                    placeholder="请选择活动结束时间"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    style="width: 100%"
                    :disabled-date="(date: Date) => date.getTime() < Date.now() - 86400000"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="24">
              <!-- 签到开始时间 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="签到开始时间" prop="signInStartTime">
                  <el-date-picker
                    v-model="formData.signInStartTime"
                    type="datetime"
                    placeholder="请选择签到开始时间"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    style="width: 100%"
                  />
                  <span class="form-hint"> 默认为活动开始前 30 分钟，可手动修改 </span>
                </el-form-item>
              </el-col>

              <!-- 签到截止时间 -->
              <el-col :xs="24" :sm="12">
                <el-form-item label="签到截止时间" prop="signInEndTime">
                  <el-date-picker
                    v-model="formData.signInEndTime"
                    type="datetime"
                    placeholder="请选择签到截止时间"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    style="width: 100%"
                  />
                  <span class="form-hint"> 默认为活动结束后 30 分钟，可手动修改 </span>
                </el-form-item>
              </el-col>
            </el-row>
          </div>

          <!-- ========== 区块三：参与范围 ========== -->
          <div class="form-section">
            <h3 class="section-subtitle">参与范围</h3>

            <!-- 参与范围单选框 -->
            <el-form-item label="参与范围">
              <el-radio-group v-model="formData.participantScope">
                <el-radio value="all">全部成员</el-radio>
                <el-radio value="specified">指定身份</el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 指定身份多选框（选择"指定身份"时显示） -->
            <el-form-item v-if="formData.participantScope === 'specified'" label="指定身份">
              <el-checkbox-group v-model="formData.specifiedIdentities">
                <el-checkbox
                  v-for="item in identityOptions"
                  :key="item.value"
                  :value="item.value"
                  :label="item.value"
                />
              </el-checkbox-group>
              <span v-if="formData.specifiedIdentities.length === 0" class="form-hint form-hint-warning">
                请至少选择一个身份
              </span>
            </el-form-item>
          </div>
        </el-form>
      </div>

      <!-- ==================== 底部操作栏 ==================== -->
      <div class="form-footer">
        <div class="footer-inner">
          <el-button size="large" @click="handleCancel" :disabled="submitting"> 取消 </el-button>
          <div class="footer-right">
            <el-button size="large" @click="handleSaveDraft" :loading="submitting"> 保存草稿 </el-button>
            <el-button type="primary" size="large" @click="handlePublish" :loading="submitting">
              {{ isEditMode ? "保存并查看" : "发布活动" }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * ActivityForm.vue 样式
 * ============================================================ */

.activity-form-page {
  padding: 24px 0 40px;
}

/* ---- 页面头部 ---- */
.page-header {
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.back-btn {
  align-self: flex-start;
  padding-left: 0;
  color: var(--text-secondary, #909399);
  font-size: 14px;

  &:hover {
    color: var(--party-red, #c12c1f);
  }
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 2px;
}

/* ---- 表单区块 ---- */
.form-section {
  margin-bottom: 32px;
  padding-bottom: 32px;
  border-bottom: 1px solid var(--border-color, #ebeef5);

  &:last-of-type {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
}

.section-subtitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2c3e50);
  margin-bottom: 20px;

  &::before {
    content: "";
    display: inline-block;
    width: 4px;
    height: 18px;
    background: var(--party-red, #c12c1f);
    border-radius: 2px;
    margin-right: 10px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
}

/* ---- 表单提示 ---- */
.form-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #909399);
  margin-top: 4px;
  line-height: 1.4;
}

.form-hint-warning {
  color: var(--party-red, #c12c1f);
  font-weight: 500;
}

/* ---- 封面上传 ---- */
.cover-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-tip {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

/* ---- 底部操作栏 ---- */
.form-footer {
  margin-top: 24px;
  background: var(--bg-white, #ffffff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 24px;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-right {
  display: flex;
  gap: 12px;
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .activity-form-page :deep(.el-form-item__label) {
    text-align: left;
  }

  .footer-inner {
    flex-direction: column;
    gap: 12px;
  }

  .footer-right {
    width: 100%;

    .el-button {
      flex: 1;
    }
  }
}

@media (max-width: 576px) {
  .form-section {
    margin-bottom: 24px;
    padding-bottom: 24px;
  }
}
</style>
