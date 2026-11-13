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

/** 后端 LogType 常量，也是 stats 接口的固定四个 key。 */
export const LOG_TYPES = ["LOGIN", "LOGOUT", "OPERATION", "ERROR"] as const;
export type LogType = (typeof LOG_TYPES)[number];
/** 全局日志统计：四类日志的总条数，与列表筛选条件无关。 */
export type LogStats = Record<LogType, number>;

export const pageLogs = (params: LogFilters & { page: number; size: number }) =>
  get<LogPageResult>("/v4/admin/logs/page", params);

/**
 * 校验统计响应：四个 key 必须齐全且均为非负安全整数。
 * 缺失、null、字符串、负数与 NaN 一律视为异常响应，绝不默认补 0 冒充真实计数。
 */
export function parseLogStats(payload: unknown): LogStats {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("日志统计响应格式不正确");
  const source = payload as Record<string, unknown>;
  const result = {} as LogStats;
  for (const type of LOG_TYPES) {
    const value = source[type];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new Error(`日志统计缺少或包含非法的 ${type} 计数`);
    result[type] = value;
  }
  return result;
}

/** 全局统计；不接收 keyword、时间范围或分页参数。 */
export const getLogStats = async (): Promise<LogStats> => parseLogStats(await get<unknown>("/v4/admin/logs/stats"));
