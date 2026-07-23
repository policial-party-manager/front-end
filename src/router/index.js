import { createRouter, createWebHistory } from 'vue-router'

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
  // {
  //   path: '/members',
  //   name: 'Members',
  //   component: () => import('@/views/members.vue'),
  //   meta: { title: '成员管理' },
  // },
  // {
  //   path: '/development',
  //   name: 'Development',
  //   component: () => import('@/views/development.vue'),
  //   meta: { title: '党员发展' },
  // },
  // {
  //   path: '/activities',
  //   name: 'Activities',
  //   component: () => import('@/views/activities.vue'),
  //   meta: { title: '活动中心' },
  // },
  // {
  //   path: '/statistics',
  //   name: 'Statistics',
  //   component: () => import('@/views/statistics.vue'),
  //   meta: { title: '数据统计' },
  // },
  // {
  //   path: '/downloads',
  //   name: 'Downloads',
  //   component: () => import('@/views/downloads.vue'),
  //   meta: { title: '下载专区' },
  // },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫：设置页面标题
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || '党建云平台'
  next()
})

export default router
