import { del, get, post } from "@/api/request";

/**
 * 培养联系人指派/移除与培养材料上传/登记/软删除（后端 `CultivationController`，只读核对）。
 *
 * 两个资源都在 `/v4/members/{userId}` 下，共用 `BranchScopeService.requireManageableUser`：
 * 越权与真不存在同为「用户不存在」，调用方原样转达，不改写成「无权限」。
 *
 * 培养联系人（`MentorServiceImpl`）：
 * - `GET /mentors` 返回 `MentorView{mentorId, realName, username}`，只有这三个字段。
 * - `POST /mentors` 请求体只有 `{ mentorId }`；已存在则**幂等**返回 200，不报错。
 * - `DELETE /mentors/{mentorId}` 软删（`status=0`），不存在报「培养联系人不存在」。
 * - 服务端规则（前端一律不预判，只转达 400 原文）：
 *   同一被培养人最多 2 名在职联系人（超出报「每位成员最多设置 2 名培养联系人」）;
 *   联系人须为党员，读 `tb_identity.level >= 5`，未登记身份与身份不足报两条不同原文；
 *   不能指定本人（「不能指定本人为培养联系人」）。
 * - 培养联系人是**当前关系**，不是历史快照：换人后旧思想汇报展示的联系人也随之变化。
 * - `POST /mentors/batch` 与 `GET /mentees?mentorId=` 后端有，本模块不封装（无界面需求）。
 *
 * 培养材料（`CultivationMaterialServiceImpl`）：
 * - `GET /materials` 只返回 `status=1`，按 id 倒序。
 * - `POST /materials` 请求体 `{ materialType, file, fileName?, remark? }`，返回新建 id。
 *   `materialType` 只能是下表五个固定值（服务端用 `Set.of(...)` 拼接错误文案，**顺序不稳定**，
 *   因此下拉必须按这里声明的顺序渲染，不能照抄错误文案里的顺序）；
 *   `file` 必须以 `file:` 开头，所以**必须先调 `/v4/uploads` 上传再登记**，不能只填文件名。
 * - `DELETE /materials/{materialId}` 是软删除：记录与底层文件都保留，只是不再出现在列表里；
 *   记录不存在或已删报「材料不存在」。
 * - 后端没有材料下载端点（`LocalFileStorageServiceImpl` 只实现 `save()`，
 *   `WebMvcConfig` 未注册静态资源处理器），因此界面只展示元数据。
 */

/** 培养联系人视图（后端 `MentorServiceImpl.MentorView`）：只有这三个字段。 */
export interface MentorView {
  mentorId: number;
  realName: string | null;
  username: string | null;
}

/**
 * 材料类型的固定集合与**渲染顺序**。
 * 后端为 `Set.of("入党申请书","思想汇报","政审材料","培训证书","其他")`，迭代顺序不稳定，
 * 错误文案「材料类型不合法，可选：…」里的顺序也不能当作展示顺序。
 */
export const MATERIAL_TYPES = ["入党申请书", "思想汇报", "政审材料", "培训证书", "其他"] as const;

/** 备注长度上限，与后端 `@Size(max = 200)` 一致。 */
export const MATERIAL_REMARK_MAX = 200;

/** 培养材料（后端 `CultivationMaterial`）：`file` 是 `file:` 前缀内部路径，只展示不下载。 */
export interface MaterialView {
  id: number;
  userId: number;
  materialType: string | null;
  file: string | null;
  fileName: string | null;
  uploaderId: number | null;
  remark: string | null;
  status: number | null;
  createTime: string | null;
}

export interface MaterialCreateRequest {
  materialType: string;
  file: string;
  fileName?: string;
  remark?: string;
}

function isUsableId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** 当前在职培养联系人；空数组表示尚未设置。 */
export function listMemberMentors(userId: number): Promise<MentorView[]> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  return get<MentorView[]>(`/v4/members/${userId}/mentors`);
}

/**
 * 指派培养联系人。请求体精确为 `{ mentorId }`。
 * 重复指派幂等（200），是否已有 2 名、是否为党员、是否本人全部由服务端裁决。
 */
export function assignMemberMentor(userId: number, mentorId: number): Promise<void> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  if (!isUsableId(mentorId)) return Promise.reject(new Error("联系人编号不可用"));
  return post<void>(`/v4/members/${userId}/mentors`, { mentorId });
}

/** 移除培养联系人（服务端软删）。关系不存在时报「培养联系人不存在」。 */
export function removeMemberMentor(userId: number, mentorId: number): Promise<void> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  if (!isUsableId(mentorId)) return Promise.reject(new Error("联系人编号不可用"));
  return del<void>(`/v4/members/${userId}/mentors/${mentorId}`);
}

/** 培养材料列表（服务端已过滤 `status=1` 并按 id 倒序，前端不重复过滤）。 */
export function listMemberMaterials(userId: number): Promise<MaterialView[]> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  return get<MaterialView[]>(`/v4/members/${userId}/materials`);
}

/**
 * 登记培养材料，返回新建记录 id。
 *
 * 前置条件是先通过 `@/api/uploads` 的 `uploadFile(file, "material")` 拿到 `file:` 路径；
 * 前端在此再拦一次非法类型与缺前缀，只是为了不发必然失败的请求，服务端仍会校验。
 */
export function addMemberMaterial(userId: number, payload: MaterialCreateRequest): Promise<number> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  const materialType = typeof payload?.materialType === "string" ? payload.materialType.trim() : "";
  if (!(MATERIAL_TYPES as readonly string[]).includes(materialType)) return Promise.reject(new Error("请选择材料类型"));
  const file = typeof payload?.file === "string" ? payload.file.trim() : "";
  if (!file.startsWith("file:")) return Promise.reject(new Error("材料地址不可用，请重新上传文件"));
  if (typeof payload?.remark === "string" && payload.remark.length > MATERIAL_REMARK_MAX)
    return Promise.reject(new Error(`备注不能超过 ${MATERIAL_REMARK_MAX} 字`));
  const body: MaterialCreateRequest = { materialType, file };
  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
  if (fileName) body.fileName = fileName;
  if (typeof payload.remark === "string" && payload.remark.trim()) body.remark = payload.remark.trim();
  return post<number>(`/v4/members/${userId}/materials`, body);
}

/** 删除培养材料（软删除：记录与文件都保留，只是不再出现在列表）。 */
export function removeMemberMaterial(userId: number, materialId: number): Promise<void> {
  if (!isUsableId(userId)) return Promise.reject(new Error("成员编号不可用"));
  if (!isUsableId(materialId)) return Promise.reject(new Error("材料编号不可用"));
  return del<void>(`/v4/members/${userId}/materials/${materialId}`);
}
