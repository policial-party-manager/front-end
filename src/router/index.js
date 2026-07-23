import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '@/stores/app'

/**
 * 路由配置
 * 首页路径为 /
 * 其他页面路由预留，后续扩展时取消注释即可
 */
const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/index.vue'),
    meta: { title: '首页 - 党建云平台' },
  },
  {
    path: '/members',
    name: 'Members',
    component: () => import('@/views/members.vue'),
    meta: { title: '成员管理 - 党建云平台' },
  },
  {
    path: '/development',
    name: 'Development',
    component: () => import('@/views/development.vue'),
    meta: { title: '党员发展 - 党建云平台' },
  },
  {
    path: '/development/member/:id',
    name: 'MemberDetail',
    component: () => import('@/views/development/MemberDetail.vue'),
    meta: { title: '成员培养详情 - 党建云平台' },
  },
  {
    path: '/development/batch',
    name: 'BatchAdjust',
    component: () => import('@/views/development/BatchAdjust.vue'),
    meta: { title: '批量调整身份 - 党建云平台' },
  },
  {
    path: '/activities',
    name: 'Activities',
    component: () => import('@/views/activities.vue'),
    meta: { title: '活动中心 - 党建云平台' },
  },
  {
    path: '/statistics',
    name: 'Statistics',
    component: () => import('@/views/statistics.vue'),
    meta: { title: '数据统计 - 党建云平台' },
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: () => import('@/views/downloads.vue'),
    meta: { title: '下载专区 - 党建云平台' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫：设置页面标题 + 同步导航高亮状态
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || '党建云平台'

  // 同步 TopNav 导航高亮：根据当前路径设置 activeNav
  const store = useAppStore()
  const pathKeyMap = {
    '/': 'home',
    '/members': 'members',
    '/development': 'development',
    '/activities': 'activities',
    '/statistics': 'statistics',
    '/downloads': 'downloads',
  }
  // 支持子路由匹配（如 /development/member/:id 也高亮 "党员发展"）
  const matchedKey = pathKeyMap[to.path] || pathKeyMap['/' + to.path.split('/')[1]] || 'home'
  store.setActiveNav(matchedKey)

  next()
})

export default router
