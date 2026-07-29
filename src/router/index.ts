import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAppStore } from "@/stores/app";

/**
 * 路由配置
 * 首页路径为 /
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Home",
    component: () => import("@/views/index.vue"),
    meta: { title: "首页 - 党建云平台" },
  },
  {
    path: "/members",
    name: "Members",
    component: () => import("@/views/members.vue"),
    meta: { title: "成员管理 - 党建云平台" },
  },
  {
    path: "/development",
    name: "Development",
    component: () => import("@/views/development.vue"),
    meta: { title: "党员发展 - 党建云平台" },
  },
  {
    path: "/development/member/:id",
    name: "MemberDetail",
    component: () => import("@/views/development/MemberDetail.vue"),
    meta: { title: "成员培养详情 - 党建云平台" },
  },
  {
    path: "/development/batch",
    name: "BatchAdjust",
    component: () => import("@/views/development/BatchAdjust.vue"),
    meta: { title: "批量调整身份 - 党建云平台" },
  },
  {
    path: "/news",
    name: "NewsList",
    component: () => import("@/views/news/NewsList.vue"),
    meta: { title: "党建新闻 - 党建云平台" },
  },
  {
    path: "/news/:id",
    name: "NewsDetail",
    component: () => import("@/views/ContentDetail.vue"),
    meta: { title: "新闻详情 - 党建云平台" },
  },
  {
    path: "/notice",
    name: "NoticeList",
    component: () => import("@/views/notice/NoticeList.vue"),
    meta: { title: "通知公告 - 党建云平台" },
  },
  {
    path: "/notice/:id",
    name: "NoticeDetail",
    component: () => import("@/views/ContentDetail.vue"),
    meta: { title: "公告详情 - 党建云平台" },
  },
  {
    path: "/activity",
    name: "Activities",
    component: () => import("@/views/activity/ActivityList.vue"),
    meta: { title: "活动管理 - 党建云平台" },
  },
  {
    path: "/activity/create",
    name: "ActivityCreate",
    component: () => import("@/views/activity/ActivityForm.vue"),
    meta: { title: "新建活动 - 党建云平台" },
  },
  {
    path: "/activity/edit/:id",
    name: "ActivityEdit",
    component: () => import("@/views/activity/ActivityForm.vue"),
    meta: { title: "编辑活动 - 党建云平台" },
  },
  {
    path: "/activity/:id",
    name: "ActivityDetail",
    component: () => import("@/views/activity/ActivityDetail.vue"),
    meta: { title: "活动详情 - 党建云平台" },
  },
  {
    path: "/statistics",
    name: "Statistics",
    component: () => import("@/views/statistics.vue"),
    meta: { title: "数据统计 - 党建云平台" },
  },
  {
    path: "/resources",
    name: "Resources",
    component: () => import("@/views/resources/index.vue"),
    meta: { title: "下载专区 - 党建云平台" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：设置页面标题 + 同步导航高亮状态
router.beforeEach((to, _from, next) => {
  document.title = (to.meta.title as string) || "党建云平台";

  // 同步 TopNav 导航高亮：根据当前路径设置 activeNav
  const store = useAppStore();
  const pathKeyMap: Record<string, string> = {
    "/": "home",
    "/members": "members",
    "/development": "development",
    "/activity": "activities",
    "/statistics": "statistics",
    "/resources": "downloads",
  };
  // 支持子路由匹配（如 /development/member/:id 也高亮 "党员发展"）
  const matchedKey = pathKeyMap[to.path] || pathKeyMap["/" + to.path.split("/")[1]] || "home";
  store.setActiveNav(matchedKey);

  next();
});

export default router;
