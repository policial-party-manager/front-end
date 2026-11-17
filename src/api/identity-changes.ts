import { get, post } from "@/api/request";

/**
 * 政治身份变更单（后端 #44，两阶段流程）前端契约。
 *
 * 只读核对后端 `IdentityChangeController` / `IdentityChangeServiceImpl`，不修改后端：
 * - 发起 `POST /v4/identity-changes`：`hasAnyRole('SUPER_ADMIN','BRANCH_ADMIN')`；
 *   请求体只有 `userId`、`toIdentity`（= `tb_identity.id`）、`reason`（≤500，可空）。
 *   **`fromIdentity` 不在请求内**——服务端取目标用户当前 `identity_id` 快照，首次登记为 `null`；
 *   同一用户只允许一张待审批单（服务端校验，前端不得预判并静默禁用按钮）。
 * - 审批 `POST /v4/identity-changes/{id}/review`：**仅 `SUPER_ADMIN`**；
 *   `pass=true` 写回 `identity_id`，`false` 驳回不动现身份，`remark` ≤50；只有 `status=1` 可审。
 * - 列表 `GET /v4/identity-changes/managed/page`：超管走 `pageForAdmin`（`userId`/`status` 两个过滤都生效）；
 *   支委走 `pageForBranch`，**`userId`/`status` 参数被直接丢弃**，只返回本支部成员的变更单。
 *   因此支委视图不发送这两个参数，界面也不提供对应筛选。
 * - 详情 `GET /v4/identity-changes/{id}`：越权与真不存在同为「变更单不存在」，不泄露单据存在性。
 *
 * 边界（改动前必读）：
 * - 身份变更生效**不联动登录角色**：只写 `tb_user_detail.identity_id`，`role_id`、菜单与权限矩阵不变，
 *   前端不得据此修改 `currentRole`、导航或路由权限。
 * - 前端不得本地改写 `identityName` 伪造生效效果，档案身份必须来自重新请求。
 * - 身份字典复用 `src/api/members.ts` 的 `pageIdentities`（`GET /v2/content/identities/page`，登录可读，
 *   按 `level` 升序，只有 `page`/`size`，无 keyword 过滤），不另建第二份字典封装。
 * - `status` 1 待审批 / 2 已生效 / 3 驳回，与思想汇报的 1/2/3（待审阅/通过/驳回）语义不同，
 *   **绝不可共用同一映射**；展示统一用 `@/views/development/myDevelopmentDisplay` 的
 *   `identityChangeStatusLabel` / `identityChangeTagType`，未知值显示「未知状态（x）」。
 */

/** 变更单状态：1 待审批 / 2 已生效 / 3 驳回。 */
export type IdentityChangeStatus = 1 | 2 | 3;

/**
 * 变更单视图（后端 `IdentityChangeVo`）：姓名与身份名已内嵌，列表无需逐条补名。
 * `status` 放宽为 `number`，未知取值由展示层兜底，不用 `any`。
 */
export interface IdentityChangeVo {
  id: number;
  userId: number;
  userName: string | null;
  /** 变更前身份 id，首次登记为 null。 */
  fromIdentity: number | null;
  fromIdentityName: string | null;
  toIdentity: number | null;
  toIdentityName: string | null;
  operatorId: number | null;
  operatorName: string | null;
  reason: string | null;
  status: number | null;
  statusName: string | null;
  reviewerId: number | null;
  reviewerName: string | null;
  reviewTime: string | null;
  reviewRemark: string | null;
  createTime: string | null;
}

/** 发起请求：只有这三个字段，`fromIdentity` 由服务端快照。 */
export interface IdentityChangeApplyRequest {
  userId: number;
  toIdentity: number;
  reason?: string;
}

/** 审批请求：`pass` 必填，`remark` ≤50 可空。 */
export interface IdentityReviewRequest {
  pass: boolean;
  remark?: string;
}

/** 列表查询：`status`/`userId` 仅超管生效，支委调用时不要传。 */
export interface IdentityChangeQuery {
  page: number;
  size: number;
  userId?: number;
  status?: IdentityChangeStatus;
}

export interface IdentityChangePage {
  records: IdentityChangeVo[];
  total: number;
}

/** 原因与意见的前端上限，与后端 `@Size` 一致；超长在提交前拦截。 */
export const IDENTITY_CHANGE_REASON_MAX = 500;
export const IDENTITY_REVIEW_REMARK_MAX = 50;

/** 分页参数的宽松上限，避免把明显的异常值发给服务端。 */
const PAGE_LIMIT = 100000;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * 发起身份变更。
 *
 * 不带 `fromIdentity`：服务端按目标用户当前身份快照，前端自行传入会与真实快照冲突。
 * 「该用户已有待审批的身份变更单」等 400 由服务端裁决，调用方原样展示服务端原文。
 */
export function applyIdentityChange(payload: IdentityChangeApplyRequest): Promise<unknown> {
  if (!isPositiveInteger(payload?.userId)) return Promise.reject(new Error("成员编号不可用"));
  if (!isPositiveInteger(payload?.toIdentity)) return Promise.reject(new Error("目标身份编号不可用"));
  const body: IdentityChangeApplyRequest = {
    userId: payload.userId,
    toIdentity: payload.toIdentity,
    // 始终带 reason 键：空串由服务端 trim 成 null，请求体形状保持稳定。
    reason: typeof payload.reason === "string" ? payload.reason : "",
  };
  return post<unknown>("/v4/identity-changes", body);
}

/** 审批变更单（仅超管）。已处理单服务端返回「该变更单已处理，不能重复审批」。 */
export function reviewIdentityChange(id: number, payload: IdentityReviewRequest): Promise<unknown> {
  if (!isPositiveInteger(id)) return Promise.reject(new Error("变更单编号不可用"));
  if (typeof payload?.pass !== "boolean") return Promise.reject(new Error("请选择通过或驳回"));
  const body: IdentityReviewRequest = {
    pass: payload.pass,
    remark: typeof payload.remark === "string" ? payload.remark : "",
  };
  return post<unknown>(`/v4/identity-changes/${id}/review`, body);
}

/**
 * 我可管理的变更单分页。
 *
 * 超管（`pageForAdmin`）：`userId` 精确过滤生效，`status` 生效；
 * 支委（`pageForBranch`）：两个过滤参数被服务端丢弃，传了只会让界面以为在筛选——调用方不要传。
 */
export function pageManagedIdentityChanges(query: IdentityChangeQuery): Promise<IdentityChangePage> {
  if (!isPositiveInteger(query?.page) || query.page > PAGE_LIMIT) return Promise.reject(new Error("页码不可用"));
  if (!isPositiveInteger(query?.size) || query.size > PAGE_LIMIT) return Promise.reject(new Error("每页条数不可用"));
  const params: Record<string, number> = { page: query.page, size: query.size };
  if (query.userId != null) {
    if (!isPositiveInteger(query.userId)) return Promise.reject(new Error("成员编号不可用"));
    params.userId = query.userId;
  }
  if (query.status != null) {
    if (query.status !== 1 && query.status !== 2 && query.status !== 3)
      return Promise.reject(new Error("变更单状态不可用"));
    params.status = query.status;
  }
  return get<IdentityChangePage>("/v4/identity-changes/managed/page", params);
}

/** 变更单详情；越权与不存在同为服务端「变更单不存在」，调用方原样转达。 */
export function getIdentityChange(id: number): Promise<IdentityChangeVo | null> {
  if (!isPositiveInteger(id)) return Promise.reject(new Error("变更单编号不可用"));
  return get<IdentityChangeVo | null>(`/v4/identity-changes/${id}`);
}
