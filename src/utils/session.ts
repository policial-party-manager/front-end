import { ref } from "vue";
import { isRole, resolvePreviewRole, roleFromBackend, type Role } from "@/config/permissions";
import { canSwitchPreviewRole as canSwitchPreviewRolePolicy, getFallbackRole } from "@/config/auth-mode";
import { sessionFence, type SessionSnapshot } from "@/config/session-fence";
import { isDevSkipLoginEnabled } from "@/utils/authMode";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from "@/utils/token";

const SESSION_KEY = "party_user_session";
const SESSION_IDENTITY_KEY = "party_session_identity";
const PREVIEW_ROLE_KEY = "party_dev_preview_role";

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
  if (!hasAccessToken) {
    const fallbackUser = createFallbackUser(false);
    const canSwitchRole = canSwitchPreviewRolePolicy(isDevSkipLoginEnabled, false);
    const previewRole = localStorage.getItem(PREVIEW_ROLE_KEY);
    return {
      ...fallbackUser,
      role: resolvePreviewRole(fallbackUser.role, previewRole, canSwitchRole),
    };
  }

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
export const sessionHasAccessToken = ref<boolean>(!!getToken());

// 页面身份随登录/退出变化，正常令牌轮换保持不变；独立于请求层的 Token 快照。
function createSessionIdentity(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
}
function restoreSessionIdentity(): string {
  if (!getToken()) return "";
  const storedIdentity = localStorage.getItem(SESSION_IDENTITY_KEY);
  if (storedIdentity) return storedIdentity;
  const identity = createSessionIdentity();
  localStorage.setItem(SESSION_IDENTITY_KEY, identity);
  return identity;
}
export const sessionIdentity = ref(restoreSessionIdentity());
export interface SessionIdentitySnapshot {
  identity: string;
  role: Role;
}
export function captureSessionIdentity(): SessionIdentitySnapshot {
  return { identity: sessionIdentity.value, role: sessionUser.value.role };
}
export function isSessionIdentityCurrent(snapshot: SessionIdentitySnapshot): boolean {
  return (
    !!getToken() &&
    snapshot.identity !== "" &&
    snapshot.identity === sessionIdentity.value &&
    snapshot.identity === localStorage.getItem(SESSION_IDENTITY_KEY) &&
    snapshot.role === sessionUser.value.role
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.storageArea !== localStorage ||
      (event.key !== null &&
        ![ACCESS_TOKEN_STORAGE_KEY, SESSION_KEY, SESSION_IDENTITY_KEY, PREVIEW_ROLE_KEY].includes(event.key))
    ) {
      return;
    }

    sessionHasAccessToken.value = !!getToken();
    sessionUser.value = restoreUser();
    sessionIdentity.value = restoreSessionIdentity();
    sessionLoggedIn.value = sessionHasAccessToken.value || isDevSkipLoginEnabled;
  });
}

export function captureSession(): SessionSnapshot {
  return sessionFence.capture(getRefreshToken());
}

export function isSessionCurrent(snapshot: SessionSnapshot): boolean {
  return sessionFence.isCurrent(snapshot, getRefreshToken());
}

export function isAccessTokenCurrent(token: string): boolean {
  return getToken() === token;
}

/** 仅更新无 Token 的开发预览身份，不改动真实登录会话。 */
export function setPreviewRole(role: Role): boolean {
  const hasAccessToken = !!getToken();
  sessionHasAccessToken.value = hasAccessToken;
  const canSwitch = canSwitchPreviewRolePolicy(isDevSkipLoginEnabled, hasAccessToken);
  if (!canSwitch || !isRole(role)) return false;

  const nextRole = resolvePreviewRole(sessionUser.value.role, role, canSwitch);
  sessionUser.value = { ...sessionUser.value, role: nextRole };
  localStorage.setItem(PREVIEW_ROLE_KEY, nextRole);
  return true;
}

/** 同步令牌及用户资料；请求层仍在每次轮换后使旧 Token 快照失效。 */
function writeSession(payload: SessionPayload): void {
  sessionFence.advance();
  const user: SessionUser = {
    name: payload.realName || payload.username || sessionUser.value.name,
    avatar: sessionUser.value.avatar,
    role: roleFromBackend(payload.role),
  };
  setToken(payload.accessToken);
  setRefreshToken(payload.refreshToken);
  sessionHasAccessToken.value = true;
  sessionUser.value = user;
  sessionLoggedIn.value = true;
  localStorage.removeItem(PREVIEW_ROLE_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** 显式登录即创建新页面身份，即使两个账号名称和角色相同也相互隔离。 */
export function applySession(payload: SessionPayload): void {
  writeSession(payload);
  sessionIdentity.value = createSessionIdentity();
  localStorage.setItem(SESSION_IDENTITY_KEY, sessionIdentity.value);
}

/** 仅当刷新发起时的会话仍有效时，才接受刷新响应。 */
export function applyRefreshedSession(payload: SessionPayload, snapshot: SessionSnapshot): boolean {
  if (!isSessionCurrent(snapshot)) return false;
  if (roleFromBackend(payload.role) !== sessionUser.value.role) applySession(payload);
  else writeSession(payload);
  return true;
}

/** Token 失效或退出时，同步清除持久化状态与内存状态。 */
export function clearSession(): void {
  sessionFence.advance();
  clearToken();
  sessionHasAccessToken.value = false;
  sessionIdentity.value = "";
  localStorage.removeItem(SESSION_IDENTITY_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PREVIEW_ROLE_KEY);
  localStorage.removeItem("party_login_name");
  sessionUser.value = createFallbackUser(false);
  sessionLoggedIn.value = isDevSkipLoginEnabled;
}
