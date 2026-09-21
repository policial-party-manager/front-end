/** 系统角色；activist 仅为兼容现有 Mock 页面，登录接口不会返回该角色。 */
export type Role = "super_admin" | "party_secretary" | "party_member" | "activist";

/** 页面级权限标识。 */
export type Permission =
  | "home:view"
  | "content:view"
  | "member:manage"
  | "development:manage"
  | "activity:view"
  | "activity:manage"
  | "statistics:view"
  | "resource:view";

const commonPermissions = ["home:view", "content:view", "activity:view", "resource:view"] as const;
const managerPermissions = [
  ...commonPermissions,
  "member:manage",
  "development:manage",
  "activity:manage",
  "statistics:view",
] as const;

/**
 * 前端页面权限矩阵。
 * 这里只负责隐藏入口和拦截路由，最终数据范围与操作权限仍由后端校验。
 */
export const rolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: managerPermissions,
  party_secretary: managerPermissions,
  party_member: commonPermissions,
  activist: commonPermissions,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(rolePermissions, value);
}

/** 后端角色编码转换为前端角色；未知编码按最低权限角色处理。 */
export function roleFromBackend(role: string): Role {
  const roleMap: Record<string, Role> = {
    super_admin: "super_admin",
    branch_admin: "party_secretary",
    student: "party_member",
  };
  return roleMap[role] || "party_member";
}
