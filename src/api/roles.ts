import { del, get, post, put } from "@/api/request";

/** 角色视图对象：角色 + 已分配权限名 + 使用人数。 */
export interface RoleVo {
  id: number;
  roleCode: string;
  description: string | null;
  permissions: string[];
  userCount: number;
}

/** 角色新增/编辑请求体；roleCode 新增必填，编辑可空表示沿用原名。 */
export interface RoleSaveRequest {
  roleCode?: string;
  description?: string;
  permissionNames?: string[];
}

export const listRoles = () => get<RoleVo[]>("/v4/admin/roles");
export const getRole = (id: number) => get<RoleVo>(`/v4/admin/roles/${id}`);
export const createRole = (data: RoleSaveRequest) => post<void>("/v4/admin/roles", data);
export const updateRole = (id: number, data: RoleSaveRequest) => put<void>(`/v4/admin/roles/${id}`, data);
export const deleteRole = (id: number) => del<void>(`/v4/admin/roles/${id}`);
/** 全量覆盖该角色的权限名；传空数组等于清空。 */
export const assignRolePermissions = (id: number, permissionNames: string[]) =>
  put<void>(`/v4/admin/roles/${id}/permissions`, { permissionNames });
/** 内置权限点字典（当前后端为角色级鉴权，该映射用于维护/预留）。 */
export const listPermissionNames = () => get<string[]>("/v4/admin/roles/permission-names");
