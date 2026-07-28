<script setup lang="ts">
/**
 * resources/index.vue — 下载专区模块
 *
 * 功能：
 *   1. 页面头部（标题 + 上传按钮，仅超管/支委可见）
 *   2. 搜索筛选栏（分类下拉 + 关键词搜索）
 *   3. 资源卡片网格（文件图标、标题、分类标签、下载次数、上传时间、操作按钮）
 *   4. 上传文件弹窗（标题、分类、描述、文件上传）
 *   5. 详情弹窗（文件信息、描述、预览、下载）
 *   6. 删除二次确认
 *
 * 权限说明：
 *   - super_admin（超级管理员）：所有操作权限
 *   - party_secretary（支委）：上传、编辑、删除本支部上传的资源
 *     实现思路：为每条资源记录 uploaderBranch 字段，支委仅可操作 uploaderBranch
 *     与当前用户所属支部匹配的资源。当前 Mock 阶段通过 uploaderRole 字段模拟，
 *     支委可编辑 uploaderRole === 'party_secretary' 的资源。
 *   - party_member（普通党员）：仅查看和下载
 *   - activist（积极分子）：仅查看和下载
 *
 * TODO: 接入真实 API 后，替换所有 Mock 数据与上传逻辑
 */
import { ref, computed, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Upload,
  Search,
  RefreshRight,
  Download,
  View,
  Edit,
  Delete,
  PictureFilled,
  Document,
  Grid,
} from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import type { Role } from "@/stores/app";
import type { UploadFile, UploadFiles } from "element-plus";

// ============================================================
// Store & 权限
// ============================================================
const store = useAppStore();
const currentRole = computed<Role>(() => store.currentRole);

/** 是否有上传/编辑/删除权限 */
const canManage = computed(() => currentRole.value === "super_admin" || currentRole.value === "party_secretary");

/** 是否为超级管理员（可操作全部资源） */
const isSuperAdmin = computed(() => currentRole.value === "super_admin");

// ============================================================
// 类型定义
// ============================================================

type ResourceCategory = "申请书模板" | "思想汇报" | "学习资料" | "常用表格" | "其他";

interface ResourceItem {
  id: number;
  title: string;
  category: ResourceCategory;
  description: string;
  fileName: string;
  fileType: string; // 文件扩展名：pdf, doc, docx, xls, xlsx, jpg, png 等
  fileSize: string; // 如 "2.3 MB"
  downloadCount: number;
  uploadTime: string; // ISO 日期字符串
  uploader: string;
  uploaderRole: Role; // 上传者角色（Mock 权限判断用）
  uploaderBranch: string; // 上传者所属支部（支委权限判断用）
}

interface UploadFormData {
  title: string;
  category: ResourceCategory | "";
  description: string;
}

// ============================================================
// 分类配置
// ============================================================

const CATEGORY_OPTIONS: { label: string; value: ResourceCategory | "" }[] = [
  { label: "全部", value: "" },
  { label: "申请书模板", value: "申请书模板" },
  { label: "思想汇报", value: "思想汇报" },
  { label: "学习资料", value: "学习资料" },
  { label: "常用表格", value: "常用表格" },
  { label: "其他", value: "其他" },
];

const CATEGORY_COLOR_MAP: Record<ResourceCategory, string> = {
  申请书模板: "#C12C1F",
  思想汇报: "#E6A23C",
  学习资料: "#409EFF",
  常用表格: "#67C23A",
  其他: "#909399",
};

/** 文件类型 → 图标/颜色映射 */
const FILE_TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pdf: { icon: Document, color: "#E84646", label: "PDF" },
  doc: { icon: Document, color: "#409EFF", label: "Word" },
  docx: { icon: Document, color: "#409EFF", label: "Word" },
  xls: { icon: Grid, color: "#67C23A", label: "Excel" },
  xlsx: { icon: Grid, color: "#67C23A", label: "Excel" },
  jpg: { icon: PictureFilled, color: "#E6A23C", label: "图片" },
  jpeg: { icon: PictureFilled, color: "#E6A23C", label: "图片" },
  png: { icon: PictureFilled, color: "#E6A23C", label: "图片" },
  gif: { icon: PictureFilled, color: "#E6A23C", label: "图片" },
};

function getFileConfig(ext: string) {
  return FILE_TYPE_CONFIG[ext.toLowerCase()] || { icon: Document, color: "#909399", label: ext.toUpperCase() };
}

function isImageType(ext: string): boolean {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext.toLowerCase());
}

// ============================================================
// Mock 数据（14 条，覆盖全部分类）
// ============================================================

function generateMockResources(): ResourceItem[] {
  return [
    {
      id: 1,
      title: "入党申请书模板（2026版）",
      category: "申请书模板",
      description:
        "适用于2026年度入党申请书撰写的标准模板，包含格式规范与内容要点说明。请根据个人实际情况填写具体内容。",
      fileName: "入党申请书模板_2026版.pdf",
      fileType: "pdf",
      fileSize: "1.2 MB",
      downloadCount: 1428,
      uploadTime: "2026-06-15",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 2,
      title: "转正申请书模板",
      category: "申请书模板",
      description: "预备党员转正申请书标准模板，含写作规范与范例参考。",
      fileName: "转正申请书模板.docx",
      fileType: "docx",
      fileSize: "856 KB",
      downloadCount: 967,
      uploadTime: "2026-06-10",
      uploader: "李支委",
      uploaderRole: "party_secretary",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 3,
      title: "2026年第三季度思想汇报撰写指南",
      category: "思想汇报",
      description: "第三季度思想汇报主题方向、撰写要求及提交流程说明，包含参考选题和格式规范。",
      fileName: "2026年Q3思想汇报指南.pdf",
      fileType: "pdf",
      fileSize: "2.1 MB",
      downloadCount: 856,
      uploadTime: "2026-07-01",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 4,
      title: "思想汇报范文汇编（5篇）",
      category: "思想汇报",
      description: "精选5篇优秀思想汇报范文，涵盖理论学习、社会实践、志愿服务等主题方向。",
      fileName: "思想汇报范文汇编.docx",
      fileType: "docx",
      fileSize: "3.4 MB",
      downloadCount: 1234,
      uploadTime: "2026-05-20",
      uploader: "王支委",
      uploaderRole: "party_secretary",
      uploaderBranch: "软件学院学生党支部",
    },
    {
      id: 5,
      title: "中国共产党章程（二十大修订版）",
      category: "学习资料",
      description: "中国共产党第二十次全国代表大会修订通过的《中国共产党章程》全文。",
      fileName: "中国共产党章程_二十大修订版.pdf",
      fileType: "pdf",
      fileSize: "4.8 MB",
      downloadCount: 2356,
      uploadTime: "2026-03-15",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 6,
      title: "习近平新时代中国特色社会主思想学习纲要",
      category: "学习资料",
      description: "《习近平新时代中国特色社会主义思想学习纲要》全文，包含核心要义和精神实质解读。",
      fileName: "习近平新时代中国特色社会主义思想学习纲要.pdf",
      fileType: "pdf",
      fileSize: "6.2 MB",
      downloadCount: 1890,
      uploadTime: "2026-04-01",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 7,
      title: "发展党员工作流程图解",
      category: "学习资料",
      description: "以流程图形式展示发展党员全过程各环节，包含时间节点要求和材料清单。",
      fileName: "发展党员工作流程图解.png",
      fileType: "png",
      fileSize: "1.8 MB",
      downloadCount: 756,
      uploadTime: "2026-05-10",
      uploader: "李支委",
      uploaderRole: "party_secretary",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 8,
      title: "党员发展对象培养考察登记表",
      category: "常用表格",
      description: "发展对象培养考察期间使用的登记表格，需按季度填写培养考察情况。",
      fileName: "培养考察登记表.xlsx",
      fileType: "xlsx",
      fileSize: "512 KB",
      downloadCount: 678,
      uploadTime: "2026-06-20",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 9,
      title: "党支部活动签到表",
      category: "常用表格",
      description: "党支部组织活动签到用表，含姓名、学号、签到时间、备注等字段。",
      fileName: "党支部活动签到表.xlsx",
      fileType: "xlsx",
      fileSize: "328 KB",
      downloadCount: 534,
      uploadTime: "2026-06-25",
      uploader: "赵支委",
      uploaderRole: "party_secretary",
      uploaderBranch: "网络空间安全学院学生党支部",
    },
    {
      id: 10,
      title: "党员基本信息登记表",
      category: "常用表格",
      description: "党员基本信息采集登记表，用于建立和维护党员信息档案。",
      fileName: "党员基本信息登记表.xls",
      fileType: "xls",
      fileSize: "445 KB",
      downloadCount: 892,
      uploadTime: "2026-05-05",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 11,
      title: "主题党日活动照片集锦",
      category: "其他",
      description: "2026年上半年各支部主题党日活动照片集锦，共收录60张精选照片。",
      fileName: "主题党日活动照片集锦.jpg",
      fileType: "jpg",
      fileSize: "8.5 MB",
      downloadCount: 345,
      uploadTime: "2026-07-15",
      uploader: "宣传委员",
      uploaderRole: "party_secretary",
      uploaderBranch: "人工智能学院学生党支部",
    },
    {
      id: 12,
      title: "党校培训结业证书模板",
      category: "其他",
      description: "党校培训课程结业证书样式模板，适用于积极分子和发展对象培训结业使用。",
      fileName: "党校培训结业证书模板.pdf",
      fileType: "pdf",
      fileSize: "1.5 MB",
      downloadCount: 456,
      uploadTime: "2026-04-20",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 13,
      title: "入党志愿书填写规范说明",
      category: "申请书模板",
      description: "《入党志愿书》逐项填写规范说明，确保填写内容完整、规范、准确。",
      fileName: "入党志愿书填写规范说明.pdf",
      fileType: "pdf",
      fileSize: "1.8 MB",
      downloadCount: 1123,
      uploadTime: "2026-06-01",
      uploader: "张书记",
      uploaderRole: "super_admin",
      uploaderBranch: "计算机学院学生第一党支部",
    },
    {
      id: 14,
      title: "党的二十大精神学习心得汇编",
      category: "学习资料",
      description: "各支部党员学习党的二十大精神心得体会汇编，共收录30篇优秀心得。",
      fileName: "二十大精神学习心得汇编.docx",
      fileType: "docx",
      fileSize: "4.2 MB",
      downloadCount: 1567,
      uploadTime: "2026-03-28",
      uploader: "李支委",
      uploaderRole: "party_secretary",
      uploaderBranch: "计算机学院学生第一党支部",
    },
  ];
}

// ============================================================
// 响应式状态
// ============================================================

const loading = ref(true);
const resources = ref<ResourceItem[]>([]);
const filteredResources = ref<ResourceItem[]>([]);

// ---- 搜索筛选 ----
const filterCategory = ref<ResourceCategory | "">("");
const filterKeyword = ref("");

// ---- 上传弹窗 ----
const uploadDialogVisible = ref(false);
const uploadFormRef = ref();
const uploading = ref(false);
const uploadFormData = reactive<UploadFormData>({
  title: "",
  category: "",
  description: "",
});
const uploadedFile = ref<File | null>(null);
const uploadedFileName = ref("");

const uploadFormRules = {
  title: [{ required: true, message: "请输入文件标题", trigger: "blur" }],
  category: [{ required: true, message: "请选择分类", trigger: "change" }],
};

// ---- 详情弹窗 ----
const detailDialogVisible = ref(false);
const currentDetail = ref<ResourceItem | null>(null);

// ---- 编辑弹窗（复用上传弹窗结构） ----
const editDialogVisible = ref(false);
const editingResource = ref<ResourceItem | null>(null);
const editFormRef = ref();
const saving = ref(false);
const editFormData = reactive<UploadFormData>({
  title: "",
  category: "",
  description: "",
});

// ============================================================
// 计算属性
// ============================================================

/** 获取分类标签颜色 */
function getCategoryColor(category: ResourceCategory): string {
  return CATEGORY_COLOR_MAP[category] || "#909399";
}

/** 判断当前用户是否可以编辑某条资源 */
function canEditResource(item: ResourceItem): boolean {
  if (isSuperAdmin.value) return true;
  // 支委可编辑本支部上传的资源
  if (currentRole.value === "party_secretary" && item.uploaderRole === "party_secretary") return true;
  return false;
}

/** 判断当前用户是否可以删除某条资源 */
function canDeleteResource(item: ResourceItem): boolean {
  return canEditResource(item);
}

// ============================================================
// 搜索筛选
// ============================================================

function applyFilter(): void {
  let result = [...resources.value];

  if (filterCategory.value) {
    result = result.filter((item) => item.category === filterCategory.value);
  }

  if (filterKeyword.value.trim()) {
    const keyword = filterKeyword.value.trim().toLowerCase();
    result = result.filter(
      (item) => item.title.toLowerCase().includes(keyword) || item.fileName.toLowerCase().includes(keyword),
    );
  }

  filteredResources.value = result;
}

function handleSearch(): void {
  applyFilter();
}

function handleReset(): void {
  filterCategory.value = "";
  filterKeyword.value = "";
  applyFilter();
}

// ============================================================
// 上传文件
// ============================================================

function handleOpenUploadDialog(): void {
  uploadFormData.title = "";
  uploadFormData.category = "";
  uploadFormData.description = "";
  uploadedFile.value = null;
  uploadedFileName.value = "";
  uploadDialogVisible.value = true;
  // 重置表单校验
  setTimeout(() => uploadFormRef.value?.clearValidate(), 0);
}

function handleFileChange(file: UploadFile, _uploadFiles: UploadFiles): void {
  uploadedFile.value = file.raw || null;
  uploadedFileName.value = file.name || "";
}

function handleFileRemove(): void {
  uploadedFile.value = null;
  uploadedFileName.value = "";
}

async function handleUploadSubmit(): Promise<void> {
  const valid = await uploadFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  if (!uploadedFile.value) {
    ElMessage.warning("请选择要上传的文件");
    return;
  }

  uploading.value = true;

  // 模拟上传延迟
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 根据文件扩展名推断类型
  const fileName = uploadedFile.value.name;
  const ext = fileName.split(".").pop()?.toLowerCase() || "unknown";
  const fileSizeMB = uploadedFile.value.size / (1024 * 1024);

  const newResource: ResourceItem = {
    id: Math.max(...resources.value.map((r) => r.id), 0) + 1,
    title: uploadFormData.title,
    category: uploadFormData.category as ResourceCategory,
    description: uploadFormData.description || "暂无描述",
    fileName,
    fileType: ext,
    fileSize: fileSizeMB >= 1 ? `${fileSizeMB.toFixed(1)} MB` : `${Math.round(uploadedFile.value.size / 1024)} KB`,
    downloadCount: 0,
    uploadTime: new Date().toISOString().split("T")[0],
    uploader: store.userInfo.name,
    uploaderRole: currentRole.value,
    uploaderBranch: "当前用户所属支部", // TODO: 接入真实用户所属支部
  };

  resources.value.unshift(newResource);
  applyFilter();
  uploading.value = false;
  uploadDialogVisible.value = false;

  ElMessage.success(`文件"${fileName}"上传成功！`);
}

// ============================================================
// 编辑资源
// ============================================================

function handleOpenEditDialog(item: ResourceItem): void {
  editingResource.value = item;
  editFormData.title = item.title;
  editFormData.category = item.category;
  editFormData.description = item.description;
  editDialogVisible.value = true;
  setTimeout(() => editFormRef.value?.clearValidate(), 0);
}

async function handleEditSubmit(): Promise<void> {
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  if (!editingResource.value) return;

  saving.value = true;
  // 模拟保存延迟
  await new Promise((resolve) => setTimeout(resolve, 600));

  const target = resources.value.find((r) => r.id === editingResource.value!.id);
  if (target) {
    target.title = editFormData.title;
    target.category = editFormData.category as ResourceCategory;
    target.description = editFormData.description;
  }

  applyFilter();
  saving.value = false;
  editDialogVisible.value = false;

  ElMessage.success("资源信息更新成功！");
}

// ============================================================
// 删除资源
// ============================================================

async function handleDelete(item: ResourceItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定要删除资源"${item.title}"吗？删除后不可恢复。`, "删除确认", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning",
      confirmButtonClass: "el-button--danger",
    });

    resources.value = resources.value.filter((r) => r.id !== item.id);
    applyFilter();
    ElMessage.success(`资源"${item.title}"已删除`);
  } catch {
    // 用户取消删除
  }
}

// ============================================================
// 下载 & 详情
// ============================================================

function handleDownload(item: ResourceItem): void {
  // 模拟下载
  item.downloadCount++;
  ElMessage.success(`开始下载：${item.fileName}`);
  // TODO: 接入真实下载链接
}

function handleOpenDetail(item: ResourceItem): void {
  currentDetail.value = item;
  detailDialogVisible.value = true;
}

function handleDownloadFromDetail(): void {
  if (currentDetail.value) {
    handleDownload(currentDetail.value);
  }
}

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  // 模拟接口加载
  setTimeout(() => {
    resources.value = generateMockResources();
    filteredResources.value = [...resources.value];
    loading.value = false;
  }, 600);
});
</script>

<template>
  <div class="resources-page">
    <div class="page-container">
      <!-- ==================== 页面头部 ==================== -->
      <div class="page-header">
        <h2 class="section-title">下载专区</h2>
        <p class="page-desc">党建学习文档资源下载，支持申请书模板、思想汇报、学习资料、常用表格等分类检索与下载</p>
      </div>

      <!-- ==================== 资源列表卡片 ==================== -->
      <div v-loading="loading" class="content-card">
        <!-- 卡片标题栏 -->
        <div class="card-header">
          <span class="card-title">资源列表</span>
          <div class="card-actions">
            <el-button v-if="canManage" type="primary" :icon="Upload" @click="handleOpenUploadDialog">
              上传文件
            </el-button>
          </div>
        </div>

        <!-- 搜索筛选栏 -->
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <!-- 资源分类 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">资源分类</label>
                <el-select v-model="filterCategory" placeholder="全部" clearable style="width: 100%">
                  <el-option v-for="opt in CATEGORY_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
                </el-select>
              </div>
            </el-col>

            <!-- 关键词搜索 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">关键词搜索</label>
                <el-input v-model="filterKeyword" placeholder="搜索标题或文件名" clearable @keyup.enter="handleSearch">
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-col>

            <!-- 搜索 / 重置按钮 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item filter-actions">
                <label class="filter-label">&nbsp;</label>
                <div class="btn-group">
                  <el-button type="primary" @click="handleSearch">
                    <el-icon><Search /></el-icon>
                    搜索
                  </el-button>
                  <el-button @click="handleReset">
                    <el-icon><RefreshRight /></el-icon>
                    重置
                  </el-button>
                  <span v-if="filterCategory || filterKeyword" class="result-count">
                    {{ filteredResources.length }} 条结果
                  </span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- ==================== 资源卡片网格 ==================== -->
        <div v-if="filteredResources.length > 0" class="resource-grid">
          <div v-for="item in filteredResources" :key="item.id" class="resource-card">
            <!-- 文件图标区域 -->
            <div class="card-icon" :style="{ background: getFileConfig(item.fileType).color + '12' }">
              <el-icon :size="40" :color="getFileConfig(item.fileType).color">
                <component :is="getFileConfig(item.fileType).icon" />
              </el-icon>
              <span class="file-type-badge" :style="{ background: getFileConfig(item.fileType).color }">
                {{ getFileConfig(item.fileType).label }}
              </span>
            </div>

            <!-- 卡片内容 -->
            <div class="card-body">
              <h3 class="card-title" @click="handleOpenDetail(item)">
                {{ item.title }}
              </h3>
              <div class="card-meta">
                <el-tag :color="getCategoryColor(item.category)" effect="dark" size="small" round>
                  {{ item.category }}
                </el-tag>
                <span class="meta-downloads">
                  <el-icon><Download /></el-icon>
                  {{ item.downloadCount }} 次
                </span>
              </div>
              <div class="card-footer">
                <span class="meta-time">{{ item.uploadTime }}</span>
                <div class="card-actions">
                  <el-button type="primary" size="small" :icon="Download" text @click="handleDownload(item)">
                    下载
                  </el-button>
                  <el-button size="small" :icon="View" text @click="handleOpenDetail(item)"> 详情 </el-button>
                  <el-button
                    v-if="canEditResource(item)"
                    size="small"
                    :icon="Edit"
                    text
                    @click="handleOpenEditDialog(item)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-if="canDeleteResource(item)"
                    size="small"
                    :icon="Delete"
                    text
                    type="danger"
                    @click="handleDelete(item)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty v-else description="暂无符合条件的资源" :image-size="120" />

        <!-- 结果统计 -->
        <div v-if="!loading" class="table-footer">
          <span class="total-info">共 {{ filteredResources.length }} 条资源</span>
        </div>
      </div>
    </div>

    <!-- ==================== 上传文件弹窗 ==================== -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="上传文件"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="uploadFormRef"
        :model="uploadFormData"
        :rules="uploadFormRules"
        label-width="90px"
        label-position="right"
      >
        <el-form-item label="文件标题" prop="title">
          <el-input v-model="uploadFormData.title" placeholder="请输入文件标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="uploadFormData.category" placeholder="请选择资源分类" style="width: 100%">
            <el-option
              v-for="opt in CATEGORY_OPTIONS.filter((o) => o.value !== '')"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="文件描述">
          <el-input
            v-model="uploadFormData.description"
            type="textarea"
            placeholder="请输入文件描述（选填）"
            :rows="3"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="选择文件" required>
          <el-upload
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.bmp"
            drag
          >
            <el-icon class="el-icon--upload"><Upload /></el-icon>
            <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 PDF、Word、Excel、图片格式，单个文件不超过 20MB</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="handleUploadSubmit"> 确认上传 </el-button>
      </template>
    </el-dialog>

    <!-- ==================== 详情弹窗 ==================== -->
    <el-dialog
      v-model="detailDialogVisible"
      title="资源详情"
      width="600px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <template v-if="currentDetail">
        <div class="detail-body">
          <!-- 文件预览区域 -->
          <div class="detail-preview" :style="{ background: getFileConfig(currentDetail.fileType).color + '10' }">
            <!-- 图片直接预览 -->
            <img
              v-if="isImageType(currentDetail.fileType)"
              :src="'https://picsum.photos/seed/' + currentDetail.id + '/600/400'"
              :alt="currentDetail.title"
              class="preview-image"
            />
            <!-- 其他文件显示图标 -->
            <div v-else class="preview-icon">
              <el-icon :size="64" :color="getFileConfig(currentDetail.fileType).color">
                <component :is="getFileConfig(currentDetail.fileType).icon" />
              </el-icon>
              <span class="preview-type">{{ getFileConfig(currentDetail.fileType).label }} 文件</span>
            </div>
          </div>

          <!-- 文件信息 -->
          <div class="detail-info">
            <h3 class="detail-title">{{ currentDetail.title }}</h3>
            <div class="detail-meta-grid">
              <div class="meta-item">
                <span class="meta-label">分类</span>
                <el-tag :color="getCategoryColor(currentDetail.category)" effect="dark" size="small" round>
                  {{ currentDetail.category }}
                </el-tag>
              </div>
              <div class="meta-item">
                <span class="meta-label">文件名</span>
                <span class="meta-value">{{ currentDetail.fileName }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">文件大小</span>
                <span class="meta-value">{{ currentDetail.fileSize }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">上传时间</span>
                <span class="meta-value">{{ currentDetail.uploadTime }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">上传者</span>
                <span class="meta-value">{{ currentDetail.uploader }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">下载次数</span>
                <span class="meta-value highlight">{{ currentDetail.downloadCount }} 次</span>
              </div>
            </div>

            <div class="detail-description">
              <h4>文件描述</h4>
              <p>{{ currentDetail.description || "暂无描述" }}</p>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button type="primary" :icon="Download" @click="handleDownloadFromDetail"> 下载文件 </el-button>
      </template>
    </el-dialog>

    <!-- ==================== 编辑弹窗 ==================== -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑资源"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="editFormRef"
        :model="editFormData"
        :rules="uploadFormRules"
        label-width="90px"
        label-position="right"
      >
        <el-form-item label="文件标题" prop="title">
          <el-input v-model="editFormData.title" placeholder="请输入文件标题" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="editFormData.category" placeholder="请选择资源分类" style="width: 100%">
            <el-option
              v-for="opt in CATEGORY_OPTIONS.filter((o) => o.value !== '')"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="文件描述">
          <el-input
            v-model="editFormData.description"
            type="textarea"
            placeholder="请输入文件描述（选填）"
            :rows="3"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleEditSubmit"> 保存修改 </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * resources/index.vue 样式
 * 遵循项目设计规范，与 members、development、statistics 等页面
 * 保持一致的排版风格
 * ============================================================ */

/* ---- 页面容器 ---- */
.resources-page {
  padding: 24px 0 40px;
}

/* ---- 页头（与项目 page-header 一致） ---- */
.page-header {
  margin-bottom: 24px;
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 4px;
}

/* ---- 卡片标题栏（与 members/development 一致） ---- */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ---- 筛选栏（与 members/development/ActivityList 一致） ---- */
.filter-bar {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bg-page, #f5f6fa);
  border-radius: var(--radius-base, 8px);
}

.filter-row {
  align-items: flex-end;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 14px;
  color: var(--text-regular, #606266);
  font-weight: 500;
}

.filter-actions {
  .btn-group {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
}

.result-count {
  font-size: 13px;
  color: var(--party-red, #c12c1f);
  white-space: nowrap;
}

/* ---- 资源卡片网格 ---- */
.resource-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.resource-card {
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  overflow: hidden;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.12));
  }
}

/* ---- 卡片图标区域 ---- */
.card-icon {
  position: relative;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--border-color, #ebeef5);
}

.file-type-badge {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 11px;
  color: #fff;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* ---- 卡片内容 ---- */
.card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #2c3e50);
  line-height: 1.5;
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s;

  &:hover {
    color: var(--party-red, #c12c1f);
  }
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meta-downloads {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ---- 卡片底部 ---- */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #ebeef5);
}

.meta-time {
  font-size: 12px;
  color: var(--text-placeholder, #c0c4cc);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ---- 表格底部（与 members/development 一致） ---- */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
}

.total-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* ---- 详情弹窗 ---- */
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-preview {
  border-radius: var(--radius-base, 8px);
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-image {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}

.preview-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
}

.preview-type {
  font-size: 16px;
  color: var(--text-secondary, #909399);
  font-weight: 500;
}

/* ---- 详情信息 ---- */
.detail-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #2c3e50);
  line-height: 1.4;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: var(--text-placeholder, #c0c4cc);
  font-weight: 500;
}

.meta-value {
  font-size: 14px;
  color: var(--text-regular, #606266);

  &.highlight {
    color: var(--party-red, #c12c1f);
    font-weight: 600;
  }
}

.detail-description {
  margin-top: 4px;

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #2c3e50);
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: var(--text-regular, #606266);
    line-height: 1.7;
    white-space: pre-wrap;
  }
}

/* ---- Element Plus 覆盖 ---- */
:deep(.el-upload-dragger) {
  padding: 24px;
}

:deep(.el-upload__text) {
  font-size: 14px;
  color: var(--text-secondary, #909399);

  em {
    color: var(--party-red, #c12c1f);
    font-style: normal;
  }
}

:deep(.el-button--danger.is-text) {
  &:hover {
    color: #f56c6c;
  }
}

/* ---- 响应式（与项目断点一致） ---- */
@media (max-width: 1400px) {
  .resource-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .resource-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .resources-page {
    padding: 16px 0 32px;
  }

  .page-header {
    flex-direction: column;
    gap: 12px;
  }

  .resource-grid {
    grid-template-columns: 1fr;
  }

  .detail-meta-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    padding: 12px;
  }
}

@media (max-width: 480px) {
  .card-actions {
    flex-wrap: wrap;
  }
}
</style>
