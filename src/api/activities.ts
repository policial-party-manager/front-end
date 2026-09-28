import { del, get, post, put } from "@/api/request";
import type { ContentPage } from "@/api/content";

export type ActivityStatus = 0 | 1 | 2;

export interface ActivityVo {
  id: number;
  branchId: number | null;
  branchName: string | null;
  title: string;
  description: string | null;
  type: number | null;
  typeName: string | null;
  cover: string | null;
  startTime: string | null;
  endTime: string | null;
  /** 地理范围 WKT；null 表示线上活动。 */
  location: string | null;
  locationDescription: string | null;
  signStart: string | null;
  signEnd: string | null;
  maxParticipants: number | null;
  status: ActivityStatus | null;
  creatorId: number | null;
  createTime: string | null;
  updateTime: string | null;
}

export interface ActivitySaveRequest {
  branchId: number | null;
  title: string;
  description: string | null;
  type: number | null;
  cover: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  locationDescription: string | null;
  signStart: string | null;
  signEnd: string | null;
  maxParticipants: number | null;
  status: ActivityStatus;
}

export interface ActivityTypeOption {
  id: number;
  name: string;
  needSign?: number;
  countToFile?: number;
}

export interface ActivityBranchOption {
  id: number;
  branchName: string;
}

export interface ActivityQuery {
  page: number;
  size: number;
  keyword?: string;
  branchId?: number;
  type?: number;
  status?: ActivityStatus;
}

export type ActivityPage = ContentPage<ActivityVo>;

export const pageAdminActivities = (params: ActivityQuery) => get<ActivityPage>("/v4/admin/activities/page", params);
export const getAdminActivity = (id: number) => get<ActivityVo>("/v4/admin/activities/" + id);
export const createAdminActivity = (payload: ActivitySaveRequest) => post<void>("/v4/admin/activities", payload);
export const updateAdminActivity = (id: number, payload: ActivitySaveRequest) =>
  put<void>("/v4/admin/activities/" + id, payload);
export const deleteAdminActivity = (id: number) => del<void>("/v4/admin/activities/" + id);
export const updateAdminActivityStatus = (id: number, status: ActivityStatus) =>
  put<void>("/v4/admin/activities/" + id + "/status", undefined, { params: { status } });
export const listAdminActivityTypes = () => get<ActivityTypeOption[]>("/v4/admin/activity-types");
export const listPublishedActivityTypes = () => get<ActivityTypeOption[]>("/v2/content/activity-types");

export const pagePublishedActivities = (params: Omit<ActivityQuery, "status">) =>
  get<ActivityPage>("/v2/content/activities/page", params);
export const getPublishedActivity = (id: number) => get<ActivityVo>("/v2/content/activities/" + id);
