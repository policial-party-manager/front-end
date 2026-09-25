import { get } from "@/api/request";

export interface ContentPage<T> {
  records: T[];
  total: number;
  page: number;
  size: number;
}

export interface NewsArticle {
  id: number;
  title: string;
  cover: string | null;
  type: string | null;
  content: string;
  viewCount: number | null;
  createTime: string;
}

export interface NoticeArticle {
  id: number;
  title: string;
  content: string;
  publishTime: string;
  startTime: string | null;
  endTime: string | null;
}

export interface ContentQuery {
  page: number;
  size: number;
  keyword?: string;
}

export const pageNews = (params: ContentQuery) => get<ContentPage<NewsArticle>>("/v2/content/news/page", params);
export const pageNotices = (params: ContentQuery) =>
  get<ContentPage<NoticeArticle>>("/v2/content/notices/page", params);
export const getNews = (id: number) => get<NewsArticle>(`/v2/content/news/${id}`);
export const getNotice = (id: number) => get<NoticeArticle>(`/v2/content/notices/${id}`);
