<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import {
  createAdminNews,
  createAdminNotice,
  deleteAdminNews,
  deleteAdminNotice,
  getAdminNews,
  getAdminNotice,
  pageAdminNews,
  pageAdminNotices,
  publishAdminNotice,
  updateAdminNews,
  updateAdminNewsStatus,
  updateAdminNotice,
  type AdminNewsArticle,
  type AdminNoticeArticle,
} from "@/api/admin-content";

type ContentTab = "news" | "notices";
type NewsStatus = 1 | 2;
type NoticeStatus = 1 | 3;
type NoticeContentMode = "text" | "file";

const pageSize = 10;
const activeTab = ref<ContentTab>("news");

const newsRows = ref<AdminNewsArticle[]>([]);
const newsTotal = ref(0);
const newsPage = ref(1);
const newsKeywordInput = ref("");
const newsKeyword = ref("");
const newsStatus = ref<"" | NewsStatus>("");
const newsLoading = ref(false);
const newsError = ref(false);
let newsRequestNumber = 0;

const noticeRows = ref<AdminNoticeArticle[]>([]);
const noticeTotal = ref(0);
const noticePage = ref(1);
const noticeKeywordInput = ref("");
const noticeKeyword = ref("");
const noticeStatus = ref<"" | 1 | 2 | 3>("");
const noticeLoading = ref(false);
const noticeError = ref(false);
let noticeRequestNumber = 0;

const dialogKind = ref<ContentTab | null>(null);
const newsDialogVisible = ref(false);
const noticeDialogVisible = ref(false);
const dialogLoading = ref(false);
const submitting = ref(false);
const newsActionId = ref<number | null>(null);
const noticeActionId = ref<number | null>(null);
const newsFormRef = ref<FormInstance>();
const noticeFormRef = ref<FormInstance>();
const newsEditingId = ref<number | null>(null);
const noticeEditingId = ref<number | null>(null);

const newsForm = reactive({
  title: "",
  type: "",
  cover: "",
  content: "",
  status: 1 as NewsStatus,
});

const noticeForm = reactive({
  title: "",
  contentMode: "text" as NoticeContentMode,
  content: "",
  status: 1 as NoticeStatus,
  startTime: "",
  endTime: "",
});

const dialogTitle = computed(() => {
  if (dialogKind.value === "news") return newsEditingId.value ? "编辑新闻" : "发布新闻";
  if (dialogKind.value === "notices") return noticeEditingId.value ? "编辑公告" : "发布公告";
  return "内容管理";
});

const newsRules: FormRules = {
  title: [
    { required: true, message: "请填写新闻标题", trigger: "blur" },
    { max: 10, message: "新闻标题不能超过 10 个字符", trigger: "blur" },
  ],
  type: [{ max: 10, message: "类型不能超过 10 个字符", trigger: "blur" }],
  cover: [
    { max: 100, message: "封面链接不能超过 100 个字符", trigger: "blur" },
    { validator: validateCoverUrl, trigger: "blur" },
  ],
  content: [{ required: true, message: "请填写新闻正文", trigger: "blur" }],
};

const noticeRules: FormRules = {
  title: [
    { required: true, message: "请填写公告标题", trigger: "blur" },
    { max: 30, message: "公告标题不能超过 30 个字符", trigger: "blur" },
  ],
  content: [{ validator: validateNoticeContent, trigger: "blur" }],
};

function validateCoverUrl(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  const link = value?.trim();
  if (!link || isSupportedUrl(link)) {
    callback();
    return;
  }
  callback(new Error("请输入 http(s) 图片链接或以 / 开头的站内路径"));
}

function validateNoticeContent(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  const content = value?.trim();
  if (!content) {
    callback(new Error(noticeForm.contentMode === "file" ? "请输入公告文件链接" : "请填写公告正文"));
    return;
  }
  if (noticeForm.contentMode === "file" && !isSupportedUrl(content)) {
    callback(new Error("当前仅支持 http(s) 文件链接或以 / 开头的站内路径"));
    return;
  }
  if (noticeForm.contentMode === "text" && content.length > 15000) {
    callback(new Error("公告正文不能超过 15000 个字符"));
    return;
  }
  if (noticeForm.contentMode === "file" && content.length > 1000) {
    callback(new Error("文件链接不能超过 1000 个字符"));
    return;
  }
  callback();
}

function isSupportedUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value);
}

function formatDateTime(value: string | null | undefined): string {
  return value?.slice(0, 16).replace("T", " ") || "—";
}

async function loadNews(): Promise<void> {
  const requestNumber = ++newsRequestNumber;
  newsLoading.value = true;
  newsError.value = false;
  try {
    const result = await pageAdminNews({
      page: newsPage.value,
      size: pageSize,
      keyword: newsKeyword.value || undefined,
      status: newsStatus.value === "" ? undefined : newsStatus.value,
    });
    if (requestNumber !== newsRequestNumber) return;
    newsRows.value = result.records;
    newsTotal.value = result.total;
  } catch {
    if (requestNumber !== newsRequestNumber) return;
    newsRows.value = [];
    newsTotal.value = 0;
    newsError.value = true;
  } finally {
    if (requestNumber === newsRequestNumber) newsLoading.value = false;
  }
}

async function loadNotices(): Promise<void> {
  const requestNumber = ++noticeRequestNumber;
  noticeLoading.value = true;
  noticeError.value = false;
  try {
    const result = await pageAdminNotices({
      page: noticePage.value,
      size: pageSize,
      keyword: noticeKeyword.value || undefined,
      status: noticeStatus.value === "" ? undefined : noticeStatus.value,
    });
    if (requestNumber !== noticeRequestNumber) return;
    noticeRows.value = result.records;
    noticeTotal.value = result.total;
  } catch {
    if (requestNumber !== noticeRequestNumber) return;
    noticeRows.value = [];
    noticeTotal.value = 0;
    noticeError.value = true;
  } finally {
    if (requestNumber === noticeRequestNumber) noticeLoading.value = false;
  }
}

watch(
  activeTab,
  (tab) => {
    if (tab === "news") void loadNews();
    else void loadNotices();
  },
  { immediate: true },
);

function searchNews(): void {
  newsKeyword.value = newsKeywordInput.value.trim();
  newsPage.value = 1;
  void loadNews();
}

function resetNews(): void {
  newsKeywordInput.value = "";
  newsKeyword.value = "";
  newsStatus.value = "";
  newsPage.value = 1;
  void loadNews();
}

function searchNotices(): void {
  noticeKeyword.value = noticeKeywordInput.value.trim();
  noticePage.value = 1;
  void loadNotices();
}

function resetNotices(): void {
  noticeKeywordInput.value = "";
  noticeKeyword.value = "";
  noticeStatus.value = "";
  noticePage.value = 1;
  void loadNotices();
}

function applyNewsStatus(): void {
  newsPage.value = 1;
  void loadNews();
}

function applyNoticeStatus(): void {
  noticePage.value = 1;
  void loadNotices();
}

function openCreateNews(): void {
  newsEditingId.value = null;
  Object.assign(newsForm, { title: "", type: "", cover: "", content: "", status: 1 });
  dialogKind.value = "news";
  newsDialogVisible.value = true;
}

async function openEditNews(row: AdminNewsArticle): Promise<void> {
  newsEditingId.value = row.id;
  dialogKind.value = "news";
  newsDialogVisible.value = true;
  dialogLoading.value = true;
  try {
    const article = await getAdminNews(row.id);
    Object.assign(newsForm, {
      title: article.title,
      type: article.type || "",
      cover: article.cover || "",
      content: article.content || "",
      status: article.status,
    });
  } catch {
    newsDialogVisible.value = false;
    dialogKind.value = null;
  } finally {
    dialogLoading.value = false;
  }
}

function openCreateNotice(): void {
  noticeEditingId.value = null;
  Object.assign(noticeForm, {
    title: "",
    contentMode: "text",
    content: "",
    status: 1,
    startTime: "",
    endTime: "",
  });
  dialogKind.value = "notices";
  noticeDialogVisible.value = true;
}

async function openEditNotice(row: AdminNoticeArticle): Promise<void> {
  if (row.status === 2) return;
  noticeEditingId.value = row.id;
  dialogKind.value = "notices";
  noticeDialogVisible.value = true;
  dialogLoading.value = true;
  try {
    const article = await getAdminNotice(row.id);
    const isFile = article.content.startsWith("file:");
    Object.assign(noticeForm, {
      title: article.title,
      contentMode: isFile ? "file" : "text",
      content: isFile ? article.content.slice(5).trim() : article.content,
      status: article.status === 3 ? 3 : 1,
      startTime: article.startTime?.replace("T", " ").slice(0, 19) || "",
      endTime: article.endTime?.replace("T", " ").slice(0, 19) || "",
    });
  } catch {
    noticeDialogVisible.value = false;
    dialogKind.value = null;
  } finally {
    dialogLoading.value = false;
  }
}

async function submitNews(): Promise<void> {
  if (!newsFormRef.value || submitting.value) return;
  try {
    await newsFormRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      title: newsForm.title.trim(),
      type: newsForm.type.trim() || null,
      cover: newsForm.cover.trim() || null,
      content: newsForm.content.trim(),
      status: newsForm.status,
    };
    if (newsEditingId.value) await updateAdminNews(newsEditingId.value, payload);
    else await createAdminNews(payload);
    newsDialogVisible.value = false;
    ElMessage.success(newsEditingId.value ? "新闻已保存" : "新闻已创建");
    newsEditingId.value = null;
    newsPage.value = 1;
    await loadNews();
  } catch {
    // 请求层会展示后端错误；保留表单内容供管理员修正后重试。
  } finally {
    submitting.value = false;
  }
}

async function submitNotice(): Promise<void> {
  if (!noticeFormRef.value || submitting.value) return;
  try {
    await noticeFormRef.value.validate();
  } catch {
    return;
  }
  if (noticeForm.startTime && noticeForm.endTime && noticeForm.endTime <= noticeForm.startTime) {
    ElMessage.warning("展示结束时间必须晚于展示开始时间");
    return;
  }
  if (
    noticeForm.status === 3 &&
    (!noticeForm.startTime || new Date(noticeForm.startTime.replace(" ", "T")).getTime() <= Date.now())
  ) {
    ElMessage.warning("延期展示公告需要设置未来的展示开始时间");
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      title: noticeForm.title.trim(),
      content: noticeForm.contentMode === "file" ? `file:${noticeForm.content.trim()}` : noticeForm.content.trim(),
      status: noticeForm.status,
      startTime: noticeForm.startTime ? noticeForm.startTime.replace(" ", "T") : null,
      endTime: noticeForm.endTime ? noticeForm.endTime.replace(" ", "T") : null,
    };
    if (noticeEditingId.value) await updateAdminNotice(noticeEditingId.value, payload);
    else await createAdminNotice(payload);
    noticeDialogVisible.value = false;
    ElMessage.success(noticeEditingId.value ? "公告已保存" : "公告已创建");
    noticeEditingId.value = null;
    noticePage.value = 1;
    await loadNotices();
  } catch {
    // 请求层会展示后端错误；保留表单内容供管理员修正后重试。
  } finally {
    submitting.value = false;
  }
}

async function toggleNewsStatus(row: AdminNewsArticle): Promise<void> {
  const nextStatus: NewsStatus = row.status === 1 ? 2 : 1;
  const action = nextStatus === 1 ? "上线" : "下线";
  try {
    await ElMessageBox.confirm(`确定${action}《${row.title}》吗？`, `${action}新闻`, { type: "warning" });
  } catch {
    return;
  }
  newsActionId.value = row.id;
  try {
    await updateAdminNewsStatus(row.id, nextStatus);
    ElMessage.success(`新闻已${action}`);
    await loadNews();
  } catch {
    // 请求层负责展示失败原因。
  } finally {
    newsActionId.value = null;
  }
}

async function removeNews(row: AdminNewsArticle): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除后《${row.title}》将无法恢复，是否继续？`, "删除新闻", { type: "warning" });
  } catch {
    return;
  }
  newsActionId.value = row.id;
  try {
    await deleteAdminNews(row.id);
    ElMessage.success("新闻已删除");
    await loadNews();
  } catch {
    // 请求层负责展示失败原因。
  } finally {
    newsActionId.value = null;
  }
}

async function publishNotice(row: AdminNoticeArticle): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定发布《${row.title}》吗？公告仍按设置的展示起止时间展示。`, "发布公告", {
      type: "warning",
    });
  } catch {
    return;
  }
  noticeActionId.value = row.id;
  try {
    await publishAdminNotice(row.id);
    ElMessage.success("公告已发布");
    await loadNotices();
  } catch {
    // 请求层负责展示失败原因。
  } finally {
    noticeActionId.value = null;
  }
}

async function removeNotice(row: AdminNoticeArticle): Promise<void> {
  try {
    await ElMessageBox.confirm(`将《${row.title}》移入已删除列表，是否继续？`, "删除公告", { type: "warning" });
  } catch {
    return;
  }
  noticeActionId.value = row.id;
  try {
    await deleteAdminNotice(row.id);
    ElMessage.success("公告已删除");
    await loadNotices();
  } catch {
    // 请求层负责展示失败原因。
  } finally {
    noticeActionId.value = null;
  }
}

function closeDialog(): void {
  newsDialogVisible.value = false;
  noticeDialogVisible.value = false;
  dialogKind.value = null;
}
</script>

<template>
  <div class="workspace-page content-manage-page">
    <div class="workspace-breadcrumb"><router-link to="/content">资讯公告</router-link> / <span>内容管理</span></div>

    <header class="workspace-heading manage-heading">
      <div>
        <span class="eyebrow">CONTENT DESK / 管理后台</span>
        <h1>新闻与公告管理</h1>
        <p>维护资讯内容、发布状态与公告展示时间。</p>
      </div>
      <router-link class="back-to-content" to="/content">返回阅读页 <span aria-hidden="true">↗</span></router-link>
    </header>

    <section class="workspace-panel manage-panel">
      <el-tabs v-model="activeTab" class="manage-tabs">
        <el-tab-pane label="党建新闻" name="news">
          <form class="manage-filters" @submit.prevent="searchNews">
            <label class="sr-only" for="news-keyword">搜索新闻</label>
            <el-input
              id="news-keyword"
              v-model="newsKeywordInput"
              clearable
              maxlength="80"
              placeholder="搜索新闻标题或正文"
            />
            <el-select v-model="newsStatus" placeholder="全部状态" @change="applyNewsStatus">
              <el-option label="全部状态" value="" />
              <el-option label="已上线" :value="1" />
              <el-option label="已下线" :value="2" />
            </el-select>
            <el-button type="primary" native-type="submit" :loading="newsLoading">查询</el-button>
            <el-button native-type="button" :disabled="newsLoading" @click="resetNews">重置</el-button>
            <el-button class="create-button" type="primary" @click="openCreateNews">发布新闻</el-button>
          </form>

          <div class="list-summary">
            <strong>新闻列表</strong>
            <span v-if="!newsLoading && !newsError">共 {{ newsTotal }} 条</span>
          </div>
          <div v-if="newsError" class="table-state" role="alert">
            新闻列表加载失败。<el-button link type="primary" @click="loadNews">重试</el-button>
          </div>
          <el-table v-else v-loading="newsLoading" :data="newsRows" row-key="id" class="content-table">
            <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="120">
              <template #default="{ row }">{{ row.type || "未分类" }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" effect="plain">
                  {{ row.status === 1 ? "已上线" : "已下线" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
            </el-table-column>
            <el-table-column prop="viewCount" label="阅读量" width="90" />
            <el-table-column label="操作" fixed="right" width="210">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button link type="primary" :disabled="newsActionId === row.id" @click="openEditNews(row)">
                    编辑
                  </el-button>
                  <el-button link type="primary" :loading="newsActionId === row.id" @click="toggleNewsStatus(row)">
                    {{ row.status === 1 ? "下线" : "上线" }}
                  </el-button>
                  <el-button link type="danger" :loading="newsActionId === row.id" @click="removeNews(row)">
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="newsKeyword ? '没有匹配的新闻' : '暂无新闻记录'" />
            </template>
          </el-table>
          <div v-if="newsTotal > pageSize && !newsError" class="table-pagination">
            <el-pagination
              v-model:current-page="newsPage"
              :page-size="pageSize"
              :total="newsTotal"
              layout="prev, pager, next, total"
              background
              @current-change="loadNews"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="通知公告" name="notices">
          <form class="manage-filters" @submit.prevent="searchNotices">
            <label class="sr-only" for="notice-keyword">搜索公告</label>
            <el-input
              id="notice-keyword"
              v-model="noticeKeywordInput"
              clearable
              maxlength="80"
              placeholder="搜索公告标题或正文"
            />
            <el-select v-model="noticeStatus" placeholder="全部状态" @change="applyNoticeStatus">
              <el-option label="全部状态" value="" />
              <el-option label="正常" :value="1" />
              <el-option label="已删除" :value="2" />
              <el-option label="延期展示" :value="3" />
            </el-select>
            <el-button type="primary" native-type="submit" :loading="noticeLoading">查询</el-button>
            <el-button native-type="button" :disabled="noticeLoading" @click="resetNotices">重置</el-button>
            <el-button class="create-button" type="primary" @click="openCreateNotice">发布公告</el-button>
          </form>

          <div class="list-summary">
            <strong>公告列表</strong>
            <span v-if="!noticeLoading && !noticeError">共 {{ noticeTotal }} 条</span>
          </div>
          <div v-if="noticeError" class="table-state" role="alert">
            公告列表加载失败。<el-button link type="primary" @click="loadNotices">重试</el-button>
          </div>
          <el-table v-else v-loading="noticeLoading" :data="noticeRows" row-key="id" class="content-table">
            <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : row.status === 3 ? 'warning' : 'info'" effect="plain">
                  {{ row.status === 1 ? "正常" : row.status === 3 ? "延期展示" : "已删除" }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="展示期" min-width="250">
              <template #default="{ row }">
                {{ row.startTime ? formatDateTime(row.startTime) : "不限" }} —
                {{ row.endTime ? formatDateTime(row.endTime) : "不限" }}
              </template>
            </el-table-column>
            <el-table-column label="发布时间" width="150">
              <template #default="{ row }">{{ formatDateTime(row.publishTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" fixed="right" width="190">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button
                    link
                    type="primary"
                    :disabled="row.status === 2 || noticeActionId === row.id"
                    @click="openEditNotice(row)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-if="row.status === 3"
                    link
                    type="primary"
                    :loading="noticeActionId === row.id"
                    @click="publishNotice(row)"
                  >
                    发布
                  </el-button>
                  <el-button
                    v-if="row.status !== 2"
                    link
                    type="danger"
                    :loading="noticeActionId === row.id"
                    @click="removeNotice(row)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="noticeKeyword ? '没有匹配的公告' : '暂无公告记录'" />
            </template>
          </el-table>
          <div v-if="noticeTotal > pageSize && !noticeError" class="table-pagination">
            <el-pagination
              v-model:current-page="noticePage"
              :page-size="pageSize"
              :total="noticeTotal"
              layout="prev, pager, next, total"
              background
              @current-change="loadNotices"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="newsDialogVisible"
      :title="dialogTitle"
      class="content-manage-dialog"
      width="min(760px, calc(100vw - 28px))"
      destroy-on-close
      @closed="closeDialog"
    >
      <div v-if="dialogLoading" class="dialog-state" role="status">正在读取内容…</div>
      <el-form v-else ref="newsFormRef" :model="newsForm" :rules="newsRules" label-position="top" class="content-form">
        <el-form-item label="新闻标题（最多 10 字）" prop="title">
          <el-input v-model="newsForm.title" maxlength="10" show-word-limit placeholder="请输入新闻标题" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="新闻类型（最多 10 字）" prop="type">
            <el-input v-model="newsForm.type" maxlength="10" placeholder="如：党建要闻" />
          </el-form-item>
          <el-form-item label="发布状态" prop="status">
            <el-select v-model="newsForm.status" class="full-width">
              <el-option label="已下线" :value="2" />
              <el-option label="已上线" :value="1" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="封面图片链接（最多 100 字）" prop="cover">
          <el-input v-model="newsForm.cover" maxlength="100" placeholder="https://example.com/cover.jpg" />
          <p class="field-note">当前接口接收图片 URL，不支持本地文件上传。</p>
        </el-form-item>
        <el-form-item label="新闻正文" prop="content">
          <el-input
            v-model="newsForm.content"
            type="textarea"
            :rows="10"
            resize="vertical"
            maxlength="50000"
            show-word-limit
            placeholder="请输入新闻正文"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newsDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="dialogLoading" @click="submitNews"> 保存 </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="noticeDialogVisible"
      :title="dialogTitle"
      class="content-manage-dialog"
      width="min(760px, calc(100vw - 28px))"
      destroy-on-close
      @closed="closeDialog"
    >
      <div v-if="dialogLoading" class="dialog-state" role="status">正在读取内容…</div>
      <el-form
        v-else
        ref="noticeFormRef"
        :model="noticeForm"
        :rules="noticeRules"
        label-position="top"
        class="content-form"
      >
        <el-form-item label="公告标题（最多 30 字）" prop="title">
          <el-input v-model="noticeForm.title" maxlength="30" show-word-limit placeholder="请输入公告标题" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="展示状态" prop="status">
            <el-select v-model="noticeForm.status" class="full-width">
              <el-option label="正常" :value="1" />
              <el-option label="延期展示" :value="3" />
            </el-select>
          </el-form-item>
          <div class="form-tip">公告创建后由阅读页按展示时间自动控制可见范围。</div>
        </div>
        <el-form-item label="公告内容" prop="content">
          <el-radio-group v-model="noticeForm.contentMode" class="content-mode-switch">
            <el-radio-button value="text">正文</el-radio-button>
            <el-radio-button value="file">文件链接</el-radio-button>
          </el-radio-group>
          <el-input
            v-if="noticeForm.contentMode === 'text'"
            v-model="noticeForm.content"
            type="textarea"
            :rows="8"
            resize="vertical"
            maxlength="15000"
            show-word-limit
            placeholder="请输入公告正文"
          />
          <template v-else>
            <el-input v-model="noticeForm.content" maxlength="1000" placeholder="https://example.com/notice.pdf" />
            <p class="field-note">仅支持 http(s) 链接或站内路径，不提供本地文件上传。</p>
          </template>
        </el-form-item>
        <div class="form-grid period-grid">
          <el-form-item label="展示开始时间">
            <el-date-picker
              v-model="noticeForm.startTime"
              type="datetime"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="不限制开始时间"
              class="full-width"
            />
          </el-form-item>
          <el-form-item label="展示结束时间">
            <el-date-picker
              v-model="noticeForm.endTime"
              type="datetime"
              format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="不限制结束时间"
              class="full-width"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="noticeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="dialogLoading" @click="submitNotice">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.content-manage-page {
  max-width: 1580px;
  --el-color-primary: #c12c1f;
  --el-color-primary-dark-2: #a01e1a;
  --el-color-primary-light-3: #d7655b;
  --el-color-primary-light-5: #e3948c;
  --el-color-primary-light-7: #f1c2be;
  --el-color-primary-light-8: #f6d7d4;
  --el-color-primary-light-9: #fbefee;
}

:global(.content-manage-dialog) {
  --el-color-primary: #c12c1f;
  --el-color-primary-dark-2: #a01e1a;
  --el-color-primary-light-3: #d7655b;
  --el-color-primary-light-5: #e3948c;
  --el-color-primary-light-7: #f1c2be;
  --el-color-primary-light-8: #f6d7d4;
  --el-color-primary-light-9: #fbefee;
}

.workspace-breadcrumb a,
.back-to-content {
  color: var(--party-red);
}

.workspace-breadcrumb a:hover,
.back-to-content:hover {
  text-decoration: underline;
}

.manage-heading {
  align-items: flex-end;
  border-top: 4px solid var(--party-red);
  padding-top: 20px;
}

.eyebrow {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
}

.manage-heading h1 {
  margin-top: 7px;
}

.back-to-content {
  padding-bottom: 4px;
  font-size: 13px;
  white-space: nowrap;
}

.manage-panel {
  padding: 0 24px 24px;
}

.manage-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.manage-tabs :deep(.el-tabs__item) {
  height: 58px;
  font-size: 15px;
}

.manage-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 19px 0 8px;
}

.manage-filters > .el-input {
  width: min(320px, 100%);
}

.manage-filters > .el-select {
  width: 150px;
}

.manage-filters :deep(.el-button + .el-button) {
  margin-left: 0;
}

.create-button {
  margin-left: auto;
}

.list-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 14px 0 8px;
  padding: 0 2px 12px;
  border-bottom: 2px solid #3e4c50;
}

.list-summary strong {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 20px;
}

.list-summary span {
  color: #939e9f;
  font-size: 12px;
}

.content-table {
  width: 100%;
}

.content-table :deep(th.el-table__cell) {
  color: #58656a;
  font-weight: 700;
  background: #f8f7f3;
}

.content-table :deep(td.el-table__cell) {
  padding-top: 13px;
  padding-bottom: 13px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.table-state,
.dialog-state {
  display: grid;
  place-content: center;
  min-height: 250px;
  color: #879295;
  text-align: center;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 20px;
}

.content-form {
  padding: 2px 4px;
}

.content-form :deep(.el-form-item) {
  margin-bottom: 19px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.form-grid .el-form-item {
  min-width: 0;
}

.full-width {
  width: 100%;
}

.field-note,
.form-tip {
  margin: 7px 0 0;
  color: #879295;
  font-size: 12px;
  line-height: 1.6;
}

.form-tip {
  align-self: center;
  padding-bottom: 18px;
}

.content-mode-switch {
  display: flex;
  margin-bottom: 12px;
}

.content-mode-switch + .el-input,
.content-mode-switch ~ .el-input {
  width: 100%;
}

.period-grid {
  gap: 18px;
}

.period-grid :deep(.el-date-editor) {
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .manage-panel {
    padding: 0 15px 17px;
  }

  .manage-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .manage-filters > .el-input {
    width: 100%;
  }

  .create-button {
    margin-left: 0;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .form-tip {
    padding: 0 0 16px;
  }

  .table-pagination {
    justify-content: center;
    overflow-x: auto;
  }
}
</style>
