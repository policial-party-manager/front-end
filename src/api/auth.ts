import { post } from "@/api/request";

/**
 * 认证相关接口封装
 * 对应后端 openapi 的 /api/v1/auth/* 路径（baseURL 已含 /api，此处补版本前缀）
 */

/** 登录返回的菜单节点 */
export interface MenuItem {
  name: string;
  path: string;
  icon: string;
  children?: MenuItem[];
}

/** 登录成功返回体 */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  username: string;
  realName: string;
  role: string;
  branchId: number | null;
  branchName: string;
  menus?: MenuItem[];
}

/** 认证相关请求体（各登录/验证码/刷新复用同一结构，按需传字段） */
export interface AuthPayload {
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  verifyCode?: string;
  refreshToken?: string;
}

/** 用户名密码登录 */
export function loginUserpass(payload: AuthPayload): Promise<LoginResult> {
  return post<LoginResult>("/v1/auth/login/userpass", payload);
}

/** 邮箱验证码登录 */
export function loginEmail(payload: AuthPayload): Promise<LoginResult> {
  return post<LoginResult>("/v1/auth/login/email", payload);
}

/** 手机号验证码登录 */
export function loginPhone(payload: AuthPayload): Promise<LoginResult> {
  return post<LoginResult>("/v1/auth/login/phone", payload);
}

/** 发送验证码（邮箱 / 手机号） */
export function sendVerifyCode(payload: AuthPayload): Promise<string> {
  return post<string>("/v1/auth/verifyCode", payload);
}

/** 退出登录 */
export function logout(refreshToken: string): Promise<string> {
  return post<string>("/v1/auth/logout", { refreshToken });
}

/** 刷新 JWT token */
export function refresh(refreshToken: string): Promise<LoginResult> {
  return post<LoginResult>("/v1/auth/refresh", { refreshToken });
}
