import { get } from "@/api/request";

/**
 * 数据统计：按维度切分的政治身份分布（后端 #81 / #68-L9）。
 *
 * 对应后端 `GET /api/v4/statistics/distribution` → `Result<DistributionVo>`。
 *
 * 契约要点（已逐行核对后端 DashboardServiceImpl.distribution）：
 * - `dimension` 支持 college / major / className / grade / branch，缺省或非法值一律回退 college。
 *   控制器 Swagger 注释漏写了 branch，但代码实现与 normalizeDimension 均已支持，以代码为准。
 * - `total` 是该维度分组下的**全部成员数**，包含政治身份未登记的人；`identities` 只遍历身份字典，
 *   没有「未登记」条目，因此各身份人数之和可能小于 `total`，这里既不补齐也不归一化。
 * - 统计未按成员启用/停用过滤，`total` 不等于「启用成员数」。
 * - 数据范围（全院 / 本支部）由服务端按登录态判定，前端不得传入任何范围参数。
 *
 * 同文件另含两个端点（#64）：
 * - `GET /api/v4/statistics/dashboard` → `DashboardVo`：待审阅思想汇报数、待审批身份变更数、
 *   各政治身份人数。无任何查询参数，范围同样由服务端 `resolveScope` 判定（超管全院、支委本支部）；
 *   支委未归属任何支部时服务端抛 `IllegalArgumentException`（HTTP 400
 *   「您尚未归属任何党支部，请联系管理员」），前端原样转达，不自行拦截也不发范围参数。
 *   它的 `identityDistribution` 与 `distribution` 的 `identities` 是**两套口径**，不可合并或互相换算：
 *   dashboard 由 `tb_user_detail` 按身份直接计数，并额外追加一行 `identityId=null` 的未登记成员；
 *   distribution 只遍历身份字典、不追加未登记行，因此各身份之和可能小于分组 `total`。
 *   两者都**未按成员启用/停用过滤**，都不能称为「启用成员数」。
 * - `GET /api/v4/user/study-records/mine/summary` → `StudySummaryVo`：只查**当前登录用户本人**的记录。
 *   `/statistics` 只对管理角色开放，因此该数据是管理员自己的学习汇总，不是被统计成员的数据。
 */

/** 某个身份在该分组中的人数；`identityId`/`identityName`/`level` 后端是包装类型，可能为空。 */
export interface IdentityCount {
  identityId: number | null;
  identityName: string | null;
  level: number | null;
  count: number;
}

/** 一个维度的分组结果；`key` 为维度取值，未填写时后端返回「未填写」。 */
export interface DistributionGroup {
  key: string;
  total: number;
  identities: IdentityCount[];
}

export interface DistributionVo {
  /** 服务端实际采用的维度，可能与请求值不同（非法值会静默回退 college）。 */
  dimension: string;
  groups: DistributionGroup[];
}

/** 页面可切换的维度取值；与后端 normalizeDimension 支持的枚举一一对应。 */
export const DISTRIBUTION_DIMENSIONS = ["college", "major", "className", "grade", "branch"] as const;
export type DistributionDimension = (typeof DISTRIBUTION_DIMENSIONS)[number];

/** 维度中文标签；顺序即页面展示顺序。 */
export const DISTRIBUTION_DIMENSION_LABELS: Record<DistributionDimension, string> = {
  college: "学院",
  major: "专业",
  className: "班级",
  grade: "年级",
  branch: "支部",
};

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseIdentityCount(payload: unknown): IdentityCount {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("身份计数格式不正确");
  const source = payload as Record<string, unknown>;
  if (!isNonNegativeInteger(source.count)) throw new Error("身份计数缺少或包含非法的人数");
  const identityId = source.identityId;
  const level = source.level;
  const identityName = source.identityName;
  return {
    identityId: typeof identityId === "number" && Number.isSafeInteger(identityId) ? identityId : null,
    identityName: typeof identityName === "string" && identityName.trim() ? identityName : null,
    level: typeof level === "number" && Number.isSafeInteger(level) ? level : null,
    count: source.count,
  };
}

function parseGroup(payload: unknown): DistributionGroup {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("分组格式不正确");
  const source = payload as Record<string, unknown>;
  if (!isNonNegativeInteger(source.total)) throw new Error("分组缺少合法的总人数");
  const rawIdentities = Array.isArray(source.identities) ? source.identities : [];
  const key = typeof source.key === "string" && source.key.trim() ? source.key : "未填写";
  return { key, total: source.total, identities: rawIdentities.map(parseIdentityCount) };
}

/**
 * 校验并归一化分布响应。
 *
 * 只在结构确实不合法时抛错，让页面走「加载失败」而不是把不可信数字当真实统计展示：
 * `total` 必须是安全非负整数，身份人数同理。`groups` / `identities` 缺失按空集合处理。
 * 不按固定列序号推断身份，也不补 0 冒充真实人数。
 */
export function parseDistribution(payload: unknown): DistributionVo {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("统计分布响应格式不正确");
  const source = payload as Record<string, unknown>;
  const dimension = typeof source.dimension === "string" ? source.dimension : "";
  const rawGroups = Array.isArray(source.groups) ? source.groups : [];
  return { dimension, groups: rawGroups.map(parseGroup) };
}

/**
 * 获取分布数据。
 *
 * 只发送 `dimension`；不传 branchId 等范围参数——数据范围由服务端依据登录态判定，
 * 前端传范围等于绕过服务端校验。
 */
export async function getDistribution(dimension: DistributionDimension): Promise<DistributionVo> {
  return parseDistribution(await get<unknown>("/v4/statistics/distribution", { dimension }));
}

/**
 * 管理待办与身份计数（后端 `DashboardVo`，`DashboardServiceImpl.dashboard`）。
 *
 * `identityDistribution` 复用 `IdentityCount`：形状与分布统计的身份计数完全一致，
 * 且同样允许 `identityId`/`identityName`/`level` 为空——服务端追加的未登记行
 * `identityId` 为 null、`identityName` 为「未登记」。
 */
export interface DashboardVo {
  pendingThoughtReports: number;
  pendingIdentityChanges: number;
  identityDistribution: IdentityCount[];
}

/**
 * 校验并归一化待办响应。
 *
 * 两个待办数是本页唯一驱动「还有多少待处理」的数字，缺失或非法一律抛错进错误态，
 * **绝不补 0**——补 0 会让「接口字段缺失」看起来像「真的没有待办」。
 * `identityDistribution` 缺失按空集合处理；单项 `count` 非法则抛错，不虚构身份行、不补差额。
 */
export function parseDashboard(payload: unknown): DashboardVo {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("管理待办响应格式不正确");
  const source = payload as Record<string, unknown>;
  if (!isNonNegativeInteger(source.pendingThoughtReports)) throw new Error("待审阅思想汇报计数缺失或非法");
  if (!isNonNegativeInteger(source.pendingIdentityChanges)) throw new Error("待审批身份变更计数缺失或非法");
  const rawIdentities = Array.isArray(source.identityDistribution) ? source.identityDistribution : [];
  return {
    pendingThoughtReports: source.pendingThoughtReports,
    pendingIdentityChanges: source.pendingIdentityChanges,
    identityDistribution: rawIdentities.map(parseIdentityCount),
  };
}

/** 本人学习汇总（后端 `StudySummaryVo`，`StudyRecordService.summaryMine`）。 */
export interface StudySummaryVo {
  recordCount: number;
  totalMinutes: number;
  /** 平均分，两位小数；无记录时服务端返回 null。以 number 归一化，页面不再格式化。 */
  avgScore: number | null;
}

/** 后端 `BigDecimal` 序列化可能是数字或数字字符串，两者都接受，空值归为 null。 */
function parseAvgScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("学习汇总的平均分格式不正确");
    return value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) throw new Error("学习汇总的平均分格式不正确");
    return parsed;
  }
  throw new Error("学习汇总的平均分格式不正确");
}

/**
 * 校验并归一化本人学习汇总。
 *
 * 条数与总分钟数必须是安全非负整数；`avgScore` 允许 null（无记录），不允许被补成 0——
 * 「没有记录」与「平均 0 分」在业务上完全不同。
 */
export function parseStudySummary(payload: unknown): StudySummaryVo {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("学习汇总响应格式不正确");
  const source = payload as Record<string, unknown>;
  if (!isNonNegativeInteger(source.recordCount)) throw new Error("学习汇总缺少或包含非法的记录条数");
  if (!isNonNegativeInteger(source.totalMinutes)) throw new Error("学习汇总缺少或包含非法的总学时");
  return {
    recordCount: source.recordCount,
    totalMinutes: source.totalMinutes,
    avgScore: parseAvgScore(source.avgScore),
  };
}

/** 管理待办与身份计数：无任何查询参数，范围由服务端按登录态判定。 */
export async function getDashboard(): Promise<DashboardVo> {
  return parseDashboard(await get<unknown>("/v4/statistics/dashboard"));
}

/** 本人学习汇总：无参数，服务端按登录态取当前账号，不接受用户标识。 */
export async function getMyStudySummary(): Promise<StudySummaryVo> {
  return parseStudySummary(await get<unknown>("/v4/user/study-records/mine/summary"));
}
