import { get } from "@/api/request";
import type { ContentPage } from "@/api/content";
import type { ActivityVo } from "@/api/activities";

/**
 * 管理侧活动参与数据（报名 / 签到 / 签到名单导出）。
 *
 * 全部走 `/v4/activities/**` scoped 端点：
 * - 超级管理员：授权范围内的全部活动；
 * - 支部书记（后端 `branch_admin`）：仅本支部活动；
 * - 普通成员：403；跨支部与不存在的活动统一返回「活动不存在」。
 *
 * 数据范围由后端 `ActivityScopeGuard` 判定，前端不传递也不推断支部范围。
 */

/** 活动报名记录。后端 `ActivitySignup`，一行 = 一个成员对某活动的一次有效报名。 */
export interface ActivitySignup {
  id: number;
  activityId: number;
  userId: number;
  signupTime: string | null;
}

/** 签到记录。后端 `SignRecord`；`signType` 为开放字符串，未知值需安全兜底。 */
export interface SignRecord {
  id: number;
  activityId: number;
  userId: number;
  signTime: string | null;
  /** `sign` 本人签到、`makeup` 补签；后端新增类型时前端按未知类型展示。 */
  signType: string | null;
  device: string | null;
  /** 服务端原样文本（后端为 WKT point），前端不解析为坐标或地图。 */
  location: string | null;
  remark: string | null;
}

export interface ActivityParticipationQuery {
  page: number;
  size: number;
  userId?: number;
}

export type ActivitySignupPage = ContentPage<ActivitySignup>;
export type ActivitySignPage = ContentPage<SignRecord>;

/** 管理侧活动详情，用于确认当前账号可管理该活动。 */
export const getScopedActivity = (id: number) => get<ActivityVo>("/v4/activities/" + id);

export const pageActivitySignups = (id: number, params: ActivityParticipationQuery) =>
  get<ActivitySignupPage>("/v4/activities/" + id + "/signups/page", params);

export const pageActivitySigns = (id: number, params: ActivityParticipationQuery) =>
  get<ActivitySignPage>("/v4/activities/" + id + "/signs/page", params);

/**
 * 导出本活动完整签到名单（xlsx）。
 *
 * 服务端按活动生成完整考勤名单，接口不接受 userId / page / size，
 * 因此导出范围与本页两类分页的筛选结果无关。
 */
export const exportActivitySigns = (id: number) =>
  get<Blob>("/v4/activities/" + id + "/signs/export", undefined, { responseType: "blob" });
