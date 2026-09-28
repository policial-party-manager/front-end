/** 从 API 错误中提取可展示的服务端消息。 */
export function getApiErrorMessage(error: unknown, fallback = "请求失败，请稍后重试"): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    const message = response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
