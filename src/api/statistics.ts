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
