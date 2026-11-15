<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useAppStore } from "@/stores/app";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { getApiErrorMessage } from "@/utils/apiError";
import { getMyCultivationProfile, type CultivationProfile } from "@/api/cultivation-profiles";
import {
  formatOptionalText,
  formatRecordTime,
  signTypeLabel,
  signTypeTagType,
} from "@/views/activity/participationDisplay";
import LocalPager from "@/components/development/LocalPager.vue";
import {
  countLabel,
  identityChangeStatusLabel,
  identityChangeTagType,
  identityShiftLabel,
  leaveStatusLabel,
  relationLabel,
  scoreLabel,
  signRemarkText,
  studyMinutesHint,
  formatStudyDuration,
  formatStudyMinutes,
  thoughtReportStatusLabel,
  thoughtReportTagType,
} from "./myDevelopmentDisplay";

/**
 * 我的培养：本人电子培养档案（只读）。
 *
 * 数据来源只有 `GET /v4/cultivation-profiles/me`，服务端按登录态决定查询对象。
 * 页面不接收前端传入的用户标识，也不为补齐活动标题、课程名、联系人姓名而额外请求接口；
 * 记录里的关联对象只有编号时按编号展示；材料的 `file:` 内部路径与学习证书地址只作为文字记录，
 * 不生成可点击地址、不提供下载。
 */
const store = useAppStore();

/** 与路由 meta.roles 保持一致：本页只服务普通成员与开发预览的 activist。 */
const ALLOWED_ROLES = ["party_member", "activist"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);

const profile = ref<CultivationProfile | null>(null);
const loading = ref(false);
const loadError = ref("");

const basic = computed(() => profile.value?.basic ?? null);
const summary = computed(() => profile.value?.summary ?? null);
const mentors = computed(() => profile.value?.mentors ?? []);
const identityChanges = computed(() => profile.value?.identityChanges ?? []);
const thoughtReports = computed(() => profile.value?.thoughtReports ?? []);
const signRecords = computed(() => profile.value?.signRecords ?? []);
const leaves = computed(() => profile.value?.leaves ?? []);
const studyRecords = computed(() => profile.value?.studyRecords ?? []);
const materials = computed(() => profile.value?.materials ?? []);

let disposed = false;
function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;
async function loadProfile(): Promise<void> {
  if (!canView.value || disposed) return;
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = "";
  // 失败重试时不能保留上一次的档案，否则会把旧数据当成本次结果展示。
  profile.value = null;
  try {
    const result = await getMyCultivationProfile();
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = result;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = null;
    loadError.value = getApiErrorMessage(error, "暂时无法加载本人培养档案");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

function retry(): void {
  void loadProfile();
}

// ============ 分页（本地分页：服务端一次返回全部记录） ============
const PAGE_SIZE = 5;
const STUDY_PAGE_SIZE = 10;
const pages = reactive<Record<string, number>>({
  mentors: 1,
  identityChanges: 1,
  thoughtReports: 1,
  signRecords: 1,
  leaves: 1,
  studyRecords: 1,
  materials: 1,
});

function pageSizeOf(key: string): number {
  return key === "studyRecords" ? STUDY_PAGE_SIZE : PAGE_SIZE;
}

function currentPage(key: string): number {
  return pages[key] ?? 1;
}

function pagedSlice<T>(key: string, list: T[]): T[] {
  const size = pageSizeOf(key);
  const start = (currentPage(key) - 1) * size;
  return list.slice(start, start + size);
}

function resetPages(): void {
  Object.keys(pages).forEach((key) => {
    pages[key] = 1;
  });
}

// ============ 思想汇报正文：默认截断，可展开 ============
const expandedReports = reactive<Record<number, boolean>>({});

function reportIsLong(content: string | null | undefined): boolean {
  const text = content ?? "";
  return text.length > 180 || text.split("\n").length > 4;
}

function toggleReport(id: number): void {
  expandedReports[id] = !expandedReports[id];
}

// ============ 摘要（全部取服务端 summary，缺失时明确「未统计」） ============
const summaryCards = computed(() => {
  const value = summary.value;
  return [
    {
      key: "thought",
      label: "思想汇报",
      value: value ? countLabel(value.thoughtReportCount, "条") : "未统计",
      note: value ? "其中已通过 " + countLabel(value.thoughtReportApproved, "条") : "服务端未返回摘要",
    },
    {
      key: "sign",
      label: "活动签到",
      value: value ? countLabel(value.signCount, "次") : "未统计",
      note: "仅签到次数，不含报名与请假",
    },
    {
      key: "study",
      label: "累计学习时长",
      value: value ? formatStudyMinutes(value.studyMinutes) : "未统计",
      note: value ? studyMinutesHint(value.studyMinutes) || "按学习记录已登记的学时累计" : "服务端未返回摘要",
    },
    {
      key: "material",
      label: "培养材料",
      value: value ? countLabel(value.materialCount, "份") : "未统计",
      note: "仅统计正常状态材料",
    },
  ];
});

/** 基本信息里的空值统一显示占位，避免空白被误认为加载失败。 */
function displayField(value: string | null | undefined): string {
  return (value ?? "").trim() || "暂未填写";
}

function invalidate(): void {
  requestSequence++;
  profile.value = null;
  loading.value = false;
  loadError.value = "";
  resetPages();
  Object.keys(expandedReports).forEach((key) => {
    delete expandedReports[Number(key)];
  });
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
  <main class="my-dev page-container">
    <header class="page-heading">
      <div>
        <span class="eyebrow">MY CULTIVATION / 我的培养</span>
        <h1>我的培养</h1>
        <p>查看本人的电子培养档案：基本信息、培养联系人、身份变化、思想汇报、活动签到与培养材料。</p>
      </div>
      <el-tag class="readonly-tag" effect="plain" type="info">本人档案 · 只读</el-tag>
    </header>

    <el-alert v-if="!sessionHasAccessToken" title="我的培养需要登录" type="warning" show-icon :closable="false">
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实培养档案。请使用本人账号登录后再访问。</p>
      </template>
    </el-alert>

    <el-alert
      v-else-if="!ALLOWED_ROLES.includes(store.currentRole)"
      title="当前身份无权查看我的培养"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>本页仅面向普通成员展示本人培养档案；管理侧档案请在党员发展模块查看。</p>
      </template>
    </el-alert>

    <div v-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
      <el-skeleton :rows="5" animated />
      <span class="state-caption">正在加载本人培养档案…</span>
    </div>

    <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="my-dev-error">
      <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
      <div class="state-copy">
        <h3>培养档案暂时无法加载</h3>
        <p>{{ loadError }}</p>
      </div>
      <el-button type="primary" plain data-testid="my-dev-retry" @click="retry">
        <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
      </el-button>
    </div>

    <template v-else-if="canView && profile">
      <section class="surface content-card" aria-labelledby="my-dev-basic-title" data-testid="my-dev-basic">
        <div class="section-heading">
          <div>
            <span class="section-index">01 / BASIC</span>
            <h2 id="my-dev-basic-title">基本信息</h2>
          </div>
          <p>信息来自培养档案；如有错误请联系支部管理员更新。</p>
        </div>

        <div v-if="!basic" class="basic-missing" role="note">
          <el-icon aria-hidden="true"><InfoFilled /></el-icon>
          <span>档案基本信息缺失，以下记录仍按服务端返回展示。</span>
        </div>

        <dl v-else class="basic-grid">
          <div class="basic-item">
            <dt>姓名</dt>
            <dd>{{ (basic.realName ?? "").trim() || "未登记姓名" }}</dd>
          </div>
          <div class="basic-item">
            <dt>学号</dt>
            <dd>{{ displayField(basic.studentId) }}</dd>
          </div>
          <div class="basic-item">
            <dt>所属支部</dt>
            <dd>{{ (basic.branchName ?? "").trim() || "未分配支部" }}</dd>
          </div>
          <div class="basic-item">
            <dt>当前政治身份</dt>
            <dd>
              <el-tag effect="plain" type="danger">{{ (basic.identityName ?? "").trim() || "未登记政治身份" }}</el-tag>
              <span class="identity-note">当前政治身份以档案为准；系统角色不代表政治身份。</span>
            </dd>
          </div>
          <div class="basic-item">
            <dt>学院</dt>
            <dd>{{ displayField(basic.college) }}</dd>
          </div>
          <div class="basic-item">
            <dt>年级</dt>
            <dd>{{ displayField(basic.grade) }}</dd>
          </div>
          <div class="basic-item">
            <dt>专业</dt>
            <dd>{{ displayField(basic.major) }}</dd>
          </div>
          <div class="basic-item">
            <dt>班级</dt>
            <dd>{{ displayField(basic.className) }}</dd>
          </div>
        </dl>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-summary-title" data-testid="my-dev-summary">
        <div class="section-heading">
          <div>
            <span class="section-index">02 / SUMMARY</span>
            <h2 id="my-dev-summary-title">培养摘要</h2>
          </div>
          <p>摘要由服务端统计，页面不做二次计算。</p>
        </div>
        <div class="summary-grid">
          <article
            v-for="card in summaryCards"
            :key="card.key"
            class="summary-card"
            :data-testid="'my-dev-summary-' + card.key"
          >
            <span class="summary-label">{{ card.label }}</span>
            <strong class="summary-value">{{ card.value }}</strong>
            <span class="summary-note">{{ card.note }}</span>
          </article>
        </div>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-mentors-title" data-testid="my-dev-mentors">
        <div class="section-heading">
          <div>
            <span class="section-index">03 / MENTORS</span>
            <h2 id="my-dev-mentors-title">培养联系人</h2>
          </div>
          <p>联系人为当前生效关系；换人后此处随之更新。</p>
        </div>
        <el-empty v-if="mentors.length === 0" description="尚未设置培养联系人" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="mentor in pagedSlice('mentors', mentors)" :key="mentor.mentorId" class="row-card">
              <div class="row-main">
                <span class="row-title">{{
                  (mentor.realName ?? "").trim() || (mentor.username ?? "").trim() || "姓名未知"
                }}</span>
                <span class="row-meta">联系人编号 {{ relationLabel(mentor.mentorId) }}</span>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.mentors" :total="mentors.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section
        class="surface content-card"
        aria-labelledby="my-dev-identity-title"
        data-testid="my-dev-identity-changes"
      >
        <div class="section-heading">
          <div>
            <span class="section-index">04 / IDENTITY</span>
            <h2 id="my-dev-identity-title">身份变更历史</h2>
          </div>
          <p>按发起时间倒序；已作废的变更单不在此展示。身份编号对应后台身份字典，本页不额外取名称。</p>
        </div>
        <el-empty v-if="identityChanges.length === 0" description="暂无身份变更记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="item in pagedSlice('identityChanges', identityChanges)" :key="item.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">身份 {{ identityShiftLabel(item.fromIdentity, item.toIdentity) }}</span>
                  <el-tag :type="identityChangeTagType(item.status)" size="small" effect="plain">
                    {{ identityChangeStatusLabel(item.status) }}
                  </el-tag>
                </div>
                <span class="row-meta">发起时间 {{ formatRecordTime(item.createTime) }}</span>
                <p class="row-text">变更原因：{{ formatOptionalText(item.reason) }}</p>
                <p v-if="(item.reviewRemark ?? '').trim()" class="row-text">审批意见：{{ item.reviewRemark }}</p>
                <p v-if="item.reviewTime" class="row-meta">审批时间 {{ formatRecordTime(item.reviewTime) }}</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.identityChanges" :total="identityChanges.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-reports-title" data-testid="my-dev-thought-reports">
        <div class="section-heading">
          <div>
            <span class="section-index">05 / REPORTS</span>
            <h2 id="my-dev-reports-title">思想汇报</h2>
          </div>
          <p>正文为纯文本展示；附件内部路径仅作文字记录，本页不提供下载。</p>
        </div>
        <el-empty v-if="thoughtReports.length === 0" description="暂无思想汇报记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="report in pagedSlice('thoughtReports', thoughtReports)" :key="report.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">{{ (report.title ?? "").trim() || "未填写标题" }}</span>
                  <el-tag :type="thoughtReportTagType(report.status)" size="small" effect="plain">
                    {{ thoughtReportStatusLabel(report.status) }}
                  </el-tag>
                </div>
                <span class="row-meta">提交时间 {{ formatRecordTime(report.submitTime) }}</span>
                <p
                  class="row-text report-content"
                  :class="{ collapsed: reportIsLong(report.content) && !expandedReports[report.id] }"
                >
                  {{ (report.content ?? "").trim() || "未填写正文" }}
                </p>
                <el-button
                  v-if="reportIsLong(report.content)"
                  link
                  type="primary"
                  size="small"
                  @click="toggleReport(report.id)"
                >
                  {{ expandedReports[report.id] ? "收起" : "展开全文" }}
                </el-button>
                <p v-if="(report.reviewRemark ?? '').trim()" class="row-text">审阅建议：{{ report.reviewRemark }}</p>
                <p v-if="report.reviewTime" class="row-meta">审阅时间 {{ formatRecordTime(report.reviewTime) }}</p>
                <p v-if="(report.file ?? '').trim()" class="row-meta">含附件材料（内部保存，本页不展示路径与下载）</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.thoughtReports" :total="thoughtReports.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-signs-title" data-testid="my-dev-signs">
        <div class="section-heading">
          <div>
            <span class="section-index">06 / SIGNS</span>
            <h2 id="my-dev-signs-title">活动签到</h2>
          </div>
          <p>仅列出已发生的签到记录，不据此推算迟到、缺席或出勤率。</p>
        </div>
        <el-empty v-if="signRecords.length === 0" description="暂无活动签到记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="record in pagedSlice('signRecords', signRecords)" :key="record.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">活动编号 {{ relationLabel(record.activityId) }}</span>
                  <el-tag :type="signTypeTagType(record.signType)" size="small" effect="plain">
                    {{ signTypeLabel(record.signType) }}
                  </el-tag>
                </div>
                <span class="row-meta">签到时间 {{ formatRecordTime(record.signTime) }}</span>
                <p v-if="signRemarkText(record.device, record.remark)" class="row-text">
                  {{ signRemarkText(record.device, record.remark) }}
                </p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.signRecords" :total="signRecords.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-leaves-title" data-testid="my-dev-leaves">
        <div class="section-heading">
          <div>
            <span class="section-index">07 / LEAVES</span>
            <h2 id="my-dev-leaves-title">请假记录</h2>
          </div>
          <p>请假是已批准的预期，与签到记录分开统计。</p>
        </div>
        <el-empty v-if="leaves.length === 0" description="暂无请假记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="leave in pagedSlice('leaves', leaves)" :key="leave.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">活动编号 {{ relationLabel(leave.activityId) }}</span>
                  <el-tag type="info" size="small" effect="plain">{{ leaveStatusLabel(leave.status) }}</el-tag>
                </div>
                <span class="row-meta">申请时间 {{ formatRecordTime(leave.createTime) }}</span>
                <p class="row-text">请假原因：{{ formatOptionalText(leave.reason) }}</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.leaves" :total="leaves.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-studies-title" data-testid="my-dev-studies">
        <div class="section-heading">
          <div>
            <span class="section-index">08 / STUDIES</span>
            <h2 id="my-dev-studies-title">学习记录</h2>
          </div>
          <p>学时按记录时长统计，成绩原样展示；证书地址仅作为文字记录，不提供跳转。</p>
        </div>
        <el-empty v-if="studyRecords.length === 0" description="暂无学习记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="record in pagedSlice('studyRecords', studyRecords)" :key="record.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">课程编号 {{ relationLabel(record.courseId) }}</span>
                  <el-tag type="info" size="small" effect="plain"
                    >学时 {{ formatStudyDuration(record.studyTime) }}</el-tag
                  >
                </div>
                <span class="row-meta">记录时间 {{ formatRecordTime(record.createTime) }}</span>
                <p class="row-text">成绩：{{ scoreLabel(record.score) }}</p>
                <p v-if="(record.remark ?? '').trim()" class="row-text">备注：{{ record.remark }}</p>
                <p v-if="(record.url ?? '').trim()" class="row-meta">含证书材料（内部保存，本页不展示路径与跳转）</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.studyRecords" :total="studyRecords.length" :page-size="STUDY_PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="my-dev-materials-title" data-testid="my-dev-materials">
        <div class="section-heading">
          <div>
            <span class="section-index">09 / MATERIALS</span>
            <h2 id="my-dev-materials-title">培养材料</h2>
          </div>
          <p>材料文件保存在服务端内部，本页只展示材料信息，不提供下载。</p>
        </div>
        <el-empty v-if="materials.length === 0" description="暂无培养材料" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="item in pagedSlice('materials', materials)" :key="item.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">{{ (item.fileName ?? "").trim() || "文件名未知" }}</span>
                  <el-tag type="info" size="small" effect="plain">
                    {{ (item.materialType ?? "").trim() || "未标注类型" }}
                  </el-tag>
                </div>
                <span class="row-meta">上传时间 {{ formatRecordTime(item.createTime) }}</span>
                <p v-if="(item.remark ?? '').trim()" class="row-text">备注：{{ item.remark }}</p>
                <p v-if="(item.file ?? '').trim()" class="row-meta">材料文件保存在服务端内部，需查看请联系支部管理员</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.materials" :total="materials.length" :page-size="PAGE_SIZE" />
        </template>
      </section>
    </template>

    <el-empty v-else-if="canView" class="state-card content-card" description="暂未获取到本人培养档案" :image-size="72">
      <el-button type="primary" plain data-testid="my-dev-retry" @click="retry">重新加载</el-button>
    </el-empty>
  </main>
</template>

<style lang="scss" scoped>
.my-dev {
  padding-top: 24px;
  padding-bottom: 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    color: var(--party-red);
    font-weight: 600;
  }

  h1 {
    font-size: 26px;
    color: var(--text-primary);
    margin: 6px 0 8px;
  }

  p {
    font-size: 13px;
    color: var(--text-regular);
    line-height: 1.7;
    max-width: 640px;
  }

  .readonly-tag {
    flex: 0 0 auto;
  }
}

.surface {
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  min-width: 0;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);

  h2 {
    font-size: 17px;
    color: var(--text-primary);
    margin-top: 4px;
  }

  p {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 460px;
  }

  .section-index {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--party-red);
    font-weight: 600;
  }
}

.state-card {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 24px;
  border-radius: var(--radius-lg);

  .state-icon {
    font-size: 26px;
  }

  .error-icon {
    color: var(--party-red);
  }

  .state-copy {
    flex: 1 1 260px;
    min-width: 0;

    h3 {
      font-size: 15px;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    p {
      font-size: 13px;
      color: var(--text-regular);
      overflow-wrap: anywhere;
    }
  }

  .state-caption {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.basic-missing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-regular);
  font-size: 13px;
  background: var(--party-red-bg);
  border-radius: var(--radius-base);
  padding: 10px 14px;
}

.basic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 14px 24px;

  .basic-item {
    min-width: 0;
  }

  dt {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  dd {
    font-size: 14px;
    color: var(--text-primary);
    overflow-wrap: anywhere;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .identity-note {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 12px;

  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-base);
    background: #fcfcfa;
    min-width: 0;
  }

  .summary-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .summary-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--party-red);
    overflow-wrap: anywhere;
  }

  .summary-note {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.list-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  padding: 12px 14px;
  min-width: 0;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.row-meta {
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.row-text {
  font-size: 13px;
  color: var(--text-regular);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.report-content {
  white-space: pre-wrap;
}

.report-content.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 768px) {
  .my-dev {
    padding-top: 16px;
  }

  .surface {
    padding: 18px 16px;
  }

  .page-heading h1 {
    font-size: 22px;
  }
}
</style>
