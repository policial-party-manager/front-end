import { del, get, post, put } from "@/api/request";

/** 支部视图对象。 */
export interface Branch {
  id: number;
  branchName: string;
  college: string;
  secretaryId: number | null;
  description: string;
  createTime: string | null;
  updateTime: string | null;
  status: number;
}

/** 支部列表筛选条件。 */
export interface BranchFilters {
  keyword?: string;
}

/** 支部新增/编辑请求体。 */
export interface BranchSaveRequest {
  branchName: string;
  college: string;
  description: string;
  secretaryId: number | null;
  status: number;
}

/** 支部列表分页响应。 */
export interface BranchPage {
  records: Branch[];
  total: number;
  page: number;
  size: number;
}

export const pageBranches = (params: BranchFilters & { page: number; size: number }) =>
  get<BranchPage>("/v4/admin/branches/page", params);
export const getBranch = (id: number) => get<Branch>(`/v4/admin/branches/${id}`);
export const createBranch = (data: BranchSaveRequest) => post<void>("/v4/admin/branches", data);
export const updateBranch = (id: number, data: BranchSaveRequest) => put<void>(`/v4/admin/branches/${id}`, data);
/** 软删除：后端将支部置为停用，不从列表移除。 */
export const deleteBranch = (id: number) => del<void>(`/v4/admin/branches/${id}`);

// TODO: 支部模板下载（GET /v4/admin/branches/template，responseType: "blob"，
//   参考 members.ts 的 downloadMemberTemplate）
// TODO: 支部 Excel 导入（POST /v4/admin/branches/import，multipart/form-data，
//   返回 ImportResult，参考 members.ts 的 importMembers）
