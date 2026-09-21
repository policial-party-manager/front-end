import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { ElMessage } from "element-plus";
import { getToken } from "@/utils/token";
import { shouldSkipUnauthorizedRefresh } from "@/config/auth-mode";
import {
  applyRefreshedSession,
  captureSession,
  clearSession,
  isAccessTokenCurrent,
  isSessionCurrent,
  type SessionPayload,
} from "@/utils/session";
import { sessionFence, type SessionSnapshot } from "@/config/session-fence";
import { isDevSkipLoginEnabled } from "@/utils/authMode";

/**
 * 前端请求层封装
 *
 * - baseURL 取自环境变量 VITE_API_BASE_URL（/api），配合 vite proxy 转发到后端
 * - 请求拦截：自动携带 Authorization: Bearer <accessToken>
 * - 响应拦截：统一解包后端 { code, message, data }；code===0 视为成功，否则报错
 * - 401 时尝试用 refreshToken 刷新后重放原请求；刷新失败则清除登录态并跳转登录页
 */

/** 后端统一响应结构 */
interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 配置项中可用于标识是否已重试刷新 */
type RetryConfig = AxiosRequestConfig & { _retry?: boolean };

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});

// 请求拦截：注入登录令牌
service.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 独立实例用于刷新 token，避免触发本拦截器造成循环 */
const refreshService = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});

let refreshOperation: { snapshot: SessionSnapshot; promise: Promise<string> } | undefined;

function refreshAccessToken(snapshot: SessionSnapshot): Promise<string> {
  if (refreshOperation && sessionFence.same(refreshOperation.snapshot, snapshot)) {
    return refreshOperation.promise;
  }

  const promise = Promise.resolve().then(async () => {
    const { data } = await refreshService.post<ApiResponse<SessionPayload>>("/v1/auth/refresh", {
      refreshToken: snapshot.refreshToken,
    });
    if (data.code !== 200 || !data.data) {
      throw new Error(data.message || "登录态已失效");
    }
    if (!applyRefreshedSession(data.data, snapshot)) {
      throw new Error("登录状态已变更");
    }
    return data.data.accessToken;
  });
  const operation = { snapshot, promise };
  refreshOperation = operation;
  void operation.promise
    .finally(() => {
      if (refreshOperation === operation) refreshOperation = undefined;
    })
    .catch(() => undefined);
  return operation.promise;
}

function redirectToLogin(): void {
  clearSession();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// 响应拦截：统一解包 + 异常处理
service.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse;
    // 后端约定：成功 code=200；失败 code=400（如"用户名不存在"）
    if (res.code !== 200) {
      ElMessage.error(res.message || "请求失败");
      return Promise.reject(new Error(res.message || "请求失败"));
    }
    // 直接向调用方返回后端 data
    return res.data as never;
  },
  async (error) => {
    const config = (error.config ?? {}) as RetryConfig;
    const status = error.response?.status;

    // 401：只处理由当前 Token 发出的请求，防止旧请求影响新会话。
    if (status === 401 && !shouldSkipUnauthorizedRefresh(isDevSkipLoginEnabled, !!getToken())) {
      if (config.url?.includes("/auth/")) {
        const message = (error.response?.data as ApiResponse)?.message || "登录失败";
        ElMessage.error(message);
        return Promise.reject(error);
      }

      const authorization = config.headers?.Authorization;
      const requestToken = typeof authorization === "string" ? authorization.replace(/^Bearer\s+/i, "") : "";
      if (!requestToken || requestToken !== getToken()) return Promise.reject(error);

      if (config._retry) {
        redirectToLogin();
        return Promise.reject(error);
      }

      config._retry = true;
      const snapshot = captureSession();
      let newToken: string;
      try {
        newToken = await refreshAccessToken(snapshot);
      } catch {
        if (isSessionCurrent(snapshot)) redirectToLogin();
        return Promise.reject(error);
      }

      if (!isAccessTokenCurrent(newToken)) return Promise.reject(error);
      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`;
      return service(config);
    }

    const msg = (error.response?.data as ApiResponse)?.message || error.message || "网络请求失败";
    ElMessage.error(msg);
    return Promise.reject(error);
  },
);

export async function get<T>(url: string, params?: object, config?: AxiosRequestConfig): Promise<T> {
  return service.request({ url, method: "get", params, ...config }) as Promise<T>;
}

export async function post<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
  return service.post(url, data, config) as Promise<T>;
}

export async function put<T>(url: string, data?: object, config?: AxiosRequestConfig): Promise<T> {
  return service.put(url, data, config) as Promise<T>;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return service.delete(url, config) as Promise<T>;
}

export default service;
