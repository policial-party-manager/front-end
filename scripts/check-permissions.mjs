import assert from "node:assert/strict";
import { hasPermission, isRole, roleFromBackend } from "../src/config/permissions.ts";
import { getFallbackRole, shouldRedirectToLogin, shouldSkipUnauthorizedRefresh } from "../src/config/auth-mode.ts";
import { SessionFence } from "../src/config/session-fence.ts";

const managerRoles = ["super_admin", "party_secretary"];
const memberRoles = ["party_member", "activist"];
const commonPermissions = ["home:view", "content:view", "activity:view", "resource:view"];
const managerPermissions = ["member:manage", "development:manage", "activity:manage", "statistics:view"];

for (const role of [...managerRoles, ...memberRoles]) {
  assert.equal(isRole(role), true, `${role} 应为有效角色`);
  for (const permission of commonPermissions) {
    assert.equal(hasPermission(role, permission), true, `${role} 应具备 ${permission}`);
  }
}

for (const role of managerRoles) {
  for (const permission of managerPermissions) {
    assert.equal(hasPermission(role, permission), true, `${role} 应具备 ${permission}`);
  }
}

for (const role of memberRoles) {
  for (const permission of managerPermissions) {
    assert.equal(hasPermission(role, permission), false, `${role} 不应具备 ${permission}`);
  }
}

assert.equal(isRole("unknown"), false, "未知角色不应通过校验");
assert.equal(roleFromBackend("super_admin"), "super_admin");
assert.equal(roleFromBackend("branch_admin"), "party_secretary");
assert.equal(roleFromBackend("student"), "party_member");
assert.equal(roleFromBackend("unknown"), "party_member", "未知后端角色应按最低权限处理");

assert.equal(shouldRedirectToLogin(true, false, false), false, "开发免登录时应允许直接打开业务路由");
assert.equal(shouldRedirectToLogin(false, false, false), true, "正式模式未登录时应跳到登录页");
assert.equal(shouldRedirectToLogin(false, true, false), false, "公开路由不应要求登录");
assert.equal(shouldSkipUnauthorizedRefresh(true, false), true, "开发免登录且无 Token 时不应刷新或跳转登录");
assert.equal(shouldSkipUnauthorizedRefresh(true, true), false, "开发模式存在 Token 时仍按真实会话处理");
assert.equal(shouldSkipUnauthorizedRefresh(false, false), false, "正式模式仍执行正常 401 会话处理");
assert.equal(getFallbackRole(true, false), "super_admin", "开发免登录且无 Token 时使用预览管理员");
assert.equal(getFallbackRole(true, true), "party_member", "有 Token 但缺少角色缓存时按普通成员回退");
assert.equal(getFallbackRole(false, false), "party_member", "正式环境始终按最低权限回退");

const fence = new SessionFence();
const pendingRefresh = fence.capture("refresh-a");
assert.equal(fence.isCurrent(pendingRefresh, "refresh-a"), true);
fence.advance(); // 登出或重新登录
assert.equal(fence.isCurrent(pendingRefresh, "refresh-a"), false, "登出后旧刷新响应应失效");

const currentRefresh = fence.capture("refresh-b");
assert.equal(fence.same(currentRefresh, fence.capture("refresh-b")), true, "同一会话的并发刷新应合并");
assert.equal(fence.same(currentRefresh, fence.capture("refresh-c")), false, "新会话不应复用旧刷新请求");
fence.advance(); // 刷新成功后轮换 Token
assert.equal(fence.isCurrent(currentRefresh, "refresh-b"), false, "刷新成功后旧快照应失效");
console.log("权限矩阵校验通过");
