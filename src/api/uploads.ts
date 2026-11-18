import { post } from "@/api/request";

/**
 * 通用附件上传：`POST /v4/uploads`（后端 `UploadController` + `LocalFileStorageServiceImpl`，只读核对）。
 *
 * - 字段名固定 `file`（multipart），另有 `category`。
 * - **培养材料必须显式传 `category=material`**：后端是 `@RequestParam(defaultValue = "thought")`，
 *   漏传虽然照样 200，文件却落进 `thought/` 目录，分类错位且事后无法从路径反推。
 * - 分类白名单只有 `thought` / `material`，其他值报「不支持的上传分类」。
 * - 扩展名白名单 `pdf/doc/docx/jpg/jpeg/png/zip`，单文件 ≤10 MB
 *   （`application.yaml` 的 `spring.servlet.multipart.max-file-size`，请求整体上限 12 MB）。
 * - 返回 `file:` 前缀相对路径（`file:material/yyyy/MM/uuid.ext`），登记材料时原样回传。
 * - 后端没有下载端点，也没有删除端点：本模块只负责上传，不提供预览、下载或撤销。
 *   前端预检只做文件级检查（扩展名、大小、非空），不做内容解析，最终判定在服务端。
 */

export const UPLOAD_ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "zip"] as const;

/** 后端单文件上限 10 MB。 */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** `<input type="file" accept>` 用值，与白名单同源，避免两处枚举漂移。 */
export const UPLOAD_ACCEPT = UPLOAD_ALLOWED_EXTENSIONS.map((extension) => "." + extension).join(",");

export type UploadCategory = "thought" | "material";

export interface UploadResult {
  /** `file:` 前缀相对路径，登记材料时原样带回。 */
  url: string;
  originalName: string | null;
  size: number | null;
}

/**
 * 文件级预检：返回不通过的原因，通过时返回 `null`。
 * 调用方据此给出字段级提示并且**不发请求**，避免把明显非法的文件送到服务端。
 */
export function validateUploadFile(file: File): string | null {
  const name = file.name ?? "";
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!(UPLOAD_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return `仅支持 ${UPLOAD_ALLOWED_EXTENSIONS.join("/")} 格式的文件`;
  }
  if (file.size === 0) return "文件内容为空，请重新选择";
  if (file.size > UPLOAD_MAX_BYTES) return `文件不能超过 ${UPLOAD_MAX_BYTES / 1024 / 1024} MB`;
  return null;
}

/**
 * 上传附件并返回服务端 `file:` 路径。
 *
 * `category` 由调用方显式给出（培养材料传 `"material"`），本模块不提供默认值——
 * 默认值一旦落在这里，调用方漏传就会静默写错目录。
 */
export function uploadFile(
  file: File,
  category: UploadCategory,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const invalid = validateUploadFile(file);
  if (invalid) return Promise.reject(new Error(invalid));

  const data = new FormData();
  data.append("file", file);
  data.append("category", category);

  return post<UploadResult>("/v4/uploads", data, {
    // 10 MB 文件在慢网络上可能超过默认 15 秒。
    timeout: 60000,
    onUploadProgress: (event) => {
      // total 可能为 0（浏览器未提供长度），此时不除零、也不报进度。
      if (!event.total) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress?.(Math.min(100, Math.max(0, percent)));
    },
  }).then((result) => {
    const url = typeof result?.url === "string" ? result.url.trim() : "";
    if (!url.startsWith("file:")) throw new Error("上传结果缺少文件地址");
    return { url, originalName: result.originalName ?? null, size: result.size ?? null };
  });
}
