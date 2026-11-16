import { del, get, post, put } from "@/api/request";
import type { ImportResult } from "@/api/members";

/** 支部导入与成员导入共用后端同一个 `ImportResult` DTO，这里只做类型复用，不复制结构。 */
export type { ImportResult };

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

/**
 * 支部新增/编辑请求体。
 * - secretaryId 表单编辑过程中允许为 null，提交前必须校验为真实用户的正数 ID；后端要求非空且该用户持有 branch_admin。
 * - status 仅创建时传 1（正常）；普通编辑不传，后端 updateBranch 不使用传入 status 修改状态。
 */
export interface BranchSaveRequest {
  branchName: string;
  college: string;
  description: string;
  secretaryId: number | null;
  status?: number;
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

/** 后端生成的支部导入模板（真实 xlsx），列：支部名称、所属学院、简介、书记用户id。 */
export const downloadBranchTemplate = () =>
  get<Blob>("/v4/admin/branches/template", undefined, { responseType: "blob" });
/** Excel 批量导入支部。
 * 返回结构复用成员导入的 `ImportResult`（后端同一个 DTO）；`errors[].row` 是 Excel 实际行号（表头为第 1 行）。
 * 后端导入路径不校验书记是否持有 branch_admin，前端不得比后端更严格。
 */
export const importBranches = (file: File, onProgress: (percent: number) => void) => {
  const data = new FormData();
  data.append("file", file);
  return post<ImportResult>("/v4/admin/branches/import", data, {
    timeout: 60000,
    onUploadProgress: (event) => {
      if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
};
