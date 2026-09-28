import type { ActivityStatus } from "@/api/activities";

/** 0 与 2 的名称沿用 Issue 24 原型约定，后端只明确了 1 为已发布。 */
export const activityStatusOptions: { value: ActivityStatus; label: string }[] = [
  { value: 0, label: "未发布" },
  { value: 1, label: "已发布" },
  { value: 2, label: "已下线" },
];

export function activityStatusLabel(status: number | null | undefined): string {
  return activityStatusOptions.find((option) => option.value === status)?.label || "状态未知";
}

export function activityStatusClass(status: number | null | undefined): string {
  if (status === 1) return "is-published";
  if (status === 2) return "is-offline";
  return "is-draft";
}
