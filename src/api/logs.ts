import { get } from "@/api/request";

/** 操作日志记录；字段与后端 OperationLog 契约一一对应。 */
export interface OperationLogVo {
  id: string;
  logType: string;
  module: string;
  action: string;
  /** 仅 OPERATION 记录携带请求方法；LOGIN / LOGOUT / ERROR 为空。 */
  method: string | null;
  /** 同上，仅 OPERATION 记录携带请求路径。 */
  path: string | null;
  /** 登录前没有鉴权上下文（LOGIN），或未登录请求触发的 ERROR 时为空。 */
  operatorId: number | null;
  /** 同上；ERROR 在未登录请求上可能为空。 */
  operatorName: string | null;
  /** 同上；LOGIN 为空。 */
  role: string | null;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  /** LOGIN / LOGOUT 不记录状态码。 */
  resultCode: number | null;
  /** 仅 ERROR 记录携带，取值是 Java 异常类名（如 IllegalStateException），不是业务枚举。 */
  errorType: string | null;
  message: string;
  /** LOGIN / LOGOUT / ERROR 不记录耗时。 */
  durationMs: number | null;
  occurTime: number;
  /**
   * 后端用 ISO_OFFSET_DATE_TIME 生成，形如 2026-09-29T13:22:45.123+08:00，
   * 带 T、毫秒与时区偏移，并非展示友好格式；
   * 视图层用 members.vue 的 dateLabel（replace("T", " ").slice(0, 16)）处理。
   */
  occurTimeText: string;
}

export interface LogPageResult {
  records: OperationLogVo[];
  total: number;
  page: number;
  size: number;
}

/** 日志筛选条件；未填写的项保持 undefined，由请求层从 query 中丢弃。 */
export interface LogFilters {
  logType?: string;
  module?: string;
  operatorName?: string;
  ip?: string;
  keyword?: string;
  success?: boolean;
  errorType?: string;
  startTime?: string;
  endTime?: string;
}

export const pageLogs = (params: LogFilters & { page: number; size: number }) =>
  get<LogPageResult>("/v4/admin/logs/page", params);
