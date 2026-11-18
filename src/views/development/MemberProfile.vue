<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAppStore } from "@/stores/app";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import { getMemberCultivationProfile } from "@/api/cultivation";
import type { CultivationProfile } from "@/api/cultivation-profiles";
import { MAX_MENTORS, removeMemberMaterial, removeMemberMentor } from "@/api/cultivation-contacts";
import {
  formatOptionalText,
  formatRecordTime,
  memberIdLabel,
  signTypeLabel,
  signTypeTagType,
} from "@/views/activity/participationDisplay";
import LocalPager from "@/components/development/LocalPager.vue";
import IdentityChangeDialog from "@/components/development/IdentityChangeDialog.vue";
import MentorAssignDialog from "@/components/development/MentorAssignDialog.vue";
import MaterialUploadDialog from "@/components/development/MaterialUploadDialog.vue";
import {
  countLabel,
  formatStudyDuration,
  formatStudyMinutes,
  identityChangeStatusLabel,
  identityChangeTagType,
  identityShiftLabel,
  leaveStatusLabel,
  relationLabel,
  scoreLabel,
  signRemarkText,
  studyMinutesHint,
  thoughtReportStatusLabel,
  thoughtReportTagType,
} from "./myDevelopmentDisplay";

/**
 * 管理侧成员培养档案（`/development/member/:id`）。
 *
 * 读路径只请求 `GET /v4/cultivation-profiles/{userId}` 一次；写路径只有两处，都落在本页之外的状态上：
 * - 03 区块：指派/移除培养联系人（`/v4/members/{userId}/mentors`）；
 * - 09 区块：上传并登记/软删除培养材料（`/v4/uploads` + `/v4/members/{userId}/materials`）。
 * 两处写成功后都**重新拉取档案**，不改写本地数组：联系人是当前关系、材料列表由服务端按 `status=1`
 * 过滤，前端插值会立刻与下一次请求不一致。其余八个区块仍为只读。
 *
 * 只请求 `GET /v4/cultivation-profiles/{userId}` 一次，范围由服务端裁决：
 * 超管全院、支委本支部、其余角色仅本人；越权与真不存在同为 HTTP 400「用户不存在」，
 * 页面原样转达，不改写成「无权限」，也不据此推断成员是否存在。
 *
 * 不为补齐活动标题、课程名、人员姓名、支部名、身份名而额外请求任何接口：
 * 档案记录只带外键，`basic` 走 `ScopedMemberServiceImpl.buildVos`，`branchName`/`identityName` 不填充，
 * 因此支部按编号降级、政治身份显示「未登记政治身份」。服务端文本一律纯文本插值，
 * 材料 `file:`、汇报附件 `file`、学习证书 `url` 都是内部路径，不渲染其值、不生成链接。
 *
 * 页头的「发起身份变更」只负责 `POST /v4/identity-changes` 生成待审批单：
 * 提交成功**不刷新档案**（此时身份尚未生效，重新请求也拿不到新身份），
 * 也绝不本地改写 `identityName` 制造已变更的假象；生效由超管审批后再次请求档案体现。
 * 身份变更不联动登录角色，页面不会因此改动 `currentRole` 或导航。
 */
const store = useAppStore();
const route = useRoute();

/** 与路由 meta.roles 一致。 */
const ALLOWED_ROLES: readonly string[] = ["super_admin", "party_secretary"];

const canView = computed(() => ALLOWED_ROLES.includes(store.currentRole) && sessionHasAccessToken.value);

const userId = computed(() => Number(route.params.id));
const idValid = computed(() => Number.isSafeInteger(userId.value) && userId.value > 0);

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

/** 档案标题用的成员姓名：`buildVos` 会写 `realName`，缺失时才用账号。 */
const memberName = computed(() => basic.value?.realName?.trim() || basic.value?.username?.trim() || "未登记姓名");

const scopeLabel = computed(() => (store.currentRole === "super_admin" ? "全院范围" : "本支部范围"));

let disposed = false;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && canView.value && isSessionIdentityCurrent(snapshot);
}

let requestSequence = 0;

async function loadProfile(): Promise<void> {
  if (!canView.value || disposed) return;
  if (!idValid.value) {
    // 非法编号不发请求，直接给出确定性提示。
    profile.value = null;
    loading.value = false;
    loadError.value = "";
    invalidateInFlight();
    return;
  }
  const sequence = ++requestSequence;
  const snapshot = captureSessionIdentity();
  loading.value = true;
  loadError.value = "";
  // 失败重试或切换成员时不得残留上一份档案。
  profile.value = null;
  resetPages();
  try {
    const result = await getMemberCultivationProfile(userId.value);
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = result;
  } catch (error) {
    if (sequence !== requestSequence || !sessionOk(snapshot)) return;
    profile.value = null;
    loadError.value = getApiErrorMessage(error, "暂时无法加载该成员培养档案");
  } finally {
    if (sequence === requestSequence && isSessionIdentityCurrent(snapshot)) loading.value = false;
  }
}

function retry(): void {
  void loadProfile();
}

/** 使在途响应失效，但不清空错误提示（非法编号路径专用）。 */
function invalidateInFlight(): void {
  requestSequence++;
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

// ============ 摘要（全部取服务端 summary，缺失时明确「暂无统计」） ============
const summaryCards = computed(() => {
  const value = summary.value;
  return [
    {
      key: "thought",
      label: "思想汇报",
      value: value ? countLabel(value.thoughtReportCount, "条") : "暂无统计",
      note: value ? "其中已通过 " + countLabel(value.thoughtReportApproved, "条") : "服务端未返回摘要",
    },
    {
      key: "sign",
      label: "活动签到",
      value: value ? countLabel(value.signCount, "次") : "暂无统计",
      note: "仅签到次数，不含报名与请假",
    },
    {
      key: "study",
      label: "累计学习时长",
      value: value ? formatStudyMinutes(value.studyMinutes) : "暂无统计",
      note: value ? studyMinutesHint(value.studyMinutes) || "按学习记录已登记的学时累计" : "服务端未返回摘要",
    },
    {
      key: "material",
      label: "培养材料",
      value: value ? countLabel(value.materialCount, "份") : "暂无统计",
      note: "仅统计正常状态材料",
    },
  ];
});

/** 基本信息里的空值统一显示占位，避免空白被误认为加载失败。 */
function displayField(value: string | null | undefined): string {
  return (value ?? "").trim() || "未登记";
}

function branchText(value: { branchId: number | null; branchName: string | null } | null): string {
  if (!value) return "未分配支部";
  const name = value.branchName?.trim();
  if (name) return name;
  // buildVos 不填充 branchName，因此有编号时按编号降级，没有编号才是未分配。
  return value.branchId == null ? "未分配支部" : `支部名称不可用（编号 ${relationLabel(value.branchId)}）`;
}

// ============ 发起身份变更（仅生成待审批单，不刷新档案） ============
const identityDialogVisible = ref(false);

function openIdentityDialog(): void {
  if (!canView.value || !profile.value) return;
  identityDialogVisible.value = true;
}

/**
 * 提交成功后的处理：不主动重新请求档案。
 * 变更单此刻仍是待审批，按契约档案里的身份不会变；审批完成后由用户点页头「重新读取」回读，
 * 不在提交时静默多发一次请求，也不在本地改写 `identityName`。
 */
function onIdentityChangeSubmitted(): void {
  ElMessage.info("变更单已提交，审批通过后请点页头「重新读取」回读档案身份");
}

/** 审批完成后的回读入口：重新请求服务端，身份名以服务端为准。 */
function reloadProfile(): void {
  if (!canView.value || loading.value) return;
  void loadProfile();
}

/**
 * 写成功后的统一回读：联系人与材料都以服务端重新读取为准，不本地改写数组。
 * 读失败时页面进错误态（`loadProfile` 负责），不会把旧数据当成新结果展示。
 */
function refreshProfile(): void {
  void loadProfile();
}

// ============ 03 培养联系人：指派 / 移除 ============
const mentorDialogVisible = ref(false);
/** 移除中的联系人编号；**在二次确认前同步置位**，双击只弹一个确认框、只发一次请求。 */
const busyMentorId = ref<number | null>(null);

function openMentorDialog(): void {
  if (!canView.value || !profile.value || mentors.value.length >= MAX_MENTORS) return;
  mentorDialogVisible.value = true;
}

function removeMentor(mentorId: number, name: string): void {
  if (busyMentorId.value != null || !canView.value) return;
  busyMentorId.value = mentorId;
  const snapshot = captureSessionIdentity();
  void (async () => {
    try {
      try {
        await ElMessageBox.confirm(
          `移除后该联系人不再出现在档案中，历史思想汇报的所属联系人随之变化。联系人：${name}。`,
          "移除培养联系人",
          { confirmButtonText: "确认移除", cancelButtonText: "取消", type: "warning" },
        );
      } catch {
        return;
      }
      await removeMemberMentor(userId.value, mentorId);
      if (!sessionOk(snapshot)) return;
      ElMessage.success("培养联系人已移除");
      await loadProfile();
    } catch (error) {
      if (!sessionOk(snapshot)) return;
      // 原文照转达，例如「培养联系人不存在」。
      ElMessage.error(getApiErrorMessage(error, "移除培养联系人失败"));
    } finally {
      busyMentorId.value = null;
    }
  })();
}

// ============ 09 培养材料：上传登记 / 软删除 ============
const materialDialogVisible = ref(false);
/** 删除中的材料编号；同样在二次确认前同步置位。 */
const busyMaterialId = ref<number | null>(null);

function openMaterialDialog(): void {
  if (!canView.value || !profile.value) return;
  materialDialogVisible.value = true;
}

function removeMaterial(materialId: number, fileName: string): void {
  if (busyMaterialId.value != null || !canView.value) return;
  busyMaterialId.value = materialId;
  const snapshot = captureSessionIdentity();
  void (async () => {
    try {
      try {
        await ElMessageBox.confirm(
          `删除后这条材料不再出现在列表中；服务端为软删除，记录与文件都保留。材料：${fileName}。`,
          "删除培养材料",
          { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning" },
        );
      } catch {
        return;
      }
      await removeMemberMaterial(userId.value, materialId);
      if (!sessionOk(snapshot)) return;
      ElMessage.success("培养材料已删除");
      await loadProfile();
    } catch (error) {
      if (!sessionOk(snapshot)) return;
      // 原文照转达，例如「材料不存在」。
      ElMessage.error(getApiErrorMessage(error, "删除培养材料失败"));
    } finally {
      busyMaterialId.value = null;
    }
  })();
}

function invalidate(): void {
  requestSequence++;
  profile.value = null;
  loading.value = false;
  loadError.value = "";
  resetPages();
  identityDialogVisible.value = false;
  mentorDialogVisible.value = false;
  materialDialogVisible.value = false;
  busyMentorId.value = null;
  busyMaterialId.value = null;
  Object.keys(expandedReports).forEach((key) => {
    delete expandedReports[Number(key)];
  });
}

onMounted(() => {
  if (!canView.value) return;
  void loadProfile();
});

watch([canView, sessionIdentity], () => {
  // 退出、换号或权限变化：丢弃旧会话的档案与在途响应，再按新会话重新拉取。
  invalidate();
  if (canView.value) void loadProfile();
});

// 切换成员不需要额外的 id 监听：App.vue 用 `path + role` 作 router-view 的 key，
// `/development/member/:id` 的 id 属于 path，切号会重建本组件并重新 onMounted。

onBeforeUnmount(() => {
  disposed = true;
  invalidate();
});
</script>

<template>
  <main class="dev-profile page-container" data-testid="dev-profile">
    <header class="page-heading">
      <div class="heading-main">
        <button class="back-link" type="button" data-testid="dev-profile-back" @click="$router.push('/development')">
          ← 返回成员列表
        </button>
        <h1>{{ profile ? memberName : "成员培养档案" }}</h1>
        <p>管理侧档案：范围由服务端按登录身份判定（{{ scopeLabel }}），页面不发送任何范围参数。</p>
      </div>
      <el-tag class="readonly-tag" effect="plain" type="info">管理侧档案 · 联系人/材料可维护</el-tag>
      <div class="heading-actions">
        <el-button
          v-if="canView && profile"
          plain
          :loading="loading"
          data-testid="dev-profile-reload"
          @click="reloadProfile"
        >
          重新读取
        </el-button>
        <el-button
          v-if="canView && profile"
          type="primary"
          data-testid="identity-change-open"
          @click="openIdentityDialog"
        >
          发起身份变更
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="dev-profile-no-token"
      title="培养档案需要登录"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不会请求真实培养档案。请使用管理员或支部书记账号登录后再访问。</p>
      </template>
    </el-alert>

    <el-alert
      v-else-if="!idValid"
      data-testid="dev-profile-invalid"
      title="成员编号无效"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #default>
        <p>地址中的成员编号必须是正整数，本页不会为此发出请求。请从成员列表重新进入。</p>
      </template>
    </el-alert>

    <div v-else-if="loading" class="state-card content-card" role="status" aria-live="polite" aria-busy="true">
      <el-skeleton :rows="5" animated />
      <span class="state-caption">正在加载培养档案…</span>
    </div>

    <div v-else-if="loadError" class="state-card content-card" role="alert" data-testid="dev-profile-error">
      <el-icon class="state-icon error-icon" aria-hidden="true"><WarningFilled /></el-icon>
      <div class="state-copy">
        <h3>培养档案暂时无法加载</h3>
        <p>{{ loadError }}</p>
      </div>
      <el-button type="primary" plain data-testid="dev-profile-retry" @click="retry">
        <el-icon aria-hidden="true"><Refresh /></el-icon>重新加载
      </el-button>
    </div>

    <template v-else-if="canView && profile">
      <section class="surface content-card" aria-labelledby="dev-basic-title" data-testid="dev-profile-basic">
        <div class="section-heading">
          <div>
            <span class="section-index">01 / BASIC</span>
            <h2 id="dev-basic-title">基本信息</h2>
          </div>
          <p>信息来自服务端成员档案；如有错误请在成员管理或联系支部管理员更新。</p>
        </div>
        <div v-if="!basic" class="basic-missing" role="note">
          <el-icon aria-hidden="true"><InfoFilled /></el-icon>
          <span>档案基本信息缺失，以下记录仍按服务端返回展示。</span>
        </div>
        <dl v-else class="basic-grid">
          <div class="basic-item">
            <dt>姓名</dt>
            <dd>{{ memberName }}</dd>
          </div>
          <div class="basic-item">
            <dt>学号</dt>
            <dd>{{ displayField(basic.studentId) }}</dd>
          </div>
          <div class="basic-item">
            <dt>所属支部</dt>
            <dd>
              {{ branchText(basic) }}
              <span class="identity-note">档案接口不返回支部名称，编号对应后台支部字典。</span>
            </dd>
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
          <div class="basic-item">
            <dt>手机号</dt>
            <dd>{{ displayField(basic.phone) }}</dd>
          </div>
          <div class="basic-item">
            <dt>邮箱</dt>
            <dd>{{ displayField(basic.email) }}</dd>
          </div>
          <div class="basic-item">
            <dt>备注</dt>
            <dd>{{ displayField(basic.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="surface content-card" aria-labelledby="dev-summary-title" data-testid="dev-profile-summary">
        <div class="section-heading">
          <div>
            <span class="section-index">02 / SUMMARY</span>
            <h2 id="dev-summary-title">培养摘要</h2>
          </div>
          <p>摘要由服务端统计，页面不做二次计算。</p>
        </div>
        <div class="summary-grid">
          <article
            v-for="card in summaryCards"
            :key="card.key"
            class="summary-card"
            :data-testid="'dev-profile-summary-' + card.key"
          >
            <span class="summary-label">{{ card.label }}</span>
            <strong class="summary-value">{{ card.value }}</strong>
            <span class="summary-note">{{ card.note }}</span>
          </article>
        </div>
      </section>

      <section class="surface content-card" aria-labelledby="dev-mentors-title" data-testid="dev-profile-mentors">
        <div class="section-heading">
          <div>
            <span class="section-index">03 / MENTORS</span>
            <h2 id="dev-mentors-title">培养联系人</h2>
          </div>
          <div class="heading-tools">
            <p>联系人为当前生效关系，不是历史快照；换人后此处随之更新。</p>
            <el-button
              v-if="canView && profile"
              type="primary"
              plain
              :disabled="mentors.length >= MAX_MENTORS"
              data-testid="mentor-assign-open"
              @click="openMentorDialog"
            >
              指派培养联系人
            </el-button>
          </div>
        </div>
        <el-empty v-if="mentors.length === 0" description="尚未设置培养联系人" :image-size="64" />
        <template v-else>
          <!-- 已达上限：入口置灰 + 说明；列表本身不得因此消失（仍需能够移除）。 -->
          <p v-if="mentors.length >= MAX_MENTORS" class="limit-hint" data-testid="mentor-limit-hint">
            已达上限：每位成员最多设置 {{ MAX_MENTORS }} 名培养联系人，需先移除一名才能指派新的联系人。
          </p>
          <ul class="list-rows">
            <li
              v-for="mentor in pagedSlice('mentors', mentors)"
              :key="mentor.mentorId"
              class="row-card row-with-action"
            >
              <div class="row-main">
                <span class="row-title">{{
                  (mentor.realName ?? "").trim() || (mentor.username ?? "").trim() || "姓名未知"
                }}</span>
                <span class="row-meta">联系人编号 {{ relationLabel(mentor.mentorId) }}</span>
              </div>
              <el-button
                v-if="canView && profile"
                text
                type="danger"
                :loading="busyMentorId === mentor.mentorId"
                :data-testid="'mentor-remove-' + mentor.mentorId"
                @click="
                  removeMentor(
                    mentor.mentorId,
                    (mentor.realName ?? '').trim() || (mentor.username ?? '').trim() || '姓名未知',
                  )
                "
              >
                移除
              </el-button>
            </li>
          </ul>
          <LocalPager v-model:page="pages.mentors" :total="mentors.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="dev-identity-title" data-testid="dev-profile-identity">
        <div class="section-heading">
          <div>
            <span class="section-index">04 / IDENTITY</span>
            <h2 id="dev-identity-title">身份变更历史</h2>
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

      <section class="surface content-card" aria-labelledby="dev-reports-title" data-testid="dev-profile-reports">
        <div class="section-heading">
          <div>
            <span class="section-index">05 / REPORTS</span>
            <h2 id="dev-reports-title">思想汇报</h2>
          </div>
          <p>正文按纯文本渲染；附件保存在服务端内部，本页不展示其路径，也不提供下载。</p>
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

      <section class="surface content-card" aria-labelledby="dev-signs-title" data-testid="dev-profile-signs">
        <div class="section-heading">
          <div>
            <span class="section-index">06 / SIGNS</span>
            <h2 id="dev-signs-title">活动签到</h2>
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
                <span class="row-meta">成员编号 {{ memberIdLabel(record.userId) }}</span>
                <p v-if="signRemarkText(record.device, record.remark)" class="row-text">
                  {{ signRemarkText(record.device, record.remark) }}
                </p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.signRecords" :total="signRecords.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="dev-leaves-title" data-testid="dev-profile-leaves">
        <div class="section-heading">
          <div>
            <span class="section-index">07 / LEAVES</span>
            <h2 id="dev-leaves-title">请假记录</h2>
          </div>
          <p>仅列出服务端判定为生效的请假；请假与签到分开统计，不互相抵扣。</p>
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
                <span class="row-meta">登记人编号 {{ relationLabel(leave.operatorId) }}</span>
                <p class="row-text">请假原因：{{ formatOptionalText(leave.reason) }}</p>
              </div>
            </li>
          </ul>
          <LocalPager v-model:page="pages.leaves" :total="leaves.length" :page-size="PAGE_SIZE" />
        </template>
      </section>

      <section class="surface content-card" aria-labelledby="dev-studies-title" data-testid="dev-profile-studies">
        <div class="section-heading">
          <div>
            <span class="section-index">08 / STUDIES</span>
            <h2 id="dev-studies-title">学习记录</h2>
          </div>
          <p>学时按记录时长统计，成绩原样展示；证书文件保存在服务端内部，本页不展示其路径，也不提供跳转。</p>
        </div>
        <el-empty v-if="studyRecords.length === 0" description="暂无学习记录" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="record in pagedSlice('studyRecords', studyRecords)" :key="record.id" class="row-card">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">课程编号 {{ relationLabel(record.courseId) }}</span>
                  <el-tag type="info" size="small" effect="plain">
                    学时 {{ formatStudyDuration(record.studyTime) }}
                  </el-tag>
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

      <section class="surface content-card" aria-labelledby="dev-materials-title" data-testid="dev-profile-materials">
        <div class="section-heading">
          <div>
            <span class="section-index">09 / MATERIALS</span>
            <h2 id="dev-materials-title">培养材料</h2>
          </div>
          <div class="heading-tools">
            <p>材料文件保存在服务端内部，本页只展示材料信息，不提供下载或预览。</p>
            <el-button
              v-if="canView && profile"
              type="primary"
              plain
              data-testid="material-upload-open"
              @click="openMaterialDialog"
            >
              上传培养材料
            </el-button>
          </div>
        </div>
        <el-empty v-if="materials.length === 0" description="暂无培养材料" :image-size="64" />
        <template v-else>
          <ul class="list-rows">
            <li v-for="item in pagedSlice('materials', materials)" :key="item.id" class="row-card row-with-action">
              <div class="row-main">
                <div class="row-line">
                  <span class="row-title">{{ (item.fileName ?? "").trim() || "未命名文件" }}</span>
                  <el-tag type="info" size="small" effect="plain">
                    {{ (item.materialType ?? "").trim() || "未标注类型" }}
                  </el-tag>
                </div>
                <span class="row-meta">上传时间 {{ formatRecordTime(item.createTime) }}</span>
                <span class="row-meta">上传人编号 {{ relationLabel(item.uploaderId) }}</span>
                <p v-if="(item.remark ?? '').trim()" class="row-text">备注：{{ item.remark }}</p>
                <p v-if="(item.file ?? '').trim()" class="row-meta">材料文件保存在服务端内部，需查看请联系支部管理员</p>
              </div>
              <el-button
                v-if="canView && profile"
                text
                type="danger"
                :loading="busyMaterialId === item.id"
                :data-testid="'material-remove-' + item.id"
                @click="removeMaterial(item.id, (item.fileName ?? '').trim() || '未命名文件')"
              >
                删除
              </el-button>
            </li>
          </ul>
          <LocalPager v-model:page="pages.materials" :total="materials.length" :page-size="PAGE_SIZE" />
        </template>
      </section>
    </template>

    <el-empty
      v-else-if="canView"
      class="state-card content-card"
      data-testid="dev-profile-missing"
      description="暂未获取到该成员培养档案"
      :image-size="72"
    >
      <el-button type="primary" plain data-testid="dev-profile-retry" @click="retry">重新加载</el-button>
    </el-empty>
    <!-- 发起身份变更：只生成待审批单，不修改档案也不本地改写身份名。 -->
    <IdentityChangeDialog
      v-if="canView && profile && basic"
      v-model:visible="identityDialogVisible"
      :user-id="userId"
      :member-name="memberName"
      :current-identity-id="basic.identityId"
      :current-identity-name="basic.identityName"
      @submitted="onIdentityChangeSubmitted"
    />
    <!-- 03 培养联系人：指派成功后重新读取档案，不做本地数组改写。 -->
    <MentorAssignDialog
      v-if="canView && profile"
      v-model:visible="mentorDialogVisible"
      :user-id="userId"
      :member-name="memberName"
      :mentors="mentors"
      @assigned="refreshProfile"
    />
    <!-- 09 培养材料：先上传后登记，登记成功后重新读取档案。 -->
    <MaterialUploadDialog
      v-if="canView && profile"
      v-model:visible="materialDialogVisible"
      :user-id="userId"
      :member-name="memberName"
      @registered="refreshProfile"
    />
  </main>
</template>

<style lang="scss" scoped>
.dev-profile {
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

  .heading-main {
    min-width: 0;
  }

  .back-link {
    font-size: 13px;
    color: var(--party-red);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .back-link:hover {
    text-decoration: underline;
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

  .heading-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
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

  .heading-tools {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    min-width: 0;
  }
}

/* 行内操作按钮靠右，窄屏时回到上一行。 */
.row-with-action {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* 已达联系人上限时的说明，与入口按钮置灰配套。 */
.limit-hint {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
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
  .dev-profile {
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
