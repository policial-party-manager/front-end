<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowDown, ArrowLeft, Delete, Edit } from "@element-plus/icons-vue";
import {
  deleteAdminActivity,
  getAdminActivity,
  getPublishedActivity,
  updateAdminActivityStatus,
  type ActivityStatus,
  type ActivityVo,
} from "@/api/activities";
import { getApiErrorMessage as getErrorMessage } from "@/utils/apiError";
import { useAppStore } from "@/stores/app";
import {
  activityStatusClass as statusClass,
  activityStatusLabel as statusLabel,
  activityStatusOptions as statusOptions,
} from "./activityStatus";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const isSuperAdmin = computed(() => store.currentRole === "super_admin");
const activityId = computed(() => Number(route.params.id));
const activity = ref<ActivityVo | null>(null);
const loading = ref(false);
const errorMessage = ref("");
const coverLoadFailed = ref(false);
const requestSequence = ref(0);
const coverUrl = computed(() => {
  const value = activity.value?.cover?.trim();
  return value && (/^https?:\/\//i.test(value) || value.startsWith("/")) ? value : "";
});

function formatDateTime(value: string | null | undefined): string {
  return value ? value.replace("T", " ").slice(0, 16) : "未设置";
}

function statusActions(): { value: ActivityStatus; label: string }[] {
  return statusOptions.filter((option) => option.value !== activity.value?.status);
}

async function loadActivity(): Promise<void> {
  if (!Number.isFinite(activityId.value) || activityId.value <= 0) {
    errorMessage.value = "活动编号无效。";
    activity.value = null;
    return;
  }

  const sequence = ++requestSequence.value;
  loading.value = true;
  errorMessage.value = "";
  coverLoadFailed.value = false;
  try {
    const result = isSuperAdmin.value
      ? await getAdminActivity(activityId.value)
      : await getPublishedActivity(activityId.value);
    if (sequence === requestSequence.value) activity.value = result;
  } catch (error) {
    if (sequence === requestSequence.value) {
      activity.value = null;
      errorMessage.value = getErrorMessage(error);
    }
  } finally {
    if (sequence === requestSequence.value) loading.value = false;
  }
}

async function handleStatusCommand(command: string | number): Promise<void> {
  if (!activity.value) return;
  const nextStatus = Number(command) as ActivityStatus;
  const nextLabel = statusLabel(nextStatus);
  try {
    await ElMessageBox.confirm("确认将《" + activity.value.title + "》调整为“" + nextLabel + "”吗？", "调整活动状态", {
      confirmButtonText: "确认调整",
      cancelButtonText: "取消",
      type: "warning",
    });
    await updateAdminActivityStatus(activity.value.id, nextStatus);
    ElMessage.success("活动状态已更新");
    await loadActivity();
  } catch (error) {
    if (error !== "cancel" && error !== "close") errorMessage.value = getErrorMessage(error);
  }
}

async function removeActivity(): Promise<void> {
  if (!activity.value) return;
  try {
    await ElMessageBox.confirm("删除后无法恢复，确认删除《" + activity.value.title + "》吗？", "删除活动", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning",
    });
    await deleteAdminActivity(activity.value.id);
    ElMessage.success("活动已删除");
    await router.push("/activity");
  } catch (error) {
    if (error !== "cancel" && error !== "close") errorMessage.value = getErrorMessage(error);
  }
}

function goBack(): void {
  void router.push("/activity");
}

function goToEdit(): void {
  if (activity.value) void router.push("/activity/edit/" + activity.value.id);
}

onMounted(() => void loadActivity());
watch([activityId, isSuperAdmin], () => void loadActivity());
</script>

<template>
  <main class="activity-detail-page">
    <div class="detail-container">
      <button class="back-link" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回活动列表
      </button>

      <el-alert
        v-if="errorMessage"
        class="detail-error"
        :title="errorMessage"
        description="请检查登录状态与访问权限，或确认活动仍然存在。"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <el-button text type="primary" @click="loadActivity">重新加载</el-button>
        </template>
      </el-alert>

      <section v-loading="loading" class="detail-card" element-loading-text="正在读取活动详情…">
        <template v-if="activity">
          <header class="detail-hero">
            <div class="hero-topline">
              <div class="hero-kicker"><span></span> 活动记录 / {{ String(activity.id).padStart(4, "0") }}</div>
              <span v-if="isSuperAdmin" class="status-pill" :class="statusClass(activity.status)">
                <i></i>{{ statusLabel(activity.status) }}
              </span>
            </div>
            <div class="hero-content">
              <div class="hero-copy">
                <div class="type-overline">{{ activity.typeName || "党建活动" }}</div>
                <h1>{{ activity.title }}</h1>
                <p>{{ activity.branchName || "校级活动" }} <span>·</span> {{ formatDateTime(activity.startTime) }}</p>
              </div>
              <div v-if="activity.cover" class="hero-cover">
                <img
                  v-if="coverUrl && !coverLoadFailed"
                  class="activity-cover-hero"
                  :src="coverUrl"
                  :alt="activity.title + '封面'"
                  @error="coverLoadFailed = true"
                />
                <div v-else class="cover-unavailable-hero" role="img" aria-label="活动封面无法显示">
                  <strong>封面暂无法显示</strong>
                  <small>请检查封面地址是否可公开访问</small>
                </div>
                <span class="hero-cover-caption">活动封面</span>
              </div>
              <div v-else class="hero-seal" aria-hidden="true">党</div>
            </div>
          </header>

          <el-alert
            v-if="isSuperAdmin"
            class="status-assumption"
            title="状态约定：已发布对应后端状态 1；未发布（0）与已下线（2）的名称按原型约定呈现。"
            type="info"
            :closable="false"
            show-icon
          />

          <div class="detail-body">
            <section class="description-section">
              <div class="section-label"><span>01</span> 活动简介</div>
              <p class="description-copy">{{ activity.description || "暂无活动简介。" }}</p>
            </section>

            <section class="facts-grid" aria-label="活动信息">
              <article class="fact-card fact-highlight">
                <span class="fact-label">活动时间</span>
                <strong>{{ formatDateTime(activity.startTime) }}</strong>
                <small>至 {{ formatDateTime(activity.endTime) }}</small>
              </article>
              <article class="fact-card">
                <span class="fact-label">地点说明</span>
                <strong>{{
                  activity.locationDescription || (activity.location ? "已配置地理范围" : "线上活动")
                }}</strong>
                <small>{{ activity.location ? "已保存地理范围" : "未配置线下地理范围" }}</small>
              </article>
              <article class="fact-card">
                <span class="fact-label">人数上限</span>
                <strong>{{ activity.maxParticipants ?? "不限" }}</strong>
                <small>人</small>
              </article>
              <article class="fact-card">
                <span class="fact-label">活动类型</span>
                <strong>{{ activity.typeName || "未分类" }}</strong>
                <small>{{ activity.branchName || "校级活动" }}</small>
              </article>
            </section>

            <section class="schedule-section">
              <div class="section-label"><span>02</span> 时间安排</div>
              <div class="schedule-row">
                <span>活动开始</span><strong>{{ formatDateTime(activity.startTime) }}</strong>
              </div>
              <div class="schedule-row">
                <span>活动结束</span><strong>{{ formatDateTime(activity.endTime) }}</strong>
              </div>
              <div class="schedule-row">
                <span>签到时间配置</span>
                <strong>{{ formatDateTime(activity.signStart) }} — {{ formatDateTime(activity.signEnd) }}</strong>
              </div>
              <p class="schedule-note">页面仅展示服务端保存的签到时间配置，不提供报名、签到、二维码或签到记录操作。</p>
            </section>

            <section v-if="isSuperAdmin" class="detail-actions-panel" aria-label="活动管理操作">
              <div class="actions-copy">
                <strong>活动管理</strong>
                <span>编辑活动内容或调整发布状态</span>
              </div>
              <div class="detail-action-buttons">
                <el-button :icon="Edit" @click="goToEdit">编辑活动</el-button>
                <el-dropdown @command="handleStatusCommand">
                  <el-button type="primary">
                    调整状态<el-icon class="dropdown-icon"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-for="option in statusActions()" :key="option.value" :command="option.value">
                        {{ option.label }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button type="danger" plain :icon="Delete" @click="removeActivity">删除活动</el-button>
              </div>
            </section>

            <footer class="detail-footer">
              <span>创建于 {{ formatDateTime(activity.createTime) }}</span>
              <span v-if="activity.updateTime">最近更新 {{ formatDateTime(activity.updateTime) }}</span>
            </footer>
          </div>
        </template>

        <div v-else-if="!loading && !errorMessage" class="detail-empty">
          <div class="empty-mark">活</div>
          <h2>活动记录不存在</h2>
          <p>该活动可能已被删除，或当前身份无法查看。</p>
          <el-button type="primary" plain @click="goBack">返回活动列表</el-button>
        </div>
      </section>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.activity-detail-page {
  min-height: 100%;
  padding: 30px 0 56px;
  color: #292c2d;
  background: radial-gradient(circle at 91% 1%, rgba(181, 139, 77, 0.075), transparent 22rem), #f4f2ec;
}

.detail-container {
  width: min(1080px, calc(100% - 56px));
  margin: 0 auto;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
  padding: 0;
  border: 0;
  color: #827e74;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--party-red);
}

.detail-error,
.status-assumption {
  margin-bottom: 14px;
  border-radius: 8px;
}

.detail-card {
  min-height: 500px;
  overflow: hidden;
  border: 1px solid var(--workspace-line);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 10px 30px rgba(46, 37, 27, 0.05);
}

.detail-hero {
  position: relative;
  overflow: hidden;
  padding: 19px 34px 18px;
  color: #fff8ef;
  background:
    radial-gradient(circle at 85% 8%, rgba(226, 181, 119, 0.17), transparent 16rem),
    linear-gradient(117deg, var(--workspace-red-deep), var(--party-red) 67%, var(--party-red-dark));
}

.hero-topline,
.hero-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.hero-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 244, 227, 0.73);
  font-size: 10px;
  letter-spacing: 0.11em;
}

.hero-kicker span {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #d2ad72;
  transform: rotate(45deg);
}

.hero-content {
  align-items: center;
  margin-top: 15px;
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.type-overline {
  margin-bottom: 8px;
  color: #e4c994;
  font-size: 12px;
  letter-spacing: 0.08em;
}

.hero-content h1 {
  max-width: 720px;
  color: #fffaf1;
  font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
  font-size: clamp(24px, 3.4vw, 34px);
  font-weight: 600;
  letter-spacing: 0.025em;
  line-height: 1.45;
}

.hero-content p {
  margin-top: 11px;
  color: rgba(255, 244, 227, 0.73);
  font-size: 13px;
}

.hero-content p span {
  margin: 0 6px;
  color: #d0ae79;
}

.hero-seal {
  display: grid;
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  place-items: center;
  border: 1px solid rgba(244, 218, 177, 0.35);
  border-radius: 50%;
  color: rgba(244, 218, 177, 0.76);
  box-shadow: inset 0 0 0 4px rgba(244, 218, 177, 0.08);
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 27px;
}

.hero-cover {
  display: flex;
  width: 260px;
  max-width: 32%;
  flex: 0 0 260px;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.activity-cover-hero {
  display: block;
  width: 100%;
  height: 126px;
  border: 1px solid rgba(255, 246, 230, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  object-fit: contain;
}

.hero-cover-caption {
  color: rgba(255, 244, 227, 0.68);
  font-size: 12px;
  text-align: right;
}

.cover-unavailable-hero {
  display: flex;
  height: 126px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(255, 246, 230, 0.28);
  border-radius: 8px;
  color: #fff8ef;
  background: rgba(255, 255, 255, 0.08);
  text-align: center;
}

.cover-unavailable-hero strong {
  font-size: 13px;
  font-weight: 500;
}

.cover-unavailable-hero small {
  color: rgba(255, 244, 227, 0.68);
  font-size: 12px;
}

.dropdown-icon {
  margin-left: 4px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}

.status-pill i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.is-published {
  color: #e4f1e3;
  background: rgba(68, 118, 79, 0.35);
}

.is-draft {
  color: #fae7bd;
  background: rgba(163, 124, 57, 0.33);
}

.is-offline {
  color: #eee9df;
  background: rgba(97, 93, 84, 0.42);
}

.detail-body {
  padding: 27px 34px 19px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #424642;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 18px;
  font-weight: 600;
}

.section-label span {
  color: #b18b53;
  font-family: var(--font-family);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.description-copy {
  max-width: 850px;
  margin: 13px 0 0 27px;
  color: #696d69;
  font-size: 16px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.facts-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 25px;
  border: 1px solid var(--workspace-line);
  border-radius: 9px;
  background: #fbfaf6;
}

.fact-card {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  justify-content: center;
  padding: 17px 18px;
  border-right: 1px solid var(--workspace-line);
}

.fact-card:last-child {
  border-right: 0;
}

.fact-label {
  color: #99968e;
  font-size: 13px;
  letter-spacing: 0.05em;
}

.fact-card strong {
  margin-top: 7px;
  overflow-wrap: anywhere;
  color: #414541;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.fact-card small {
  margin-top: 3px;
  color: #999990;
  font-size: 13px;
}

.fact-highlight strong {
  color: var(--party-red);
}

.schedule-section {
  margin-top: 28px;
  padding-bottom: 7px;
}

.schedule-row {
  display: grid;
  grid-template-columns: minmax(110px, 0.5fr) 1.5fr;
  gap: 15px;
  padding: 12px 0;
  border-bottom: 1px solid #f0ede6;
  font-size: 14px;
}

.schedule-row:first-of-type {
  margin-top: 9px;
}

.schedule-row span {
  color: #99968e;
}

.schedule-row strong {
  color: #565b57;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.schedule-note {
  margin-top: 9px;
  color: #9a8b74;
  font-size: 13px;
}

.detail-actions-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 22px;
  padding: 17px 18px;
  border: 1px solid #e9e2d7;
  border-radius: 9px;
  background: #faf8f2;
}

.actions-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.actions-copy strong {
  color: #4b4d49;
  font-size: 16px;
}

.actions-copy span {
  color: #898981;
  font-size: 14px;
}

.detail-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-action-buttons :deep(.el-button) {
  min-height: 36px;
  margin-left: 0;
  border-radius: 6px;
}

.detail-action-buttons :deep(.el-button--primary) {
  border-color: var(--party-red);
  background: var(--party-red);
}

.detail-footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  margin-top: 21px;
  padding-top: 12px;
  border-top: 1px solid #efede7;
  color: #a09f98;
  font-size: 11px;
}

.detail-empty {
  display: flex;
  min-height: 480px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid #e9dfd1;
  border-radius: 50%;
  color: #a9834e;
  background: #faf6ee;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 19px;
}

.detail-empty h2 {
  margin-top: 13px;
  color: #454946;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 18px;
}

.detail-empty p {
  margin: 5px 0 15px;
  color: #93948e;
  font-size: 12px;
}

@media (max-width: 760px) {
  .detail-container {
    width: min(100% - 28px, 620px);
  }

  .detail-hero {
    padding: 17px 21px;
  }

  .detail-body {
    padding: 23px 21px 17px;
  }

  .facts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fact-card:nth-child(2) {
    border-right: 0;
  }

  .fact-card:nth-child(n + 3) {
    border-top: 1px solid var(--workspace-line);
  }

  .hero-seal {
    width: 49px;
    height: 49px;
    flex-basis: 49px;
    font-size: 21px;
  }

  .hero-content {
    align-items: stretch;
    flex-direction: column;
    margin-top: 13px;
  }

  .hero-cover {
    width: min(100%, 420px);
    max-width: 100%;
    flex-basis: auto;
  }
}

@media (max-width: 520px) {
  .hero-content h1 {
    font-size: 23px;
  }

  .hero-seal {
    display: none;
  }

  .detail-actions-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .detail-action-buttons {
    width: 100%;
  }

  .schedule-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .detail-footer {
    flex-direction: column;
  }
}
</style>
