import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 全局应用状态管理
 *
 * 角色说明：
 * - super_admin: 超级管理员，可查看全部统计数据
 * - party_secretary: 党支部书记，可查看本支部数据
 * - party_member: 普通党员，仅查看个人相关数据
 * - activist: 积极分子，受限视图
 *
 * 角色切换入口在 TopNav 组件右上角用户下拉菜单中（仅UI预留，功能待实现）
 */
export const useAppStore = defineStore('app', () => {
  // ============ 当前角色 ============
  const currentRole = ref('super_admin')

  // 角色名称映射
  const roleLabels = {
    super_admin: '超级管理员',
    party_secretary: '党支部书记',
    party_member: '普通党员',
    activist: '积极分子',
  }

  const currentRoleLabel = computed(() => roleLabels[currentRole.value] || '未知角色')

  // ============ 当前激活的导航菜单 ============
  const activeNav = ref('home')

  // ============ Mock 统计数据 ============
  // 不同角色看到不同数据：
  // - 超级管理员：全平台数据
  // - 党支部书记：本支部数据（约为全平台的 1/3 ~ 1/2）
  // - 普通党员：个人相关数据（更少）
  const statData = computed(() => {
    const roleMap = {
      super_admin: {
        totalMembers: 156,
        activists: 48,
        developmentCandidates: 23,
        weeklyActivities: 8,
      },
      party_secretary: {
        totalMembers: 52,
        activists: 16,
        developmentCandidates: 8,
        weeklyActivities: 3,
      },
      party_member: {
        totalMembers: 28,
        activists: 5,
        developmentCandidates: 2,
        weeklyActivities: 2,
      },
      activist: {
        totalMembers: 0,
        activists: 1,
        developmentCandidates: 0,
        weeklyActivities: 1,
      },
    }
    return roleMap[currentRole.value] || roleMap.super_admin
  })

  // ============ 导航菜单项 ============
  const navItems = [
    { key: 'home', label: '首页', path: '/' },
    { key: 'members', label: '成员管理', path: '/members' },
    { key: 'development', label: '党员发展', path: '/development' },
    { key: 'activities', label: '活动中心', path: '/activities' },
    { key: 'statistics', label: '数据统计', path: '/statistics' },
    { key: 'downloads', label: '下载专区', path: '/downloads' },
  ]

  // ============ Mock 新闻数据 ============
  const newsList = ref([
    {
      id: 1,
      title: '习近平：在庆祝中国共产党成立105周年大会上的讲话',
      date: '2026-07-01',
    },
    {
      id: 2,
      title: '学校召开2026年党建工作会议 部署下半年重点工作',
      date: '2026-07-18',
    },
    {
      id: 3,
      title: '我院举办"学习二十大精神"主题党日活动',
      date: '2026-07-15',
    },
    {
      id: 4,
      title: '关于做好2026年度党员发展工作的通知',
      date: '2026-07-10',
    },
    {
      id: 5,
      title: '党支部标准化规范化建设经验交流会在京召开',
      date: '2026-07-05',
    },
    {
      id: 6,
      title: '2026年暑期大学生党员社会实践出征仪式举行',
      date: '2026-07-03',
    },
  ])

  // ============ Mock 通知公告 ============
  const noticeList = ref([
    {
      id: 1,
      title: '关于开展2026年第三季度思想汇报提交工作的通知',
      date: '2026-07-20',
    },
    {
      id: 2,
      title: '关于组织观看党风廉政教育专题片的通知',
      date: '2026-07-17',
    },
    {
      id: 3,
      title: '本周三下午党员活动室召开支部委员会会议',
      date: '2026-07-16',
    },
    {
      id: 4,
      title: '关于2026年上半年党费收缴情况的公示',
      date: '2026-07-12',
    },
    {
      id: 5,
      title: '转发：关于进一步加强高校基层党组织建设的意见',
      date: '2026-07-08',
    },
    {
      id: 6,
      title: '暑期社会实践优秀党员志愿者表彰名单公示',
      date: '2026-07-04',
    },
  ])

  // ============ 轮播图数据 ============
  const banners = ref([
    {
      id: 1,
      // 轮播图1：使用项目已有图片，替换建议：替换为党建宣传图
      image: new URL('@/assets/images/Carousel Images/1.jpg', import.meta.url).href,
      title: '不忘初心 牢记使命',
      subtitle: '深入学习贯彻习近平新时代中国特色社会主义思想',
    },
    {
      id: 2,
      // 轮播图2：使用项目已有图片，替换建议：替换为党建活动图
      image: new URL('@/assets/images/Carousel Images/2.jpg', import.meta.url).href,
      title: '党建引领 砥砺前行',
      subtitle: '全面推进党员发展全过程管理体系建设',
    },
    {
      id: 3,
      // 轮播图3：使用项目已有图片，替换建议：替换为学习教育图
      image: new URL('@/assets/images/Carousel Images/3.jpeg', import.meta.url).href,
      title: '凝心聚力 筑梦远航',
      subtitle: '加强高校基层党组织标准化规范化建设',
    },
  ])

  // ============ 快捷入口 ============
  const quickEntries = [
    { key: 'report', label: '思想汇报', icon: 'EditPen', color: '#C12C1F' },
    { key: 'download', label: '下载专区', icon: 'Download', color: '#E84646' },
    { key: 'school', label: '党校学习', icon: 'Reading', color: '#D4513A' },
    { key: 'archive', label: '培养档案', icon: 'FolderOpened', color: '#B8302A' },
  ]

  // ============ 用户信息（Mock） ============
  const userInfo = ref({
    name: '张书记',
    avatar: '',
    role: 'super_admin',
  })

  // ============ Actions ============
  function setActiveNav(key) {
    activeNav.value = key
  }

  function switchRole(role) {
    currentRole.value = role
    userInfo.value.role = role
  }

  return {
    currentRole,
    currentRoleLabel,
    roleLabels,
    activeNav,
    navItems,
    statData,
    newsList,
    noticeList,
    banners,
    quickEntries,
    userInfo,
    setActiveNav,
    switchRole,
  }
})
