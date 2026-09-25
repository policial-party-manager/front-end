import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { ElMessage } from "element-plus";
import { useAppStore } from "@/stores/app";
import { shouldRedirectToLogin } from "@/config/auth-mode";
import { hasPermission, type Permission, type Role } from "@/config/permissions";
import { isDevSkipLoginEnabled } from "@/utils/authMode";

/**
 * 路由配置
 * 首页路径为 /
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/Login.vue"),
    meta: { title: "登录 - 党建云平台", public: true },
  },
  {
    path: "/",
    name: "Home",
    component: () => import("@/views/index.vue"),
    meta: { title: "首页 - 党建云平台", permission: "home:view" },
  },
  {
    path: "/members",
    name: "Members",
    component: () => import("@/views/members.vue"),
    meta: { title: "成员与支部 - 党建云平台", permission: "member:manage", roles: ["super_admin"] },
  },
  {
    path: "/members/branch",
    name: "BranchMembers",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: {
      title: "成员与支部 - 党建云平台",
      permission: "member:manage",
      roles: ["party_secretary"],
      placeholder: "branch",
    },
  },
  {
    path: "/branches",
    name: "Branches",
    component: () => import("@/views/branches.vue"),
    meta: { title: "支部管理 - 党建云平台", permission: "member:manage", roles: ["super_admin"] },
  },
  {
    path: "/development",
    name: "Development",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "党员发展 - 党建云平台", permission: "development:manage" },
  },
  {
    path: "/development/member/:id",
    name: "MemberDetail",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "成员培养详情 - 党建云平台", permission: "development:manage" },
  },
  {
    path: "/development/batch",
    name: "BatchAdjust",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "批量调整身份 - 党建云平台", permission: "development:manage" },
  },
  {
    path: "/my-development",
    name: "MyDevelopment",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "我的培养 - 党建云平台", permission: "home:view", roles: ["party_member", "activist"] },
  },
  {
    path: "/content",
    name: "Content",
    component: () => import("@/views/content/ContentHub.vue"),
    meta: { title: "资讯公告 - 党建云平台", permission: "content:view" },
  },
  {
    path: "/news",
    name: "NewsList",
    component: () => import("@/views/content/ContentList.vue"),
    meta: { title: "党建新闻 - 党建云平台", permission: "content:view" },
  },
  {
    path: "/news/:id",
    name: "NewsDetail",
    component: () => import("@/views/content/ContentArticle.vue"),
    meta: { title: "新闻详情 - 党建云平台", permission: "content:view" },
  },
  {
    path: "/notice",
    name: "NoticeList",
    component: () => import("@/views/content/ContentList.vue"),
    meta: { title: "通知公告 - 党建云平台", permission: "content:view" },
  },
  {
    path: "/notice/:id",
    name: "NoticeDetail",
    component: () => import("@/views/content/ContentArticle.vue"),
    meta: { title: "公告详情 - 党建云平台", permission: "content:view" },
  },
  {
    path: "/activity",
    name: "Activities",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "活动管理 - 党建云平台", permission: "activity:view" },
  },
  {
    path: "/activity/create",
    name: "ActivityCreate",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "新建活动 - 党建云平台", permission: "activity:manage" },
  },
  {
    path: "/activity/edit/:id",
    name: "ActivityEdit",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "编辑活动 - 党建云平台", permission: "activity:manage" },
  },
  {
    path: "/activity/:id",
    name: "ActivityDetail",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "活动详情 - 党建云平台", permission: "activity:view" },
  },
  {
    path: "/statistics",
    name: "Statistics",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "数据统计 - 党建云平台", permission: "statistics:view" },
  },
  {
    path: "/resources",
    name: "Resources",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "资源中心 - 党建云平台", permission: "resource:view" },
  },
  {
    path: "/system",
    name: "System",
    component: () => import("@/views/WorkspacePlaceholder.vue"),
    meta: { title: "系统管理 - 党建云平台", permission: "home:view", roles: ["super_admin"] },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/views/profile/index.vue"),
    meta: { title: "个人中心 - 党建云平台", permission: "home:view" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：设置页面标题 + 同步导航高亮状态 + 登录态控制
router.beforeEach((to, _from, next) => {
  const store = useAppStore();

  // 开发免登录模式可直接访问页面；正常模式下保护所有非公开路由。
  if (shouldRedirectToLogin(isDevSkipLoginEnabled, !!to.meta.public, store.isLoggedIn)) {
    next({ path: "/login", replace: true });
    return;
  }

  document.title = (to.meta.title as string) || "党建云平台";

  // 登录页不参与导航高亮，直接放行
  if (to.meta.public) {
    next();
    return;
  }

  const permission = to.meta.permission as Permission | undefined;
  const allowedRoles = to.meta.roles as Role[] | undefined;
  if (
    !permission ||
    !hasPermission(store.currentRole, permission) ||
    (allowedRoles && !allowedRoles.includes(store.currentRole))
  ) {
    ElMessage.warning("当前身份无权访问该页面");
    next({ path: "/", replace: true });
    return;
  }

  // 根据当前路径同步侧栏高亮
  const pathKeyMap: Record<string, string> = {
    "/": "home",
    "/members": "members",
    "/branches": "branch",
    "/my-development": "development",
    "/development": "development",
    "/activity": "activities",
    "/content": "content",
    "/news": "content",
    "/notice": "content",
    "/statistics": "statistics",
    "/resources": "resources",
    "/system": "system",
    "/profile": "profile",
  };
  // 支持子路由匹配（如 /development/member/:id 也高亮 "党员发展"）
  const matchedKey = pathKeyMap[to.path] || pathKeyMap["/" + to.path.split("/")[1]] || "home";
  store.setActiveNav(matchedKey);

  next();
});

export default router;
