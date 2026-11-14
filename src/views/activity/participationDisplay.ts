import type { SignRecord } from "@/api/activity-participation";

/**
 * 签到类型展示。
 *
 * 后端当前只有 `sign`（本人签到）与 `makeup`（补签）。`signType` 在契约上是开放字符串，
 * 后端新增类型时不能误判成正常签到，也不隐藏真实值，便于排查。
 */
export function signTypeLabel(signType: string | null | undefined): string {
  const value = (signType ?? "").trim();
  if (value === "sign") return "本人签到";
  if (value === "makeup") return "补签";
  if (!value) return "未标注类型";
  return "未知类型（" + value + "）";
}

/** 未知签到类型需要与正常签到区分的视觉状态。 */
export function signTypeTagType(signType: string | null | undefined): "success" | "primary" | "warning" {
  const value = (signType ?? "").trim();
  if (value === "sign") return "success";
  if (value === "makeup") return "primary";
  return "warning";
}

/** 服务端 LocalDateTime 文本按原值裁剪到分钟，不做时区换算。 */
export function formatRecordTime(value: string | null | undefined): string {
  if (!value) return "未记录";
  return value.replace("T", " ").slice(0, 16);
}

/** 可空文本：空字符串与 null 都显示占位，避免空白单元格被当成缺失渲染 bug。 */
export function formatOptionalText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || "未记录";
}

/** 成员 ID：服务端没有姓名时直接展示真实 ID，不猜测或补名。 */
export function memberIdLabel(userId: number | null | undefined): string {
  return Number.isSafeInteger(userId) && (userId as number) > 0 ? String(userId) : "编号不可用";
}

/** 仅展示设备与备注中真实存在的字段，不拼装空值。 */
export function signExtraText(record: SignRecord): string {
  const parts: string[] = [];
  if (record.device && record.device.trim()) parts.push("设备：" + record.device.trim());
  if (record.remark && record.remark.trim()) parts.push("备注：" + record.remark.trim());
  return parts.join(" · ");
}
