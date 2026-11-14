<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Download, Refresh, Search } from "@element-plus/icons-vue";
import { useAppStore } from "@/stores/app";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  captureSessionIdentity,
  isSessionIdentityCurrent,
  sessionHasAccessToken,
  sessionIdentity,
  type SessionIdentitySnapshot,
} from "@/utils/session";
import {
  exportActivitySigns,
  getScopedActivity,
  pageActivitySigns,
  pageActivitySignups,
  type ActivitySignup,
  type SignRecord,
} from "@/api/activity-participation";
import type { ActivityVo } from "@/api/activities";
import {
  formatOptionalText,
  formatRecordTime,
  memberIdLabel,
  signExtraText,
  signTypeLabel,
  signTypeTagType,
} from "./participationDisplay";

const route = useRoute();
const router = useRouter();
const store = useAppStore();

/** 与路由 meta 一致：只允许这两类角色进入管理侧参与页面。 */
const managerRoles = ["super_admin", "party_secretary"];
const canManage = computed(() => managerRoles.includes(store.currentRole) && sessionHasAccessToken.value);

/** 路由参数解析：只接受正安全整数，非整数/NaN/超范围一律视为无效编号。 */
const rawActivityId = computed(() => {
  const value = route.params.id;
  return Array.isArray(value) ? value[0] : (value ?? "");
});
const activityId = computed(() => {
  const text = String(rawActivityId.value).trim();
  if (!/^[1-9]\d*$/.test(text)) return 0;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : 0;
});
const idError = computed(() => (activityId.value ? "" : "活动编号无效，请从活动列表进入参与管理。"));

// ---------------- 权限预检 ----------------
const activity = ref<ActivityVo | null>(null);
const precheckLoading = ref(false);
const precheckError = ref("");
/** 预检通过（当前会话确认可管理该活动）后才允许名单与导出请求。 */
const precheckPassed = ref(false);
let precheckSequence = 0;

function invalidateAll(): void {
  precheckSequence++;
  signupState.sequence++;
  signState.sequence++;
  exportEpoch++;
}

function resetParticipation(): void {
  activity.value = null;
  precheckLoading.value = false;
  precheckError.value = "";
  precheckPassed.value = false;
  resetSignupList();
  resetSignList();
  signupTabLoaded.value = false;
  signTabLoaded.value = false;
  exporting.value = false;
  exportError.value = "";
}

function sessionValid(snapshot: SessionIdentitySnapshot): boolean {
  return canManage.value && isSessionIdentityCurrent(snapshot);
}

async function loadPrecheck(): Promise<void> {
  const id = activityId.value;
  const sequence = ++precheckSequence;
  // 任何活动切换都先让旧数据整体失效，避免旧活动信息残留成“当前活动”。
  resetParticipation();
  if (!id) return;
  if (!canManage.value) {
    precheckError.value = sessionHasAccessToken.value
      ? "当前身份无权管理活动参与记录。"
      : "开发预览身份没有真实登录令牌，无法读取参与记录。请使用管理员账号登录后再访问。";
    return;
  }
  const snapshot = captureSessionIdentity();
  precheckLoading.value = true;
  try {
    const value = await getScopedActivity(id);
    if (sequence !== precheckSequence || !sessionValid(snapshot) || activityId.value !== id) return;
    if (!value || typeof value.id !== "number" || value.id !== id) {
      precheckError.value = "服务端返回的活动与当前页面不一致，已停止读取名单。";
      return;
    }
    activity.value = value;
    precheckPassed.value = true;
    if (activeTab.value === "signup") void loadSignups();
    else void loadSigns();
  } catch (error) {
    if (sequence !== precheckSequence || !sessionValid(snapshot) || activityId.value !== id) return;
    // 跨支部与真不存在同文案，页面只转达服务端结论，不推断活动是否存在。
    precheckError.value = getApiErrorMessage(error, "无法确认当前账号对该活动的管理范围。");
  } finally {
    if (sequence === precheckSequence) precheckLoading.value = false;
  }
}

// ---------------- 名单列表（报名 / 签到各一套独立状态） ----------------
type ListTab = "signup" | "sign";
const pageSizes = [10, 20, 50];

interface ListState<T> {
  draftUserId: string;
  appliedUserId: number | undefined;
  page: number;
  size: number;
  records: T[];
  total: number;
  loading: boolean;
  error: string;
  loaded: boolean;
  sequence: number;
}

function createListState<T>(): ListState<T> {
  return {
    draftUserId: "",
    appliedUserId: undefined,
    page: 1,
    size: 10,
    records: [],
    total: 0,
    loading: false,
    error: "",
    loaded: false,
    sequence: 0,
  };
}

const signupState = reactive(createListState<ActivitySignup>());
const signState = reactive(createListState<SignRecord>());
const activeTab = ref<ListTab>("signup");
const activeState = computed<ListState<ActivitySignup> | ListState<SignRecord>>(() =>
  activeTab.value === "signup" ? signupState : signState,
);

function resetSignupList(): void {
  signupState.sequence++;
  Object.assign(signupState, createListState<ActivitySignup>());
}

function resetSignList(): void {
  signState.sequence++;
  Object.assign(signState, createListState<SignRecord>());
}

const signupTabLoaded = ref(false);
const signTabLoaded = ref(false);

/** 解析成员 ID 输入：空 → undefined；非正整数 → null 表示非法。 */
function parseUserId(raw: string): number | undefined | null {
  const text = raw.trim();
  if (!text) return undefined;
  if (!/^[1-9]\d*$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

interface ListController<T> {
  state: ListState<T>;
  errorPrefix: string;
  fetch: (
    id: number,
    params: { page: number; size: number; userId?: number },
  ) => Promise<{
    records: T[];
    total: number;
  }>;
  markLoaded: () => void;
}

const signupController: ListController<ActivitySignup> = {
  state: signupState,
  errorPrefix: "报名记录加载失败",
  fetch: (id, params) => pageActivitySignups(id, params),
  markLoaded: () => (signupTabLoaded.value = true),
};
const signController: ListController<SignRecord> = {
  state: signState,
  errorPrefix: "签到记录加载失败",
  fetch: (id, params) => pageActivitySigns(id, params),
  markLoaded: () => (signTabLoaded.value = true),
};

/** 统一加载流程：序号 + 会话 + 活动 + 预检 四重校验后才写回结果。 */
async function loadList<T>(controller: ListController<T>): Promise<void> {
  const state = controller.state;
  const id = activityId.value;
  const sequence = ++state.sequence;
  if (!id || !precheckPassed.value || !canManage.value) return;

  const snapshot = captureSessionIdentity();
  const params: { page: number; size: number; userId?: number } = { page: state.page, size: state.size };
  if (state.appliedUserId !== undefined) params.userId = state.appliedUserId;

  state.loading = true;
  state.error = "";
  const stillCurrent = () =>
    sequence === state.sequence && sessionValid(snapshot) && activityId.value === id && precheckPassed.value;

  try {
    const result = await controller.fetch(id, params);
    if (!stillCurrent()) return;
    const records = Array.isArray(result?.records) ? result.records : [];
    const total = Number(result?.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("服务端分页总数异常，已停止展示本页结果。");
    state.records = records;
    state.total = total;
    state.loaded = true;
    controller.markLoaded();
  } catch (error) {
    if (!stillCurrent()) return;
    // 失败时清空本数据流：不把旧页当作最新查询结果继续展示。
    state.records = [];
    state.total = 0;
    state.loaded = false;
    state.error = controller.errorPrefix + "：" + getApiErrorMessage(error, "请稍后重试");
  } finally {
    if (stillCurrent()) state.loading = false;
  }
}

function loadSignups(): Promise<void> {
  return loadList(signupController);
}

function loadSigns(): Promise<void> {
  return loadList(signController);
}

/** 只加载当前激活页签，未激活页签等首次切换时再请求。 */
function loadActive(): Promise<void> {
  return activeTab.value === "signup" ? loadSignups() : loadSigns();
}

function searchActive(): void {
  const state = activeState.value;
  const parsed = parseUserId(state.draftUserId);
  if (parsed === null) {
    state.error = "成员编号必须是正整数，已保留上一次查询条件。";
    return;
  }
  state.appliedUserId = parsed;
  state.page = 1;
  void loadActive();
}

function resetActiveFilters(): void {
  const state = activeState.value;
  state.draftUserId = "";
  state.appliedUserId = undefined;
  state.page = 1;
  void loadActive();
}

function refreshActive(): void {
  if (!precheckPassed.value) return;
  void loadActive();
}

function changePage(value: number): void {
  const state = activeState.value;
  state.page = value;
  void loadActive();
}

function changeSize(value: number): void {
  const state = activeState.value;
  state.size = value;
  state.page = 1;
  void loadActive();
}

function handleTabChange(): void {
  if (!precheckPassed.value) return;
  const loaded = activeTab.value === "signup" ? signupTabLoaded.value : signTabLoaded.value;
  // 懒加载：首次激活页签必须真实发起一次请求。
  if (!loaded) void loadActive();
}

// ---------------- 完整签到名单导出 ----------------
const exporting = ref(false);
const exportError = ref("");
let exportEpoch = 0;

function isZipHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** 下载失败时尽量转达服务端原因，但绝不把错误内容保存成 xlsx。 */
async function readBlobError(blob: Blob): Promise<string> {
  try {
    const text = await blob.text();
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    /* 非 JSON 错误页沿用调用方的文件类型提示。 */
  }
  return "";
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportSigns(): Promise<void> {
  // 同步置位，保证一次点击只出一份请求，双击也不会重复下载。
  if (exporting.value || !precheckPassed.value || !canManage.value) return;
  const id = activityId.value;
  if (!id) return;
  const epoch = ++exportEpoch;
  const snapshot = captureSessionIdentity();
  const stillCurrent = () => epoch === exportEpoch && sessionValid(snapshot) && activityId.value === id;
  exporting.value = true;
  exportError.value = "";
  try {
    // 导出端点不接受筛选参数：始终请求本活动的完整名单。
    const blob = await exportActivitySigns(id);
    if (!stillCurrent()) return;
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (!stillCurrent()) return;
    // xlsx 是 ZIP 容器；这里只校验文件头，不声称已验证工作簿内容。
    if (!isZipHeader(signature)) {
      const detail = await readBlobError(blob);
      throw new Error(detail || "服务端返回的内容不是 Excel 文件，未保存为 xlsx。");
    }
    saveBlob(blob, "signs-" + id + ".xlsx");
  } catch (error) {
    if (stillCurrent()) {
      exportError.value = "导出未完成：" + getApiErrorMessage(error, "请稍后重试，不要重复点击");
    }
  } finally {
    if (epoch === exportEpoch) exporting.value = false;
  }
}

// ---------------- 生命周期与会话隔离 ----------------
function goBack(): void {
  void router.push({ name: "ActivityDetail", params: { id: String(activityId.value || rawActivityId.value) } });
}

function onRoleOrSessionChanged(): void {
  // 退出、换号、角色变化：清空本页全部数据并使在途请求与下载失效。
  invalidateAll();
  resetParticipation();
  activeTab.value = "signup";
  if (!canManage.value) return;
  void loadPrecheck();
}

onMounted(() => void loadPrecheck());
// 活动编号变化（含同一页面内跳转到另一活动）时整体重来。
watch(activityId, () => {
  invalidateAll();
  resetParticipation();
  void loadPrecheck();
});
// 页签切换统一走这里：无论由用户点击还是程序重置触发，都只请求当前页签。
watch(activeTab, () => handleTabChange());
watch([() => store.currentRole, sessionIdentity], () => onRoleOrSessionChanged());
onBeforeUnmount(() => {
  invalidateAll();
  exporting.value = false;
});
</script>

<template>
  <main class="participation-page">
    <div class="participation-container">
      <button class="back-link" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回活动详情
      </button>

      <header class="page-head">
        <div>
          <p class="overline">活动参与管理</p>
          <h1>{{ activity?.title || "参与记录" }}</h1>
          <p class="subtitle">
            <template v-if="activity"> {{ activity.branchName || "校级活动" }} · 活动编号 {{ activity.id }} </template>
            <template v-else-if="precheckLoading">正在确认当前账号可管理的活动范围…</template>
            <template v-else>报名与签到记录均按服务端返回的真实数据展示。</template>
          </p>
        </div>
      </header>

      <el-alert v-if="idError" class="page-alert" :title="idError" type="error" show-icon :closable="false">
        <template #default>
          <el-button text type="primary" @click="router.push('/activity')">返回活动列表</el-button>
        </template>
      </el-alert>

      <el-alert
        v-else-if="!canManage"
        class="page-alert"
        :title="
          sessionHasAccessToken ? '当前身份无权管理活动参与记录' : '开发预览身份没有真实登录令牌，无法读取参与记录'
        "
        type="warning"
        show-icon
        :closable="false"
      >
        <template #default>
          <p>
            {{
              sessionHasAccessToken
                ? "参与名单仅对超级管理员与支部书记开放，普通成员请从活动详情查看公开信息。"
                : "请使用管理员账号登录后再访问参与管理；预览身份不会获得服务端授权。"
            }}
          </p>
          <el-button type="primary" @click="router.push('/login')">前往登录</el-button>
        </template>
      </el-alert>

      <el-alert
        v-else-if="precheckError"
        data-testid="precheck-error"
        class="page-alert"
        :title="precheckError"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <p>
            未获得该活动的管理范围，已停止请求报名、签到与导出。跨支部活动与不存在的活动使用同一提示，服务端不区分二者。
          </p>
          <div class="alert-actions">
            <el-button @click="loadPrecheck">重新确认权限</el-button>
            <el-button text type="primary" @click="router.push('/activity')">返回活动列表</el-button>
          </div>
        </template>
      </el-alert>

      <section
        v-else
        v-loading="precheckLoading"
        element-loading-text="正在确认活动管理范围…"
        class="participation-card"
      >
        <template v-if="precheckPassed">
          <section class="export-panel" aria-label="签到名单导出">
            <div class="export-copy">
              <strong>导出本活动完整签到名单</strong>
              <span>
                由服务端生成整份考勤名单（含签到时间与考勤状态），范围是本活动的全部记录，与当前页签的筛选和分页无关。
              </span>
            </div>
            <el-button
              type="primary"
              :icon="Download"
              data-testid="export-signs"
              :loading="exporting"
              :disabled="exporting"
              @click="exportSigns"
            >
              导出本活动完整签到名单
            </el-button>
          </section>
          <el-alert
            v-if="exportError"
            data-testid="export-error"
            class="page-alert"
            :title="exportError"
            type="error"
            show-icon
            :closable="false"
          />

          <el-tabs v-model="activeTab" class="participation-tabs">
            <el-tab-pane label="报名记录" name="signup">
              <div class="tab-toolbar">
                <div class="filters">
                  <el-input
                    v-model="signupState.draftUserId"
                    data-testid="signup-user-filter"
                    aria-label="报名成员编号"
                    placeholder="成员编号（可选）"
                    clearable
                    @keyup.enter="searchActive"
                  />
                  <el-button type="primary" :icon="Search" data-testid="signup-search" @click="searchActive"
                    >查询</el-button
                  >
                  <el-button data-testid="signup-reset" @click="resetActiveFilters">重置</el-button>
                  <el-button :icon="Refresh" data-testid="signup-refresh" @click="refreshActive">刷新当前页</el-button>
                </div>
                <span class="total-label" data-testid="signup-total">
                  {{ signupState.loaded ? `共 ${signupState.total} 条报名记录` : "尚未加载报名记录" }}
                </span>
              </div>
              <el-alert
                v-if="signupState.error"
                class="list-error"
                :title="signupState.error"
                type="error"
                show-icon
                :closable="false"
              >
                <template #default>
                  <el-button text type="primary" @click="loadSignups">重试</el-button>
                </template>
              </el-alert>
              <el-table
                v-loading="signupState.loading"
                :data="signupState.records"
                stripe
                class="participation-table"
                empty-text="暂无报名记录"
                data-testid="signup-table"
              >
                <el-table-column prop="id" label="记录编号" min-width="110" />
                <el-table-column label="成员编号" min-width="110">
                  <template #default="{ row }">{{ memberIdLabel(row.userId) }}</template>
                </el-table-column>
                <el-table-column label="报名时间" min-width="170">
                  <template #default="{ row }">{{ formatRecordTime(row.signupTime) }}</template>
                </el-table-column>
              </el-table>
              <el-pagination
                v-if="signupState.loaded && signupState.total"
                data-testid="signup-pagination"
                :current-page="signupState.page"
                :page-size="signupState.size"
                :total="signupState.total"
                :page-sizes="pageSizes"
                layout="total, sizes, prev, pager, next"
                class="pagination"
                @current-change="changePage"
                @size-change="changeSize"
              />
            </el-tab-pane>

            <el-tab-pane label="签到记录" name="sign">
              <div class="tab-toolbar">
                <div class="filters">
                  <el-input
                    v-model="signState.draftUserId"
                    data-testid="sign-user-filter"
                    aria-label="签到成员编号"
                    placeholder="成员编号（可选）"
                    clearable
                    @keyup.enter="searchActive"
                  />
                  <el-button type="primary" :icon="Search" data-testid="sign-search" @click="searchActive"
                    >查询</el-button
                  >
                  <el-button data-testid="sign-reset" @click="resetActiveFilters">重置</el-button>
                  <el-button :icon="Refresh" data-testid="sign-refresh" @click="refreshActive">刷新当前页</el-button>
                </div>
                <span class="total-label" data-testid="sign-total">
                  {{ signState.loaded ? `共 ${signState.total} 条签到记录` : "尚未加载签到记录" }}
                </span>
              </div>
              <el-alert
                v-if="signState.error"
                class="list-error"
                :title="signState.error"
                type="error"
                show-icon
                :closable="false"
              >
                <template #default>
                  <el-button text type="primary" @click="loadSigns">重试</el-button>
                </template>
              </el-alert>
              <el-table
                v-loading="signState.loading"
                :data="signState.records"
                stripe
                class="participation-table"
                empty-text="暂无签到记录"
                data-testid="sign-table"
              >
                <el-table-column prop="id" label="记录编号" min-width="110" />
                <el-table-column label="成员编号" min-width="110">
                  <template #default="{ row }">{{ memberIdLabel(row.userId) }}</template>
                </el-table-column>
                <el-table-column label="签到时间" min-width="170">
                  <template #default="{ row }">{{ formatRecordTime(row.signTime) }}</template>
                </el-table-column>
                <el-table-column label="签到类型" min-width="150">
                  <template #default="{ row }">
                    <el-tag :type="signTypeTagType(row.signType)" disable-transitions>
                      {{ signTypeLabel(row.signType) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="设备与备注" min-width="200">
                  <template #default="{ row }">{{ formatOptionalText(signExtraText(row)) }}</template>
                </el-table-column>
                <el-table-column label="签到地点（服务端原文）" min-width="180">
                  <template #default="{ row }">{{ formatOptionalText(row.location) }}</template>
                </el-table-column>
              </el-table>
              <el-pagination
                v-if="signState.loaded && signState.total"
                data-testid="sign-pagination"
                :current-page="signState.page"
                :page-size="signState.size"
                :total="signState.total"
                :page-sizes="pageSizes"
                layout="total, sizes, prev, pager, next"
                class="pagination"
                @current-change="changePage"
                @size-change="changeSize"
              />
            </el-tab-pane>
          </el-tabs>

          <p class="scope-note">
            页面仅展示服务端返回的报名与签到记录，不据此推算缺席、迟到或出勤率；完整考勤口径由导出的服务端文件负责。
          </p>
        </template>

        <div v-else-if="!precheckLoading && !precheckError" class="precheck-empty">
          <p>{{ idError || "缺少可用的活动编号。" }}</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.participation-page {
  min-height: 100%;
  padding: 30px 0 56px;
  color: #292c2d;
  background: radial-gradient(circle at 91% 1%, rgba(181, 139, 77, 0.075), transparent 22rem), #f4f2ec;
}

.participation-container {
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

.page-head {
  margin-bottom: 16px;
}

.overline {
  margin: 0 0 6px;
  color: #a9834e;
  font-size: 11px;
  letter-spacing: 0.14em;
}

.page-head h1 {
  margin: 0;
  color: #3d423e;
  font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
  font-size: clamp(21px, 3vw, 28px);
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.subtitle {
  margin: 8px 0 0;
  color: #8b8b83;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.page-alert {
  margin-bottom: 14px;
  border-radius: 8px;
}

.alert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.participation-card {
  min-height: 420px;
  padding: 20px 22px 24px;
  border: 1px solid var(--workspace-line);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 10px 30px rgba(46, 37, 27, 0.05);
}

.export-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 16px;
  border: 1px solid #e9e2d7;
  border-radius: 9px;
  background: #faf8f2;
}

.export-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.export-copy strong {
  color: #4b4d49;
  font-size: 15px;
}

.export-copy span {
  color: #898981;
  font-size: 12px;
  line-height: 1.7;
}

.participation-tabs {
  margin-top: 14px;
}

.tab-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.filters :deep(.el-input) {
  width: 190px;
}

.filters :deep(.el-button) {
  margin-left: 0;
}

.total-label {
  color: #8b8b83;
  font-size: 12px;
  white-space: nowrap;
}

.list-error {
  margin-bottom: 12px;
}

.participation-table {
  width: 100%;
}

.pagination {
  margin-top: 14px;
  justify-content: flex-end;
}

.scope-note {
  margin: 16px 0 0;
  color: #9a8b74;
  font-size: 12px;
  line-height: 1.7;
}

.precheck-empty {
  display: flex;
  min-height: 380px;
  align-items: center;
  justify-content: center;
  color: #93948e;
  font-size: 13px;
}

@media (max-width: 760px) {
  .participation-container {
    width: min(100% - 28px, 620px);
  }

  .participation-card {
    padding: 16px 14px 18px;
  }

  .export-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .export-panel :deep(.el-button) {
    width: 100%;
  }

  .filters :deep(.el-input) {
    width: 100%;
  }

  .tab-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .filters :deep(.el-button) {
    flex: 1 1 auto;
  }

  .pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
