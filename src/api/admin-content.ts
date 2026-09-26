import { del, get, post, put } from "@/api/request";
import type { ContentPage, ContentQuery } from "@/api/content";

export interface AdminNewsArticle {
  id: number;
  author: number;
  title: string;
  cover: string | null;
  type: string | null;
  status: 1 | 2;
  content: string;
  viewCount: number | null;
  createTime: string;
  updateTime: string | null;
}

export interface AdminNoticeArticle {
  id: number;
  title: string;
  content: string;
  status: 1 | 2 | 3;
  publisherId: number;
  publishTime: string;
  updateTime: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface AdminNewsQuery extends ContentQuery {
  type?: string;
  status?: 1 | 2;
}

export interface AdminNoticeQuery extends ContentQuery {
  status?: 1 | 2 | 3;
}

export interface AdminNewsPayload {
  title: string;
  cover: string | null;
  type: string | null;
  status: 1 | 2;
  content: string;
}

export interface AdminNoticePayload {
  title: string;
  content: string;
  status: 1 | 3;
  startTime: string | null;
  endTime: string | null;
}

export const pageAdminNews = (params: AdminNewsQuery) =>
  get<ContentPage<AdminNewsArticle>>("/v4/admin/news/page", params);
export const getAdminNews = (id: number) => get<AdminNewsArticle>(`/v4/admin/news/${id}`);
export const createAdminNews = (payload: AdminNewsPayload) => post<void>("/v4/admin/news", payload);
export const updateAdminNews = (id: number, payload: AdminNewsPayload) => put<void>(`/v4/admin/news/${id}`, payload);
export const deleteAdminNews = (id: number) => del<void>(`/v4/admin/news/${id}`);
export const updateAdminNewsStatus = (id: number, status: 1 | 2) =>
  put<void>(`/v4/admin/news/${id}/status`, undefined, { params: { status } });

export const pageAdminNotices = (params: AdminNoticeQuery) =>
  get<ContentPage<AdminNoticeArticle>>("/v4/admin/notices/page", params);
export const getAdminNotice = (id: number) => get<AdminNoticeArticle>(`/v4/admin/notices/${id}`);
export const createAdminNotice = (payload: AdminNoticePayload) => post<void>("/v4/admin/notices", payload);
export const updateAdminNotice = (id: number, payload: AdminNoticePayload) =>
  put<void>(`/v4/admin/notices/${id}`, payload);
export const deleteAdminNotice = (id: number) => del<void>(`/v4/admin/notices/${id}`);
export const publishAdminNotice = (id: number) => put<void>(`/v4/admin/notices/${id}/publish`);
