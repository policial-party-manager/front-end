import { get } from "@/api/request";

/** 当前登录用户的个人资料；类型只包含本页展示所需的字段。 */
export interface ProfileResponse {
  realName?: string | null;
  studentId?: string | null;
  phone?: string | null;
  email?: string | null;
  college?: string | null;
  grade?: string | null;
  major?: string | null;
  className?: string | null;
  branchName?: string | null;
}

/** 获取当前会话用户的个人资料，不接受用户标识参数。 */
export function getMyProfile(): Promise<ProfileResponse | null> {
  return get<ProfileResponse | null>("/v4/user/profile");
}
