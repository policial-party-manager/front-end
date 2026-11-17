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
  /** 发展阶段（1–6），后端 `tb_identity.level`；字典按它升序，展示层需要时据此排序。 */
  level?: number | null;
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

/**
 * 支委工作台（`/members/branch`）使用的范围接口。
 *
 * 后端 `ScopedMemberServiceImpl` 只按操作者范围过滤，不查支部表与身份表，
 * 因此 `branchName`、`identityName` 恒为 null，页面需自行降级展示。
 * `status` 缺省等于「仅启用」，显式传 2 才查询停用成员。
 */
export interface BranchMemberFilters {
  keyword?: string;
  status?: 1 | 2;
}

/** 部分更新语义：字段省略表示不动，空串表示清空；不能用 null 表示清空。 */
export interface ContactUpdateRequest {
  phone?: string;
  email?: string;
  remark?: string;
}

export const getScopedMember = (id: number) => get<UserVo>(`/v4/members/${id}`);
export const updateScopedContact = (id: number, data: ContactUpdateRequest) =>
  put<void>(`/v4/members/${id}/contact`, data);
/**
 * 支委工作台的成员分页。
 *
 * 复用 `pageIdentityMembers` 的 URL 与响应形状，只把 `status` 放宽为可选：
 * 身份查询必须显式给 1/2，支委工作台不传即表示「仅启用」。
 */
export const pageBranchMembers = (
  params: Omit<IdentityMemberFilters, "status"> & BranchMemberFilters & { page: number; size: number },
) => pageIdentityMembers(params as IdentityMemberFilters & { page: number; size: number });
/** 支委工作台导出；同样只放宽 `status` 可选性，不复制 URL 与 responseType。 */
export const exportBranchMembers = (params: Omit<IdentityMemberFilters, "status"> & BranchMemberFilters) =>
  exportMembers(params as IdentityMemberFilters);
export const pageIdentities = (page: number, size: number) =>
  get<{ records: IdentityOption[]; total: number }>("/v2/content/identities/page", { page, size });

/** 身份字典单页上限；`/v2/content/identities/page` 只有 `page`/`size`，没有关键词过滤。 */
export const IDENTITY_DICTIONARY_PAGE_SIZE = 100;
/** 字典最多翻 20 页 × 100 条；真要超出时明确降级，不静默截断成“字典就这么多”。 */
export const IDENTITY_DICTIONARY_MAX_PAGES = 20;

/**
 * 拉全政治身份字典（分页循环），按 `level` 升序、同 `level` 按编号升序，保证下拉顺序稳定。
 *
 * `isCancelled` 在每次响应后检查：换号、换目标成员或关闭弹窗后旧响应不写回调用方，
 * 此时返回 `cancelled: true`，调用方直接放弃本次结果。
 * 响应形状异常（`records` 非数组、`total` 非自然数）直接抛错，不用本地兜底列表冒充字典。
 */
export async function loadAllIdentities(
  isCancelled?: () => boolean,
): Promise<{ records: IdentityOption[]; truncated: boolean; cancelled: boolean }> {
  const values: IdentityOption[] = [];
  let truncated = false;
  for (let next = 1; next <= IDENTITY_DICTIONARY_MAX_PAGES; next++) {
    const result = await pageIdentities(next, IDENTITY_DICTIONARY_PAGE_SIZE);
    if (isCancelled?.()) return { records: [], truncated: false, cancelled: true };
    if (!Array.isArray(result?.records) || !Number.isSafeInteger(result.total) || result.total < 0)
      throw new Error("身份字典响应异常");
    values.push(...result.records);
    if (values.length >= result.total) break;
    // 服务端提前翻空但 total 还没取满：说明字典不可信，按异常处理而不是当成拉全了。
    if (!result.records.length) throw new Error("身份字典分页不完整");
    if (next === IDENTITY_DICTIONARY_MAX_PAGES) truncated = true;
  }
  const sorted = [...values].sort(compareIdentityLevel);
  return { records: sorted, truncated, cancelled: false };
}

/** 阶段未知的条目排在最后，不假设默认阶段。 */
function compareIdentityLevel(a: IdentityOption, b: IdentityOption): number {
  const left = Number.isFinite(a.level as number) ? (a.level as number) : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(b.level as number) ? (b.level as number) : Number.MAX_SAFE_INTEGER;
  return left === right ? a.id - b.id : left - right;
}
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
