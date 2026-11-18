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
import { pageIdentityMembers, type IdentityMemberFilters, type UserVo } from "@/api/members";
import { assignMemberMentor, type MentorView } from "@/api/cultivation-contacts";

/**
 * 指派培养联系人（档案页 03 区块的写入口）。
 *
 * 候选成员来自真实分页端点 `GET /v4/members/page`（超管全院、支委本支部，范围由服务端裁决），
 * 不提供手输编号：手输等于让用户填一个没有来源的 `mentorId`。
 *
 * 资格判定全部在服务端（`MentorServiceImpl.assign`），前端不加严也不放宽：
 * - 最多 2 名在职联系人 → 「每位成员最多设置 2 名培养联系人」
 * - 须为党员（`tb_identity.level >= 5`）→ 未登记身份与身份不足是两条不同原文
 * - 不能指定本人 → 「不能指定本人为培养联系人」
 * - 重复指派幂等（200），不报错
 * 分页响应只带 `identityId`（`buildVos` 不填 `identityName`，也不返回 `level`），
 * 因此界面只能提示「尚未登记政治身份」这种确定缺口，**不得**声称已校验党员身份。
 */
const props = defineProps<{
  /** 被培养人编号，来自档案页路由参数。 */
  userId: number;
  /** 被培养人姓名，仅用于文案。 */
  memberName: string;
  /** 档案里的当前联系人：用于提示已满 2 名，不做本地改写。 */
  mentors: MentorView[];
}>();

const emit = defineEmits<{ assigned: [] }>();

const visible = defineModel<boolean>("visible", { required: true });

const CANDIDATE_PAGE_SIZE = 20;
/** 与后端 `MentorServiceImpl.MAX_MENTORS` 一致，仅用于提示，不用于拦截提交。 */
const MAX_MENTORS = 2;

const keyword = ref("");
const options = ref<UserVo[]>([]);
const candidateState = ref<"idle" | "loading" | "ready" | "error">("idle");
const selectedId = ref<number | null>(null);
const submitting = ref(false);
const submitError = ref("");

const canSubmit = computed(() => sessionHasAccessToken.value && !submitting.value);

const selected = computed(() => options.value.find((item) => item.id === selectedId.value) ?? null);

const full = computed(() => props.mentors.length >= MAX_MENTORS);
const assignedIds = computed(() => new Set(props.mentors.map((mentor) => mentor.mentorId)));

let disposed = false;
let sequence = 0;

function sessionOk(snapshot: SessionIdentitySnapshot): boolean {
  return !disposed && visible.value && isSessionIdentityCurrent(snapshot);
}

function cancelInFlight(): void {
  sequence++;
}

function memberLabel(member: UserVo): string {
  return member.realName?.trim() || member.username?.trim() || `成员 #${member.id}`;
}

/** 只在服务端确实没给 `identityId` 时提示；不给 `level` 就不猜党员身份。 */
function candidateNote(member: UserVo): string {
  if (member.id === props.userId) return "本人，不能作为培养联系人";
  if (assignedIds.value.has(member.id)) return "已是当前培养联系人";
  if (member.identityId == null) return "尚未登记政治身份，服务端会拒绝指派";
  return "政治身份是否达到党员由服务端校验";
}

/** 候选查询：与档案列表同形（`status` 必传，`keyword` 可选），不另建一套分页封装。 */
interface CandidateQuery extends IdentityMemberFilters {
  page: number;
  size: number;
  keyword?: string;
}

async function loadCandidates(search: string): Promise<void> {
  if (!visible.value || disposed) return;
  const snapshot = captureSessionIdentity();
  const current = ++sequence;
  keyword.value = search;
  candidateState.value = "loading";
  const query: CandidateQuery = { page: 1, size: CANDIDATE_PAGE_SIZE, status: 1 };
  const trimmed = search.trim();
  if (trimmed) query.keyword = trimmed;
  try {
    const result = await pageIdentityMembers(query);
    if (current !== sequence || !sessionOk(snapshot)) return;
    options.value = Array.isArray(result?.records) ? result.records : [];
    candidateState.value = options.value.length ? "ready" : "idle";
  } catch {
    if (current !== sequence || !sessionOk(snapshot)) return;
    options.value = [];
    candidateState.value = "error";
  }
}

function reset(): void {
  keyword.value = "";
  options.value = [];
  candidateState.value = "idle";
  selectedId.value = null;
  submitError.value = "";
  // 上一轮提交若因换号/换成员被序号拦住，`finally` 不会复位，这里无条件清除。
  submitting.value = false;
}

async function submit(): Promise<void> {
  // 同步置位：同一事件循环内的第二次点击直接被挡掉。
  if (submitting.value || !canSubmit.value) return;
  if (selectedId.value == null) {
    submitError.value = "请先检索并选择一名成员作为培养联系人";
    return;
  }
  submitting.value = true;
  submitError.value = "";
  const snapshot = captureSessionIdentity();
  const current = sequence;
  try {
    await assignMemberMentor(props.userId, selectedId.value);
    if (current !== sequence || !sessionOk(snapshot)) return;
    ElMessage.success("培养联系人已指派，档案将重新读取");
    emit("assigned");
    visible.value = false;
  } catch (error) {
    if (current !== sequence || !sessionOk(snapshot)) return;
    // 原文照转达，并保留已选成员供修正后重试。
    submitError.value = getApiErrorMessage(error, "指派失败，请稍后重试");
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
    void loadCandidates("");
    return;
  }
  cancelInFlight();
});

watch(
  () => props.userId,
  () => {
    cancelInFlight();
    reset();
    if (visible.value) void loadCandidates("");
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
    title="指派培养联系人"
    width="min(520px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    append-to-body
    @closed="cancelInFlight"
  >
    <div class="member-summary">
      <div class="summary-item">
        <span class="summary-label">被培养人</span>
        <span class="summary-value">{{ memberName || "未登记姓名" }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">当前联系人</span>
        <el-tag :type="full ? 'warning' : 'info'" size="small" effect="plain" data-testid="mentor-assign-count">
          {{ mentors.length }} / {{ MAX_MENTORS }}
        </el-tag>
      </div>
    </div>

    <el-alert
      v-if="!sessionHasAccessToken"
      data-testid="mentor-assign-no-token"
      type="warning"
      :closable="false"
      show-icon
      title="指派培养联系人需要登录"
    >
      <template #default>
        <p>当前是开发预览身份，没有后端登录令牌，因此不能发出指派请求。</p>
      </template>
    </el-alert>

    <template v-else>
      <el-alert
        v-if="full"
        data-testid="mentor-assign-full"
        type="warning"
        :closable="false"
        show-icon
        title="已达 2 名培养联系人上限"
      >
        <template #default>
          <p>每位成员最多设置 2 名培养联系人。请先在档案中移除一名，再指派新的联系人。</p>
        </template>
      </el-alert>

      <el-alert
        v-if="candidateState === 'error'"
        data-testid="mentor-assign-candidate-error"
        type="error"
        :closable="false"
        show-icon
        title="成员候选加载失败"
      >
        <template #default>
          <p>候选成员来自成员分页接口，加载失败时不提供手输编号兜底。</p>
          <el-button
            size="small"
            type="primary"
            plain
            data-testid="mentor-assign-candidate-retry"
            @click="loadCandidates(keyword)"
          >
            重新加载候选成员
          </el-button>
        </template>
      </el-alert>

      <el-select
        v-model="selectedId"
        class="mentor-select"
        data-testid="mentor-assign-select"
        filterable
        remote
        :remote-method="loadCandidates"
        :loading="candidateState === 'loading'"
        :disabled="submitting"
        placeholder="输入姓名或学号检索成员"
        no-data-text="没有匹配的成员，请调整关键词"
      >
        <el-option v-for="member in options" :key="member.id" :label="memberLabel(member)" :value="member.id">
          <span>{{ memberLabel(member) }}</span>
          <span class="option-note">{{ candidateNote(member) }}</span>
        </el-option>
      </el-select>
      <p class="form-hint">
        候选来自成员分页接口（超管全院、支委本支部），不支持手输成员编号。选中的成员编号将作为培养联系人编号提交。
      </p>
      <p v-if="selected" class="form-hint" data-testid="mentor-assign-selected">
        已选择：{{ memberLabel(selected) }}（编号 {{ selected.id }}）。{{ candidateNote(selected) }}
      </p>

      <el-alert
        v-if="submitError"
        data-testid="mentor-assign-submit-error"
        type="error"
        :closable="false"
        show-icon
        :title="submitError"
      />

      <p class="form-hint">
        培养联系人须为党员（预备党员或正式党员）。是否满足党员身份、是否已达上限、是否为本人都由服务端判定，页面不预先拦截。
      </p>
    </template>

    <template #footer>
      <el-button :disabled="submitting" data-testid="mentor-assign-cancel" @click="close">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        data-testid="mentor-assign-submit"
        @click="submit"
      >
        指派
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

.mentor-select {
  width: 100%;
  margin-top: 16px;
}

.option-note {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.form-hint {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.el-alert + .el-alert {
  margin-top: 12px;
}
</style>
