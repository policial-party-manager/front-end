import { formatRecordTime } from "@/views/activity/participationDisplay";

/**
 * 我的培养（本人电子培养档案）展示层纯函数。
 *
 * 组装原则：
 * - 枚举只映射后端已经明确的取值；未知取值一律显示「未知状态（x）」，不许兜底成成功语义。
 * - 时间为服务端 LocalDateTime / LocalTime 文本，按原值裁剪，不做时区换算。
 * - 关联对象只有编号时展示编号，不猜测名称、不额外请求。
 */

/** 服务端时间文本裁剪到分钟；空值显示「未记录」。与服务端 LocalDateTime 序列化格式一致。 */
export function formatProfileTime(value: string | null | undefined): string {
  return formatRecordTime(value);
}

/**
 * 累计学时（分钟）展示。
 * 后端 `summary.studyMinutes` 由每条学习记录的 `studyTime` 累加 hour*60+minute 得到，单位就是分钟。
 */
export function formatStudyMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "未统计";
  const total = Math.floor(minutes);
  if (total < 60) return total + " 分钟";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? hours + " 小时" : hours + " 小时 " + rest + " 分钟";
}

/**
 * 单条学习记录的学时展示。
 * 后端 `StudyRecord.studyTime` 是 LocalTime（"HH:mm:ss"），表示时长而不是时间点，
 * 因此只取时、分并按分钟口径格式化，不能当成时刻或做时区换算。
 */
export function formatStudyDuration(studyTime: string | null | undefined): string {
  const text = (studyTime ?? "").trim();
  if (!text) return "未记录";
  const matched = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!matched) return "未记录";
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return "未记录";
  return formatStudyMinutes(hours * 60 + minutes);
}

/** 状态缺失时的统一文案：区分「后端没给」与「后端给了没见过的值」。 */
function unknownStatusLabel(status: number | null | undefined): string {
  return status == null ? "状态未标注" : "未知状态（" + status + "）";
}

/** 身份变更单状态：1 待审批 / 2 已生效 / 3 驳回（后端 IdentityChange.STATUS_*）。 */
export function identityChangeStatusLabel(status: number | null | undefined): string {
  if (status === 1) return "待审批";
  if (status === 2) return "已生效";
  if (status === 3) return "驳回";
  return unknownStatusLabel(status);
}

/** 身份变更单状态的标签配色；未知值用中性色，避免看起来像成功。 */
export function identityChangeTagType(status: number | null | undefined): "warning" | "success" | "danger" | "info" {
  if (status === 1) return "warning";
  if (status === 2) return "success";
  if (status === 3) return "danger";
  return "info";
}

/** 思想汇报审阅状态：1 待审阅 / 2 通过 / 3 驳回（后端 ThoughtReportServiceImpl 使用同一套取值）。 */
export function thoughtReportStatusLabel(status: number | null | undefined): string {
  if (status === 1) return "待审阅";
  if (status === 2) return "通过";
  if (status === 3) return "驳回";
  return unknownStatusLabel(status);
}

/** 思想汇报状态的标签配色。 */
export function thoughtReportTagType(status: number | null | undefined): "warning" | "success" | "danger" | "info" {
  if (status === 2) return "success";
  if (status === 3) return "danger";
  return status === 1 ? "warning" : "info";
}

/** 请假状态：1 生效 / 0 已撤销（后端 ActivityLeave.status）。 */
export function leaveStatusLabel(status: number | null | undefined): string {
  if (status === 1) return "生效";
  if (status === 0) return "已撤销";
  return unknownStatusLabel(status);
}

/** 培养材料状态：1 正常 / 0 已删除（后端 CultivationMaterial.status）。 */
export function materialStatusLabel(status: number | null | undefined): string {
  if (status === 1) return "正常";
  if (status === 0) return "已删除";
  return unknownStatusLabel(status);
}

/**
 * 关联编号展示：档案记录只带外键，没有活动标题、课程名、人员姓名。
 * 编号可用时展示真实编号，不可用时不猜、不显示 "null"。
 */
export function relationLabel(id: number | null | undefined): string {
  return Number.isSafeInteger(id) && (id as number) > 0 ? String(id) : "编号不可用";
}

/**
 * 身份变更的方向展示：首次登记时 fromIdentity 为空，不能显示成 "null → 积极分子"。
 * 编号可用性由 relationLabel 判断，此处只负责拼接。
 */
export function identityShiftLabel(from: number | null | undefined, to: number | null | undefined): string {
  return relationLabel(from) + " → " + relationLabel(to);
}

/** 只拼接真实存在的片段（设备、备注等），空值既不占位也不留下分隔符。 */
export function joinTexts(...parts: (string | null | undefined)[]): string {
  const values = parts.map((part) => (part ?? "").trim()).filter((part) => part.length > 0);
  return values.join(" · ");
}

/** 签到补充信息：设备与备注只在真实存在时拼接，与参与管理页保持同一口径。 */
export function signExtraText(device: string | null | undefined, remark: string | null | undefined): string {
  return joinTexts(device ? "设备：" + device : "", remark ? "备注：" + remark : "");
}

/** 成绩原文展示：后端用 BigDecimal，JSON 可能是数字或数字字符串，原样转文本避免精度丢失。 */
export function scoreLabel(score: number | string | null | undefined): string {
  if (score == null) return "未记录";
  const text = String(score).trim();
  return text || "未记录";
}
