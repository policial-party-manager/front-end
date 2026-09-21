import { ref } from "vue";
import { isRole, roleFromBackend, type Role } from "@/config/permissions";
import { getFallbackRole } from "@/config/auth-mode";
import { sessionFence, type SessionSnapshot } from "@/config/session-fence";
import { isDevSkipLoginEnabled } from "@/utils/authMode";
import { clearToken, getRefreshToken, getToken, setRefreshToken, setToken } from "@/utils/token";

const SESSION_KEY = "party_user_session";

export interface SessionUser {
  name: string;
  avatar: string;
  role: Role;
}

export interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  username?: string;
  realName?: string | null;
  role: string;
}

function createFallbackUser(hasAccessToken: boolean): SessionUser {
  const isPreview = isDevSkipLoginEnabled && !hasAccessToken;
  return {
    name: isPreview ? "开发预览用户" : "用户",
    avatar: "",
    role: getFallbackRole(isDevSkipLoginEnabled, hasAccessToken),
  };
}

function restoreUser(): SessionUser {
  const hasAccessToken = !!getToken();
  if (!hasAccessToken) return createFallbackUser(false);

  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Partial<SessionUser> | null;
    if (!value || typeof value.name !== "string" || !isRole(value.role)) return createFallbackUser(true);
    return { name: value.name, avatar: typeof value.avatar === "string" ? value.avatar : "", role: value.role };
  } catch {
    return createFallbackUser(true);
  }
}

export const sessionUser = ref<SessionUser>(restoreUser());
export const sessionLoggedIn = ref<boolean>(!!getToken() || isDevSkipLoginEnabled);

export function captureSession(): SessionSnapshot {
  return sessionFence.capture(getRefreshToken());
}

export function isSessionCurrent(snapshot: SessionSnapshot): boolean {
  return sessionFence.isCurrent(snapshot, getRefreshToken());
}

export function isAccessTokenCurrent(token: string): boolean {
  return getToken() === token;
}

/** 登录或刷新成功后，以后端响应同步 Token 与当前用户角色。 */
export function applySession(payload: SessionPayload): void {
  sessionFence.advance();
  const user: SessionUser = {
    name: payload.realName || payload.username || sessionUser.value.name,
    avatar: sessionUser.value.avatar,
    role: roleFromBackend(payload.role),
  };
  setToken(payload.accessToken);
  setRefreshToken(payload.refreshToken);
  sessionUser.value = user;
  sessionLoggedIn.value = true;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** 仅当刷新发起时的会话仍有效时，才接受刷新响应。 */
export function applyRefreshedSession(payload: SessionPayload, snapshot: SessionSnapshot): boolean {
  if (!isSessionCurrent(snapshot)) return false;
  applySession(payload);
  return true;
}

/** Token 失效或退出时，同步清除持久化状态与内存状态。 */
export function clearSession(): void {
  sessionFence.advance();
  clearToken();
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("party_login_name");
  sessionUser.value = createFallbackUser(false);
  sessionLoggedIn.value = isDevSkipLoginEnabled;
}
