import { get } from "@/api/request";
import type { UserVo } from "@/api/members";

/**
 * 电子培养档案（后端 #80）前端契约。
 *
 * 对应后端 `CultivationProfileVo`：一次请求返回某人完整培养信息。
 * 各区块在无数据时返回空集合，不省略字段、不报错；`basic` 与 `summary` 在异常响应下可能缺失。
 *
 * 重要边界：
 * - 本模块只封装「本人」端点 `GET /v4/cultivation-profiles/me`，不接受任何 userId 参数。
 * - 档案里的身份变更、思想汇报、签到、请假、学习、材料记录都只带外键编号
 *   （activityId / courseId / operatorId …），不带活动标题、课程名、人员姓名。
 *   前端不得为补齐名称另行请求接口，只能按编号兜底展示。
 */

/** 培养联系人（后端 MentorServiceImpl.MentorView）：当前生效关系，不是历史快照。 */
export interface CultivationMentor {
  mentorId: number;
  realName: string | null;
  username: string | null;
}

/** 身份变更单（后端 IdentityChange）：status 1 待审批 / 2 已生效 / 3 驳回；服务端已过滤作废单。 */
export interface CultivationIdentityChange {
  id: number;
  userId: number;
  fromIdentity: number | null;
  toIdentity: number | null;
  operatorId: number | null;
  reason: string | null;
  status: number | null;
  reviewerId: number | null;
  reviewTime: string | null;
  reviewRemark: string | null;
  createTime: string | null;
}

/** 思想汇报（后端 ThoughtReport）：status 1 待审阅 / 2 通过 / 3 驳回。 */
export interface CultivationThoughtReport {
  id: number;
  userId: number;
  reviewerId: number | null;
  title: string | null;
  content: string | null;
  file: string | null;
  status: number | null;
  reviewRemark: string | null;
  submitTime: string | null;
  reviewTime: string | null;
}

/** 签到记录（后端 SignRecord）：signType 是开放字符串，仅在界面上做安全映射。 */
export interface CultivationSignRecord {
  id: number;
  activityId: number | null;
  userId: number;
  signTime: string | null;
  signType: string | null;
  device: string | null;
  location: string | null;
  remark: string | null;
}

/** 活动请假（后端 ActivityLeave）：服务端只返回 status=1 的记录。 */
export interface CultivationLeave {
  id: number;
  activityId: number | null;
  userId: number | null;
  reason: string | null;
  operatorId: number | null;
  status: number | null;
  createTime: string | null;
  updateTime: string | null;
}

/**
 * 学习记录（后端 StudyRecord）。
 * `studyTime` 是 LocalTime 文本（形如 "01:30:00"），表示学时而非时间点；
 * `score` 后端是 BigDecimal，JSON 可能是数字或数字字符串，展示层原样转文本，不做 Number() 转换。
 */
export interface CultivationStudyRecord {
  id: number;
  userId: number;
  courseId: number | null;
  studyTime: string | null;
  score: number | string | null;
  url: string | null;
  remark: string | null;
  createTime: string | null;
}

/** 培养材料（后端 CultivationMaterial）：file 为 `file:` 前缀的内部相对路径，只展示不下载。 */
export interface CultivationMaterial {
  id: number;
  userId: number;
  materialType: string | null;
  file: string | null;
  fileName: string | null;
  uploaderId: number | null;
  remark: string | null;
  status: number | null;
  createTime: string | null;
}

/** 服务端算好的摘要：前端直接展示，不二次计算，避免口径分歧。 */
export interface CultivationSummary {
  thoughtReportCount: number;
  thoughtReportApproved: number;
  /** 活动签到次数（不是报名次数、不是参与活动总数）。 */
  signCount: number;
  /** 累计学时，单位为分钟。 */
  studyMinutes: number;
  materialCount: number;
}

/** 个人信息：复用成员管理的 UserVo，避免出现第二套用户类型。 */
export type CultivationBasic = UserVo;

export interface CultivationProfile {
  basic: CultivationBasic | null;
  mentors: CultivationMentor[] | null;
  identityChanges: CultivationIdentityChange[] | null;
  thoughtReports: CultivationThoughtReport[] | null;
  signRecords: CultivationSignRecord[] | null;
  leaves: CultivationLeave[] | null;
  studyRecords: CultivationStudyRecord[] | null;
  materials: CultivationMaterial[] | null;
  summary: CultivationSummary | null;
}

/**
 * 获取本人完整培养档案。
 *
 * 后端 `/me` 由登录态决定查询对象；前端不传、也不允许拼接 userId，
 * 否则会变成「查他人档案」并触发服务端范围校验。
 */
export const getMyCultivationProfile = () => get<CultivationProfile | null>("/v4/cultivation-profiles/me");
