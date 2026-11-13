import { get, post, put } from "@/api/request";

export interface UserVo {
  id: number;
  username: string;
  realName: string | null;
  studentId: string | null;
  gender: string | null;
  college: string | null;
  grade: string | null;
  major: string | null;
  className: string | null;
  branchId: number | null;
  branchName: string | null;
  roleId: number | null;
  role: string | null;
  identityId: number | null;
  identityName: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  remark: string | null;
  status: number;
  createTime: string | null;
  lastLoginTime: string | null;
}

export interface UserSaveRequest {
  username?: string;
  realName: string;
  studentId: string;
  gender: string;
  college: string;
  grade: string;
  major: string;
  className: string;
  branchId: number | null;
  roleId: number | null;
  phone: string;
  email: string;
  contactPerson: string;
  remark: string;
}

export interface MemberFilters {
  keyword?: string;
  branchId?: number;
  roleId?: number;
  status?: number;
}

/** 更新只允许显式可编辑字段；关联省略表示保留，不能通过 null 解除。 */
export interface UserUpdateRequest {
  gender: string;
  grade: string;
  major: string;
  phone: string;
  email: string;
  contactPerson: string;
  remark: string;
  branchId?: number;
  roleId?: number;
}
export interface IdentityMemberFilters {
  identityId?: number;
  status: 1 | 2;
}
export interface IdentityOption {
  id: number;
  identityName: string;
}
export interface BatchResult {
  total: number;
  successCount: number;
  failCount: number;
  errors: { id: number; reason: string }[];
}
export const pageIdentityMembers = (params: IdentityMemberFilters & { page: number; size: number }) =>
  get<{ records: UserVo[]; total: number }>("/v4/members/page", params);
export const exportMembers = (params: IdentityMemberFilters) =>
  get<Blob>("/v4/members/export", params, { responseType: "blob" });
export const pageIdentities = (page: number, size: number) =>
  get<{ records: IdentityOption[]; total: number }>("/v2/content/identities/page", { page, size });
export const batchMemberStatus = (ids: number[], status: 1 | 2) =>
  post<BatchResult>("/v4/admin/users/batch/status", { ids, status });
export const batchMemberBranch = (ids: number[], branchId: number) =>
  post<BatchResult>("/v4/admin/users/batch/branch", { ids, branchId });

/** 正常状态支部下拉项；成员筛选与导入前名称核对共用。 */
export interface BranchOption {
  id: number;
  branchName: string;
}

export interface ImportResult {
  total: number;
  successCount: number;
  failCount: number;
  errors: { row: number; reason: string }[];
}

export const pageMembers = (params: MemberFilters & { page: number; size: number }) =>
  get<{ records: UserVo[]; total: number }>("/v4/admin/users/page", params);
export const getMember = (id: number) => get<UserVo>(`/v4/admin/users/${id}`);
export const createMember = (data: UserSaveRequest) => post<void>("/v4/admin/users", data);
export const updateMember = (id: number, data: UserUpdateRequest) => put<void>(`/v4/admin/users/${id}`, data);
export const updateMemberStatus = (id: number, status: number) =>
  put<void>(`/v4/admin/users/${id}/status`, undefined, { params: { status } });
export const listBranches = () => get<BranchOption[]>("/v4/admin/branches/options");
export const listRoles = () => get<{ id: number; roleCode: string }[]>("/v4/admin/roles");
export const downloadMemberTemplate = () => get<Blob>("/v4/admin/users/template", undefined, { responseType: "blob" });
export const importMembers = (file: File, onProgress: (percent: number) => void) => {
  const data = new FormData();
  data.append("file", file);
  return post<ImportResult>("/v4/admin/users/import", data, {
    timeout: 60000,
    onUploadProgress: (event) => {
      if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
};
