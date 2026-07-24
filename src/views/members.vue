<script setup lang="ts">
/**
 * members.vue - 成员管理模块
 *
 * 党员成员信息管理 - 支持搜索筛选、分页浏览、增删改查、批量导入导出
 */
import { ref, reactive, computed, watch } from "vue";
import { useAppStore } from "@/stores/app";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";

const store = useAppStore();

// ============================================================
// 类型定义
// ============================================================

/** 政治身份 */
type PartyIdentity =
  | "普通学生"
  | "入党申请人"
  | "积极分子"
  | "发展对象"
  | "预备党员"
  | "正式党员";

/** 成员信息 */
interface Member {
  id: number;
  studentNo: string;
  name: string;
  gender: "男" | "女";
  college: string;
  grade: string;
  major: string;
  className: string;
  branchName: string;
  identity: PartyIdentity;
  phone: string;
  email: string;
  contactPerson: string;
  status: number;
  remark: string;
  createTime: string;
  updateTime: string;
}

/** 新增/编辑成员表单 */
interface MemberForm {
  studentNo: string;
  name: string;
  gender: "男" | "女";
  college: string;
  grade: string;
  major: string;
  className: string;
  branchName: string;
  identity: PartyIdentity;
  phone: string;
  email: string;
  contactPerson: string;
  remark: string;
}

// ============================================================
// 权限
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
const canEdit = computed(() => isSuperAdmin.value);
const secretaryBranch = "计算机学院学生第一党支部";

// ============================================================
// Mock 数据 - 20条成员数据
// ============================================================
const allMembers = ref([
  {
    id: 1,
    studentNo: "20240001",
    name: "张三",
    gender: "男",
    college: "信息工程学院",
    grade: "2024级",
    major: "计算机科学与技术",
    className: "计科202401",
    branchName: "计算机学院学生第一党支部",
    identity: "积极分子",
    phone: "13800001001",
    email: "zhangsan@edu.cn",
    contactPerson: "李老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-20",
  },
  {
    id: 2,
    studentNo: "20240002",
    name: "李四",
    gender: "女",
    college: "信息工程学院",
    grade: "2024级",
    major: "数据科学与大数据技术",
    className: "大数据202401",
    branchName: "计算机学院学生第一党支部",
    identity: "发展对象",
    phone: "13800001002",
    email: "lisi@edu.cn",
    contactPerson: "李老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-18",
  },
  {
    id: 3,
    studentNo: "20240003",
    name: "王五",
    gender: "男",
    college: "信息工程学院",
    grade: "2024级",
    major: "软件工程",
    className: "软工202401",
    branchName: "计算机学院学生第二党支部",
    identity: "预备党员",
    phone: "13800001003",
    email: "wangwu@edu.cn",
    contactPerson: "陈老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-15",
  },
  {
    id: 4,
    studentNo: "20240004",
    name: "赵六",
    gender: "女",
    college: "信息工程学院",
    grade: "2024级",
    major: "计算机科学与技术",
    className: "计科202402",
    branchName: "计算机学院学生第二党支部",
    identity: "正式党员",
    phone: "13800001004",
    email: "zhaoliu@edu.cn",
    contactPerson: "周老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-10",
  },
  {
    id: 5,
    studentNo: "20240005",
    name: "孙七",
    gender: "男",
    college: "信息工程学院",
    grade: "2024级",
    major: "人工智能",
    className: "人工智能202401",
    branchName: "计算机学院学生第一党支部",
    identity: "入党申请人",
    phone: "13800001005",
    email: "sunqi@edu.cn",
    contactPerson: "赵老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-08",
  },
  {
    id: 6,
    studentNo: "20240006",
    name: "周八",
    gender: "女",
    college: "信息工程学院",
    grade: "2024级",
    major: "计算机科学与技术",
    className: "计科202401",
    branchName: "软件学院学生党支部",
    identity: "积极分子",
    phone: "13800001006",
    email: "zhouba@edu.cn",
    contactPerson: "江老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-05",
  },
  {
    id: 7,
    studentNo: "20240007",
    name: "吴九",
    gender: "男",
    college: "信息工程学院",
    grade: "2024级",
    major: "网络工程",
    className: "网工202401",
    branchName: "计算机学院学生第一党支部",
    identity: "普通学生",
    phone: "13800001007",
    email: "wujiu@edu.cn",
    contactPerson: "赵老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-07-01",
  },
  {
    id: 8,
    studentNo: "20240008",
    name: "郑十",
    gender: "女",
    college: "信息工程学院",
    grade: "2024级",
    major: "计算机科学与技术",
    className: "计科202403",
    branchName: "计算机学院学生第二党支部",
    identity: "发展对象",
    phone: "13800001008",
    email: "zhengshi@edu.cn",
    contactPerson: "周老师",
    status: 1,
    remark: "",
    createTime: "2025-09-01",
    updateTime: "2026-06-28",
  },
  {
    id: 9,
    studentNo: "20240009",
    name: "陈十一",
    gender: "男",
    college: "信息工程学院",
    grade: "2023级",
    major: "软件工程",
    className: "软工202301",
    branchName: "计算机学院学生第一党支部",
    identity: "正式党员",
    phone: "13800001009",
    email: "chenshiyi@edu.cn",
    contactPerson: "李老师",
    status: 1,
    remark: "",
    createTime: "2024-09-01",
    updateTime: "2026-06-20",
  },
  {
    id: 10,
    studentNo: "20240010",
    name: "刘十二",
    gender: "女",
    college: "信息工程学院",
    grade: "2023级",
    major: "数据科学与大数据技术",
    className: "大数据202301",
    branchName: "软件学院学生党支部",
    identity: "预备党员",
    phone: "13800001010",
    email: "liushier@edu.cn",
    contactPerson: "江老师",
    status: 1,
    remark: "",
    createTime: "2024-09-01",
    updateTime: "2026-06-15",
  },
  {
    id: 11,
    studentNo: "20240011",
    name: "黄十三",
    gender: "男",
    college: "信息工程学院",
    grade: "2025级",
    major: "计算机科学与技术",
    className: "计科202501",
    branchName: "计算机学院学生第一党支部",
    identity: "普通学生",
    phone: "13800001011",
    email: "huangshisan@edu.cn",
    contactPerson: "赵老师",
    status: 1,
    remark: "",
    createTime: "2026-09-01",
    updateTime: "2026-09-01",
  },
  {
    id: 12,
    studentNo: "20240012",
    name: "杨十四",
    gender: "女",
    college: "信息工程学院",
    grade: "2025级",
    major: "人工智能",
    className: "人工智能202501",
    branchName: "计算机学院学生第二党支部",
    identity: "入党申请人",
    phone: "13800001012",
    email: "yangshisi@edu.cn",
    contactPerson: "陈老师",
    status: 1,
    remark: "",
    createTime: "2026-09-01",
    updateTime: "2026-06-10",
  },
  {
    id: 13,
    studentNo: "20230001",
    name: "马六",
    gender: "女",
    college: "信息工程学院",
    grade: "2023级",
    major: "计算机科学与技术",
    className: "计科202301",
    branchName: "计算机学院学生第一党支部",
    identity: "入党申请人",
    phone: "13800001013",
    email: "maliu@edu.cn",
    contactPerson: "李老师",
    status: 1,
    remark: "",
    createTime: "2024-09-01",
    updateTime: "2026-06-05",
  },
  {
    id: 14,
    studentNo: "20230002",
    name: "胡七",
    gender: "男",
    college: "信息工程学院",
    grade: "2023级",
    major: "软件工程",
    className: "软工202302",
    branchName: "网络空间安全学院学生党支部",
    identity: "预备党员",
    phone: "13800001014",
    email: "huqi@edu.cn",
    contactPerson: "林老师",
    status: 1,
    remark: "",
    createTime: "2024-09-01",
    updateTime: "2026-06-01",
  },
  {
    id: 15,
    studentNo: "20230003",
    name: "林八",
    gender: "女",
    college: "信息工程学院",
    grade: "2023级",
    major: "网络空间安全",
    className: "网安202301",
    branchName: "网络空间安全学院学生党支部",
    identity: "正式党员",
    phone: "13800001015",
    email: "linba@edu.cn",
    contactPerson: "林老师",
    status: 1,
    remark: "",
    createTime: "2024-09-01",
    updateTime: "2026-05-28",
  },
  {
    id: 16,
    studentNo: "20220001",
    name: "何九",
    gender: "男",
    college: "信息工程学院",
    grade: "2022级",
    major: "网络空间安全",
    className: "网安202201",
    branchName: "网络空间安全学院学生党支部",
    identity: "积极分子",
    phone: "13800001016",
    email: "hejiu@edu.cn",
    contactPerson: "林老师",
    status: 1,
    remark: "",
    createTime: "2023-09-01",
    updateTime: "2026-05-20",
  },
  {
    id: 17,
    studentNo: "20220002",
    name: "罗十",
    gender: "女",
    college: "信息工程学院",
    grade: "2022级",
    major: "计算机科学与技术",
    className: "计科202201",
    branchName: "计算机学院学生第二党支部",
    identity: "发展对象",
    phone: "13800001017",
    email: "luoshi@edu.cn",
    contactPerson: "周老师",
    status: 1,
    remark: "",
    createTime: "2023-09-01",
    updateTime: "2026-05-15",
  },
  {
    id: 18,
    studentNo: "20220003",
    name: "梁一",
    gender: "男",
    college: "信息工程学院",
    grade: "2022级",
    major: "软件工程",
    className: "软工202201",
    branchName: "软件学院学生党支部",
    identity: "入党申请人",
    phone: "13800001018",
    email: "liangyi@edu.cn",
    contactPerson: "何老师",
    status: 1,
    remark: "",
    createTime: "2023-09-01",
    updateTime: "2026-05-10",
  },
  {
    id: 19,
    studentNo: "20210001",
    name: "宋二",
    gender: "女",
    college: "信息工程学院",
    grade: "2021级",
    major: "计算机科学与技术",
    className: "计科202101",
    branchName: "计算机学院学生第二党支部",
    identity: "正式党员",
    phone: "13800001019",
    email: "songer@edu.cn",
    contactPerson: "周老师",
    status: 1,
    remark: "",
    createTime: "2022-09-01",
    updateTime: "2026-05-05",
  },
  {
    id: 20,
    studentNo: "20210002",
    name: "唐三",
    gender: "男",
    college: "信息工程学院",
    grade: "2021级",
    major: "软件工程",
    className: "软工202101",
    branchName: "软件学院学生党支部",
    identity: "正式党员",
    phone: "13800001020",
    email: "tangsan@edu.cn",
    contactPerson: "何老师",
    status: 1,
    remark: "",
    createTime: "2022-09-01",
    updateTime: "2026-04-28",
  },
]);
// ============================================================
// 身份标签配置
// ============================================================
const identityTagMap: Record<string, string> = {
  普通学生: "info",
  入党申请人: "",
  积极分子: "warning",
  发展对象: "primary",
  预备党员: "success",
  正式党员: "danger",
};

const identityColorMap: Record<string, string> = {
  普通学生: "#909399",
  入党申请人: "#409EFF",
  积极分子: "#E6A23C",
  发展对象: "#C9973B",
  预备党员: "#67C23A",
  正式党员: "#C12C1F",
};

const identityOptions = [
  { value: "", label: "全部" },
  { value: "普通学生", label: "普通学生" },
  { value: "入党申请人", label: "入党申请人" },
  { value: "积极分子", label: "积极分子" },
  { value: "发展对象", label: "发展对象" },
  { value: "预备党员", label: "预备党员" },
  { value: "正式党员", label: "正式党员" },
];

// ============================================================
// 从数据提取筛选项
// ============================================================
const branchOptions = computed(() => {
  const branches = [...new Set(allMembers.value.map((m) => m.branchName))];
  return [
    { value: "", label: "全部" },
    ...branches.map((b) => ({ value: b, label: b })),
  ];
});

// ============================================================
// 权限过滤：支委只看本支部
// ============================================================
const membersByRole = computed(() => {
  if (isSuperAdmin.value) return allMembers.value;
  return allMembers.value.filter((m) => m.branchName === secretaryBranch);
});

// ============================================================
// 筛选状态（用户输入 - 未应用）
// ============================================================
const filterBranch = ref("");
const filterIdentity = ref("");
const filterKeyword = ref("");

// 已应用的筛选条件
const appliedBranch = ref("");
const appliedIdentity = ref("");
const appliedKeyword = ref("");

// ============================================================
// 加载 & 分页
// ============================================================
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);

// ============================================================
// 筛选后的数据
// ============================================================
const filteredMembers = computed(() => {
  let list = membersByRole.value;
  if (appliedBranch.value)
    list = list.filter((m) => m.branchName === appliedBranch.value);
  if (appliedIdentity.value)
    list = list.filter((m) => m.identity === appliedIdentity.value);
  if (appliedKeyword.value.trim()) {
    const kw = appliedKeyword.value.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(kw) ||
        m.studentNo.toLowerCase().includes(kw) ||
        m.major.toLowerCase().includes(kw) ||
        m.className.toLowerCase().includes(kw),
    );
  }
  return list;
});

const totalFiltered = computed(() => filteredMembers.value.length);

const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

// ============================================================
// 统计概览
// ============================================================
const statsData = computed(() => ({
  total: membersByRole.value.length,
  applicants: membersByRole.value.filter((m) => m.identity === "入党申请人")
    .length,
  activists: membersByRole.value.filter((m) => m.identity === "积极分子")
    .length,
  developmentTargets: membersByRole.value.filter(
    (m) => m.identity === "发展对象",
  ).length,
  probationary: membersByRole.value.filter((m) => m.identity === "预备党员")
    .length,
  fullMembers: membersByRole.value.filter((m) => m.identity === "正式党员")
    .length,
}));

// ============================================================
// 筛选变化时重置页码
// ============================================================
watch([appliedBranch, appliedIdentity, appliedKeyword], () => {
  currentPage.value = 1;
});
// ============================================================
// 搜索
// ============================================================
async function handleSearch(): Promise<void> {
  loading.value = true;
  try {
    // TODO: 替换为真实 API 调用
    await new Promise((resolve) => setTimeout(resolve, 300));
    appliedBranch.value = filterBranch.value;
    appliedIdentity.value = filterIdentity.value;
    appliedKeyword.value = filterKeyword.value;
  } finally {
    loading.value = false;
  }
}

// ============================================================
// 重置
// ============================================================
function handleReset(): void {
  filterBranch.value = "";
  filterIdentity.value = "";
  filterKeyword.value = "";
  appliedBranch.value = "";
  appliedIdentity.value = "";
  appliedKeyword.value = "";
}

// ============================================================
// 分页
// ============================================================
function handlePageChange(page: number): void {
  currentPage.value = page;
}
function handleSizeChange(size: number): void {
  pageSize.value = size;
  currentPage.value = 1;
}

// ============================================================
// 新增/编辑对话框
// ============================================================
const dialogVisible = ref(false);
const dialogTitle = ref("新增成员");
const isEdit = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive<MemberForm>({
  studentNo: "",
  name: "",
  gender: "男",
  college: "信息工程学院",
  grade: "",
  major: "",
  className: "",
  branchName: "",
  identity: "普通学生",
  phone: "",
  email: "",
  contactPerson: "",
  remark: "",
});

const formRules: FormRules = {
  studentNo: [{ required: true, message: "请输入学号", trigger: "blur" }],
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  gender: [{ required: true, message: "请选择性别", trigger: "change" }],
  college: [{ required: true, message: "请输入学院", trigger: "blur" }],
  grade: [{ required: true, message: "请输入年级", trigger: "blur" }],
  major: [{ required: true, message: "请输入专业", trigger: "blur" }],
  className: [{ required: true, message: "请输入班级", trigger: "blur" }],
  branchName: [
    { required: true, message: "请选择所属支部", trigger: "change" },
  ],
  identity: [{ required: true, message: "请选择政治身份", trigger: "change" }],
  phone: [
    {
      pattern: /^1[3-9]\d{9}$/,
      message: "请输入正确的手机号",
      trigger: "blur",
    },
  ],
  email: [{ type: "email", message: "请输入正确的邮箱", trigger: "blur" }],
};

// 打开新增对话框
function handleAdd(): void {
  dialogTitle.value = "新增成员";
  isEdit.value = false;
  editingId.value = null;
  Object.assign(formData, {
    studentNo: "",
    name: "",
    gender: "男",
    college: "信息工程学院",
    grade: "",
    major: "",
    className: "",
    branchName: "",
    identity: "普通学生",
    phone: "",
    email: "",
    contactPerson: "",
    remark: "",
  });
  dialogVisible.value = true;
}

// 打开编辑对话框
function handleEdit(row: Member): void {
  dialogTitle.value = "编辑成员";
  isEdit.value = true;
  editingId.value = row.id;
  Object.assign(formData, {
    studentNo: row.studentNo,
    name: row.name,
    gender: row.gender,
    college: row.college,
    grade: row.grade,
    major: row.major,
    className: row.className,
    branchName: row.branchName,
    identity: row.identity,
    phone: row.phone,
    email: row.email,
    contactPerson: row.contactPerson,
    remark: row.remark,
  });
  dialogVisible.value = true;
}

// 提交表单
async function handleSubmit(formEl: FormInstance | undefined): Promise<void> {
  if (!formEl) return;
  await formEl.validate(async (valid) => {
    if (valid) {
      try {
        // TODO: 替换为真实 API 调用
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (isEdit.value && editingId.value) {
          const idx = allMembers.value.findIndex(
            (m) => m.id === editingId.value,
          );
          if (idx !== -1) {
            const member = allMembers.value[idx];
            Object.assign(member, formData);
            member.updateTime = new Date().toISOString().slice(0, 10);
            ElMessage.success("成员信息更新成功");
          }
        } else {
          const newMember: Member = {
            id: Math.max(...allMembers.value.map((m) => m.id)) + 1,
            ...formData,
            status: 1,
            createTime: new Date().toISOString().slice(0, 10),
            updateTime: new Date().toISOString().slice(0, 10),
          };
          allMembers.value.unshift(newMember);
          ElMessage.success("成员添加成功");
        }
        dialogVisible.value = false;
      } catch {
        ElMessage.error("操作失败，请重试");
      }
    }
  });
}

// 关闭对话框
function handleDialogClose(): void {
  formRef.value?.resetFields();
}
// ============================================================
// 删除
// ============================================================
async function handleDelete(row: Member): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要删除成员「${row.name}」(${row.studentNo}) 吗？此操作不可恢复。`,
      "删除确认",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    // TODO: 替换为真实 API 调用
    await new Promise((resolve) => setTimeout(resolve, 200));
    const idx = allMembers.value.findIndex((m) => m.id === row.id);
    if (idx !== -1) allMembers.value.splice(idx, 1);
    ElMessage.success("成员已删除");
  } catch {
    // 用户取消
  }
}

// ============================================================
// 查看详情 - 跳转到党员发展详情页
// ============================================================
function handleView(row: Member): void {
  // TODO: 可跳转至成员详情页
  ElMessage.info(`查看成员「${row.name}」的详细信息`);
}

// ============================================================
// Excel 导入
// ============================================================
function handleImport(): void {
  // TODO: 实现 Excel 批量导入功能
  ElMessage.info("Excel 导入功能开发中...");
}

// ============================================================
// 导出
// ============================================================
function handleExport(): void {
  try {
    const headers = [
      "学号",
      "姓名",
      "性别",
      "学院",
      "年级",
      "专业",
      "班级",
      "所属支部",
      "政治身份",
      "联系电话",
      "邮箱",
      "培养联系人",
      "备注",
    ];
    const rows = filteredMembers.value.map((m) => [
      m.studentNo,
      m.name,
      m.gender,
      m.college,
      m.grade,
      m.major,
      m.className,
      m.branchName,
      m.identity,
      m.phone,
      m.email,
      m.contactPerson,
      m.remark,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `成员数据导出_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success("导出成功");
  } catch {
    ElMessage.error("导出失败");
  }
}
</script>

<template>
  <div class="members-page">
    <div class="page-container">
      <!-- 页头 -->
      <div class="page-header">
        <h2 class="section-title">成员管理</h2>
        <p class="page-desc">
          管理学院全体党员成员基础信息，支持增删改查、批量导入导出
        </p>
      </div>

      <!-- 统计概览 -->
      <div class="stats-grid">
        <div class="stat-card stat-total">
          <div class="stat-icon icon-total">
            <el-icon :size="24"><UserFilled /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-total">{{ statsData.total }}</span>
            <span class="stat-label">成员总数</span>
          </div>
        </div>
        <div class="stat-card stat-applicant">
          <div class="stat-icon icon-applicant">
            <el-icon :size="24"><EditPen /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-applicant">{{
              statsData.applicants
            }}</span>
            <span class="stat-label">入党申请人</span>
          </div>
        </div>
        <div class="stat-card stat-activist">
          <div class="stat-icon icon-activist">
            <el-icon :size="24"><StarFilled /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-activist">{{
              statsData.activists
            }}</span>
            <span class="stat-label">积极分子</span>
          </div>
        </div>
        <div class="stat-card stat-development">
          <div class="stat-icon icon-development">
            <el-icon :size="24"><TrendCharts /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-development">{{
              statsData.developmentTargets
            }}</span>
            <span class="stat-label">发展对象</span>
          </div>
        </div>
        <div class="stat-card stat-probationary">
          <div class="stat-icon icon-probationary">
            <el-icon :size="24"><CircleCheckFilled /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-probationary">{{
              statsData.probationary
            }}</span>
            <span class="stat-label">预备党员</span>
          </div>
        </div>
        <div class="stat-card stat-full">
          <div class="stat-icon icon-full">
            <el-icon :size="24"><Medal /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num num-full">{{
              statsData.fullMembers
            }}</span>
            <span class="stat-label">正式党员</span>
          </div>
        </div>
      </div>

      <!-- 成员列表卡片 -->
      <div class="content-card" v-loading="loading">
        <!-- 卡片标题栏 -->
        <div class="card-header">
          <span class="card-title">成员列表</span>
          <div class="card-actions">
            <el-button
              v-if="canEdit"
              type="primary"
              :icon="Plus"
              @click="handleAdd"
            >
              新增成员
            </el-button>
            <el-button v-if="canEdit" :icon="Upload" @click="handleImport">
              Excel导入
            </el-button>
            <el-button :icon="Download" @click="handleExport">
              导出数据
            </el-button>
          </div>
        </div>

        <!-- 搜索筛选栏 -->
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <!-- 所属支部：仅超级管理员可见 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6" v-if="isSuperAdmin">
              <div class="filter-item">
                <label class="filter-label">所属支部</label>
                <el-select
                  v-model="filterBranch"
                  placeholder="全部"
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in branchOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </el-col>

            <!-- 政治身份 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">政治身份</label>
                <el-select
                  v-model="filterIdentity"
                  placeholder="全部"
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in identityOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </el-col>

            <!-- 关键词搜索 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item">
                <label class="filter-label">关键词搜索</label>
                <el-input
                  v-model="filterKeyword"
                  placeholder="姓名 / 学号 / 专业 / 班级"
                  clearable
                  @keyup.enter="handleSearch"
                >
                  <template #prefix>
                    <el-icon><Search /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-col>

            <!-- 操作按钮 -->
            <el-col :xs="24" :sm="12" :md="8" :lg="6">
              <div class="filter-item filter-actions">
                <label class="filter-label">&nbsp;</label>
                <div class="btn-group">
                  <el-button type="primary" @click="handleSearch">
                    <el-icon><Search /></el-icon> 搜索
                  </el-button>
                  <el-button @click="handleReset">重置</el-button>
                  <span
                    class="result-count"
                    v-if="appliedBranch || appliedIdentity || appliedKeyword"
                  >
                    {{ totalFiltered }} 条结果
                  </span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>
        <!-- 数据表格 -->
        <el-table
          v-if="pagedMembers.length > 0"
          :data="pagedMembers"
          style="width: 100%"
          stripe
          :default-sort="{ prop: 'updateTime', order: 'descending' }"
        >
          <el-table-column prop="studentNo" label="学号" width="130" sortable />
          <el-table-column prop="name" label="姓名" width="100" sortable />
          <el-table-column prop="gender" label="性别" width="70" />
          <el-table-column prop="college" label="学院" min-width="140" />
          <el-table-column prop="grade" label="年级" width="90" sortable />
          <el-table-column prop="major" label="专业" min-width="160" />
          <el-table-column prop="className" label="班级" min-width="130" />
          <el-table-column prop="branchName" label="所属支部" min-width="200" />
          <el-table-column label="政治身份" width="120">
            <template #default="{ row }">
              <el-tag
                :type="identityTagMap[row.identity] || 'info'"
                size="small"
                :color="identityColorMap[row.identity]"
                effect="dark"
              >
                {{ row.identity }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="联系电话" width="130" />
          <el-table-column
            prop="contactPerson"
            label="培养联系人"
            width="110"
          />
          <el-table-column
            prop="updateTime"
            label="最后更新"
            width="120"
            sortable
          />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="table-actions">
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="handleView(row)"
                >
                  查看
                </el-button>
                <el-button
                  v-if="canEdit"
                  type="warning"
                  link
                  size="small"
                  @click="handleEdit(row)"
                >
                  编辑
                </el-button>
                <el-button
                  v-if="canEdit"
                  type="danger"
                  link
                  size="small"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 空状态 -->
        <el-empty v-else description="暂无匹配的成员数据" :image-size="100" />

        <!-- 分页 -->
        <div class="table-footer" v-if="totalFiltered > 0">
          <span class="total-info">共 {{ totalFiltered }} 条记录</span>
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50]"
            :total="totalFiltered"
            layout="sizes, prev, pager, next, jumper"
            background
            small
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="680px"
      :close-on-click-modal="false"
      @closed="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        label-position="right"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="学号" prop="studentNo">
              <el-input v-model="formData.studentNo" placeholder="请输入学号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="formData.name" placeholder="请输入姓名" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <el-select v-model="formData.gender" style="width: 100%">
                <el-option label="男" value="男" />
                <el-option label="女" value="女" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="政治身份" prop="identity">
              <el-select v-model="formData.identity" style="width: 100%">
                <el-option
                  v-for="opt in identityOptions.filter((o) => o.value !== '')"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="学院" prop="college">
              <el-input v-model="formData.college" placeholder="请输入学院" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="年级" prop="grade">
              <el-select
                v-model="formData.grade"
                style="width: 100%"
                placeholder="请选择"
              >
                <el-option label="2025级" value="2025级" />
                <el-option label="2024级" value="2024级" />
                <el-option label="2023级" value="2023级" />
                <el-option label="2022级" value="2022级" />
                <el-option label="2021级" value="2021级" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="专业" prop="major">
              <el-input v-model="formData.major" placeholder="请输入专业" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="班级" prop="className">
              <el-input v-model="formData.className" placeholder="请输入班级" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="所属支部" prop="branchName">
              <el-select
                v-model="formData.branchName"
                style="width: 100%"
                placeholder="请选择"
              >
                <el-option
                  v-for="opt in branchOptions.filter((o) => o.value !== '')"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="培养联系人" prop="contactPerson">
              <el-input
                v-model="formData.contactPerson"
                placeholder="请输入培养联系人"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入手机号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="formData.email" placeholder="请输入邮箱" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="formData.remark"
            type="textarea"
            :rows="3"
            placeholder="可选，填写备注信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit(formRef)">
            {{ isEdit ? "保存修改" : "确认添加" }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * members.vue 样式
 * 遵循项目设计规范，使用 SCSS + CSS 自定义属性
 * ============================================================ */

.members-page {
  padding: 24px 0 40px;
}

.page-header {
  margin-bottom: 24px;
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 4px;
}

/* ---- 统计卡片网格 ---- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: all 0.3s ease;
  cursor: default;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.12));
  }
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-base, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--party-red, #c12c1f);
}

/* 各身份图标背景色 */
.icon-total { background: rgba(193, 44, 31, 0.1); }
.icon-applicant { background: rgba(64, 158, 255, 0.1); }
.icon-activist { background: rgba(230, 162, 60, 0.1); }
.icon-development { background: rgba(114, 46, 209, 0.1); }
.icon-probationary { background: rgba(103, 194, 58, 0.1); }
.icon-full { background: rgba(193, 44, 31, 0.1); }

.stat-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--party-red, #c12c1f);
  line-height: 1.2;
}

/* 各身份统计数字颜色 */
.num-applicant { color: #409EFF; }
.num-activist { color: #E6A23C; }
.num-development { color: #722ED1; }
.num-probationary { color: #67C23A; }
.num-full { color: var(--party-red, #c12c1f); }

.stat-label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
  margin-top: 2px;
  white-space: nowrap;
}

/* ---- 卡片标题栏 ---- */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2c3e50);

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

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ---- 搜索筛选栏 ---- */
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
    gap: 8px;
    flex-wrap: wrap;
  }
}

.result-count {
  font-size: 13px;
  color: var(--party-red, #c12c1f);
  white-space: nowrap;
}

/* ---- 表格操作列 ---- */
.table-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

/* ---- 表格底部 ---- */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.total-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* ---- 对话框底部 ---- */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ---- Element Plus 内部样式覆盖 ---- */
:deep(.el-table) {
  th.el-table__cell {
    background: var(--bg-page, #f5f6fa);
    color: var(--text-secondary, #909399);
    font-weight: 600;
  }
}

:deep(.el-tag--dark) {
  border: none;
}

/* ---- 响应式 ---- */
@media (max-width: 1400px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .filter-bar {
    padding: 12px;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
