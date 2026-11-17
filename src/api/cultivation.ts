import { get } from "@/api/request";
import type { CultivationProfile } from "@/api/cultivation-profiles";

/**
 * 管理侧电子培养档案：`GET /v4/cultivation-profiles/{userId}`。
 *
 * 与 `cultivation-profiles.ts` 的 `/me` 端点结构完全相同，只是查询对象由路径决定：
 * - `/me` 固定查登录者本人，服务端用登录态裁决；
 * - `/{userId}` 由服务端 `CultivationProfileServiceImpl.of` 按范围裁决：
 *   超管全院放行、支委 `requireManageableUser` 限本支部、其余角色必须 `userId` 等于本人。
 *
 * 边界：
 * - 不接受任何范围参数（`branchId`/`scope`/`userId` query 都不发），前端拼范围参数等于尝试扩权。
 * - 普通成员访问他人档案与真实不存在的成员都是 HTTP 400「用户不存在」，
 *   前端不得据此推断成员存在性，也不得改写成「无权限」。
 * - 各区块只带外键（`activityId`/`courseId`/`operatorId`/`uploaderId`），不带活动标题、课程名、人员姓名。
 * - 服务端已过滤作废身份变更、非生效请假与材料，前端不得重复过滤。
 */
export const getMemberCultivationProfile = (userId: number) => {
  // 非法编号直接拒绝，避免把 `NaN`、负数等路径发给服务端。
  if (!Number.isSafeInteger(userId) || userId <= 0) return Promise.reject(new Error("成员编号不可用"));
  return get<CultivationProfile | null>(`/v4/cultivation-profiles/${userId}`);
};
