/**
 * 支部管理接口层
 *
 * 当前为 Mock 实现（issue #22 阶段 1）：函数内部返回占位数据，不发起网络请求。
 * 后端 `/v4/admin/branches/**` 的正式契约尚未确认，因此暂不引入 `@/api/request`；
 * 契约确认后，把每个函数体的 Mock 逻辑换成真实调用，并删除 mockBranches。
 *
 * 模板下载与 Excel 导入不在本阶段范围内，留待后续 PR。
 */

/** 支部视图对象。 */
export interface BranchVo {
  id: number;
  branchName: string;
  // TODO: 待后端契约确认：以下字段名为占位，尚未与后端字段对齐
  /** 占位：启用 1 / 停用 2，软删除后置为停用 */
  status: number;
  /** 占位：支部成员数 */
  memberCount: number;
  /** 占位：创建时间 */
  createTime: string | null;
  /** 占位：备注 */
  remark: string;
}

/** 支部列表筛选条件。 */
export interface BranchFilters {
  // TODO: 待后端契约确认：查询参数名与后端对齐
  keyword?: string;
  status?: number;
}

/** 支部新增/编辑请求体。 */
export interface BranchSaveRequest {
  branchName: string;
  // TODO: 待后端契约确认：以下字段名为占位
  status: number;
  remark: string;
}

/** 支部列表分页响应。 */
export interface BranchPage {
  records: BranchVo[];
  total: number;
}

/** Mock 数据源，仅供阶段 1 页面联调；接入真实接口后整体删除。 */
const mockBranches: BranchVo[] = [
  {
    id: 1,
    branchName: "计算机学院学生第一党支部",
    status: 1,
    memberCount: 32,
    createTime: "2026-03-01T09:00:00",
    remark: "",
  },
  {
    id: 2,
    branchName: "计算机学院学生第二党支部",
    status: 1,
    memberCount: 28,
    createTime: "2026-03-01T09:00:00",
    remark: "",
  },
  {
    id: 3,
    branchName: "软件学院学生党支部",
    status: 1,
    memberCount: 41,
    createTime: "2026-03-05T10:30:00",
    remark: "",
  },
  {
    id: 4,
    branchName: "网络空间安全学院学生党支部",
    status: 2,
    memberCount: 19,
    createTime: "2026-04-12T14:20:00",
    remark: "停用占位数据",
  },
  {
    id: 5,
    branchName: "人工智能学院学生党支部",
    status: 1,
    memberCount: 24,
    createTime: "2026-05-08T08:45:00",
    remark: "",
  },
];

/** Mock 模拟网络延迟，用于触发页面的加载状态；接入真实接口后删除。 */
const MOCK_DELAY = 300;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => window.setTimeout(() => resolve(value), MOCK_DELAY));

/** 生成与 mockBranches 一致的本地时间字符串（YYYY-MM-DDTHH:mm:ss），避免 toISOString 的 UTC 偏移。 */
const localDateTime = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hms = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${ymd}T${hms}`;
};

// TODO: 替换为真实 API 调用
export const pageBranches = (params: BranchFilters & { page: number; size: number }): Promise<BranchPage> => {
  const keyword = params.keyword?.trim();
  let list = mockBranches.slice();
  if (keyword) list = list.filter((item) => item.branchName.includes(keyword));
  if (params.status !== undefined) list = list.filter((item) => item.status === params.status);
  const start = (params.page - 1) * params.size;
  return delay({ records: list.slice(start, start + params.size), total: list.length });
};

// TODO: 替换为真实 API 调用
export const getBranch = (id: number): Promise<BranchVo> => {
  const target = mockBranches.find((item) => item.id === id);
  if (!target) return Promise.reject(new Error("支部不存在"));
  return delay({ ...target });
};

// TODO: 替换为真实 API 调用
export const createBranch = (data: BranchSaveRequest): Promise<void> => {
  const id = mockBranches.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  mockBranches.unshift({
    id,
    branchName: data.branchName,
    status: data.status,
    memberCount: 0,
    createTime: localDateTime(new Date()),
    remark: data.remark,
  });
  return delay(undefined);
};

// TODO: 替换为真实 API 调用
export const updateBranch = (id: number, data: BranchSaveRequest): Promise<void> => {
  const target = mockBranches.find((item) => item.id === id);
  if (target) {
    target.branchName = data.branchName;
    target.status = data.status;
    target.remark = data.remark;
  }
  return delay(undefined);
};

// TODO: 替换为真实 API 调用
export const deleteBranch = (id: number): Promise<void> => {
  const target = mockBranches.find((item) => item.id === id);
  if (target) target.status = 2;
  return delay(undefined);
};
