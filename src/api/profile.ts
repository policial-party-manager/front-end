import { get, put } from "@/api/request";

/**
 * 个人中心：本人资料查询与联系方式编辑。
 *
 * 后端契约（对照 back-end `UserController` / `UserServiceImpl.updateProfile` / `UserProfileUpdateRequest`）：
 *
 * - `GET /v4/user/profile` 返回 `UserProfileVo`。`identityName` 由身份字典补名、`branchName` 由支部表补名，
 *   两者都可能为 null（未登记政治身份 / 未分配支部），页面按既有口径显示「未登记」「未分配支部」。
 * - `PUT /v4/user/profile` 是**部分更新**：服务端逐字段 `trimToNull`，为 null 即跳过赋值，
 *   因此「未传 = 不改」。前端只提交实际变化的字段，不用整表回写覆盖未编辑的内容。
 * - **无法清空**：空串同样被 `trimToNull` 归一为 null，随后 `userDetailMapper.updateById` 走 MyBatis-Plus
 *   默认 `NOT_NULL` 策略跳过该列，于是接口返回 200 但库中值不变。这与 `docs/前后端接入现状.md`
 *   记录的 `PUT /v4/members/{id}/contact`「空串清空失效」同源，属后端缺陷。界面对此不提供清空操作，
 *   也不静默忽略用户的清空意图（改为字段级提示并阻止提交）。
 * - 校验：手机号 `^$|^1\d{10}$`；邮箱正则（`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`）且 ≤25；
 *   紧急联系人 ≤50；备注 ≤500。前端前置校验只用于减少无效请求，最终校验仍在服务端。
 * - 可编辑白名单只声明本任务开放的 4 个字段。后端物理上还接受
 *   realName/studentId/identityCardNumber/gender/college/grade/major/className，
 *   但这些属管理侧维护，本人不得编辑，因此不在请求类型中暴露。
 */

/** 后端 `UserProfileVo`；仅声明页面消费的字段，未登记字段可能为 null。 */
export interface ProfileResponse {
  id?: number | null;
  username?: string | null;
  status?: number | null;
  realName?: string | null;
  studentId?: string | null;
  phone?: string | null;
  email?: string | null;
  identityCardNumber?: string | null;
  gender?: string | null;
  college?: string | null;
  grade?: string | null;
  major?: string | null;
  className?: string | null;
  contactPerson?: string | null;
  remark?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  identityId?: number | null;
  identityName?: string | null;
}

/** 本人资料更新请求：只包含允许本人编辑的 4 个字段，未传即不改。 */
export interface UserProfileUpdateRequest {
  phone?: string;
  email?: string;
  contactPerson?: string;
  remark?: string;
}

/** 获取当前会话用户的个人资料，不接受用户标识参数。 */
export function getMyProfile(): Promise<ProfileResponse | null> {
  return get<ProfileResponse | null>("/v4/user/profile");
}

/** 更新本人联系方式；后端按部分更新语义处理，空串无法清空既有值。 */
export function updateMyProfile(payload: UserProfileUpdateRequest): Promise<unknown> {
  return put<unknown>("/v4/user/profile", payload);
}
