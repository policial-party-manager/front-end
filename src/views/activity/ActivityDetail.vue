<script setup lang="ts">
/**
 * ActivityDetail.vue - 活动详情页
 *
 * 路由：/activity/:id
 *
 * 功能：
 *   - 活动基本信息展示
 *   - 三标签页：签到管理 / 报名列表 / 活动统计
 *   - 二维码签到（60 秒自动刷新）
 *   - 签到记录表格（筛选 + 分页）
 *   - ECharts 签到时间分布图
 *
 * 权限说明：
 *   - super_admin / party_secretary：全部标签页 + 操作按钮
 *   - party_member / activist：仅"签到管理"标签页（只读）
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import ActivityStatistics from '@/components/activity/ActivityStatistics.vue'
import {
  ArrowLeft,
  Edit,
  Delete,
  RefreshRight,
  Download,
  PictureFilled,
  CircleClose,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

// ============================================================
// 类型定义
// ============================================================
type ActivityType = '组织生活' | '主题党日' | '党课学习' | '二课活动' | '志愿服务' | '其他'
type ActivityStatus = '未开始' | '报名中' | '进行中' | '已结束' | '已归档'

interface ActivityDetail {
  id: number
  name: string
  type: ActivityType
  branch: string
  location: string
  description: string
  coverUrl: string
  activityStartTime: string
  activityEndTime: string
  signInStartTime: string
  signInEndTime: string
  status: ActivityStatus
  participantScope: 'all' | 'specified'
  specifiedIdentities: string[]
}

interface SignInRecord {
  id: number
  name: string
  studentId: string
  signInTime: string
  status: '已签到' | '未签到'
}

interface RegistrationRecord {
  id: number
  name: string
  studentId: string
  identity: string
  registrationTime: string
}

// ============================================================
// 角色权限
// ============================================================
const isSuperAdmin = computed(() => store.currentRole === 'super_admin')
const isSecretary = computed(() => store.currentRole === 'party_secretary')
const isAdmin = computed(() => isSuperAdmin.value || isSecretary.value)
const isRegularMember = computed(
  () => store.currentRole === 'party_member' || store.currentRole === 'activist'
)

// ============================================================
// 活动 ID & 数据加载
// ============================================================
const activityId = computed(() => Number(route.params.id))
const loading = ref(false)
const activity = ref<ActivityDetail | null>(null)

// ============================================================
// 颜色映射（与列表页保持一致）
// ============================================================
const activityTypeColorMap: Record<string, string> = {
  '组织生活': '#C12C1F',
  '主题党日': '#E6A23C',
  '党课学习': '#409EFF',
  '二课活动': '#67C23A',
  '志愿服务': '#E84646',
  '其他': '#909399',
}

const activityStatusColorMap: Record<string, string> = {
  '未开始': '#909399',
  '报名中': '#409EFF',
  '进行中': '#67C23A',
  '已结束': '#E6A23C',
  '已归档': '#909399',
}

const signInStatusColorMap: Record<string, string> = {
  '已签到': '#67C23A',
  '未签到': '#E6A23C',
}

const identityColorMap: Record<string, string> = {
  '入党申请人': '#909399',
  '积极分子': '#E6A23C',
  '发展对象': '#409EFF',
  '预备党员': '#67C23A',
  '正式党员': '#C12C1F',
}

// ============================================================
// Mock 活动详情数据
// TODO: 替换为真实 API 调用（GET /api/activity/:id）
// ============================================================
const mockDetailMap: Record<number, ActivityDetail> = {
  1: {
    id: 1,
    name: '学习贯彻党的二十届三中全会精神主题党日',
    type: '主题党日',
    branch: '计算机学院学生第一党支部',
    location: '学院楼A座301会议室',
    description: '深入学习贯彻党的二十届三中全会精神，结合学院党建工作实际，开展专题学习研讨。重点学习全会关于全面深化改革的重要论述，研讨如何将全会精神落实到学院党建和育人工作中。',
    coverUrl: '',
    activityStartTime: '2026-08-15 14:00:00',
    activityEndTime: '2026-08-15 16:30:00',
    signInStartTime: '2026-08-15 13:30:00',
    signInEndTime: '2026-08-15 17:00:00',
    status: '已结束',
    participantScope: 'all',
    specifiedIdentities: [],
  },
  2: {
    id: 2,
    name: '习近平新时代中国特色社会主义思想专题党课',
    type: '党课学习',
    branch: '计算机学院学生第一党支部',
    location: '学院楼C座阶梯教室101',
    description: '深入学习习近平新时代中国特色社会主义思想的核心要义和精神实质，增强"四个意识"、坚定"四个自信"、做到"两个维护"。',
    coverUrl: '',
    activityStartTime: '2026-08-20 09:00:00',
    activityEndTime: '2026-08-20 11:00:00',
    signInStartTime: '2026-08-20 08:30:00',
    signInEndTime: '2026-08-20 11:30:00',
    status: '报名中',
    participantScope: 'all',
    specifiedIdentities: [],
  },
  4: {
    id: 4,
    name: '社区志愿服务活动——关爱空巢老人',
    type: '志愿服务',
    branch: '软件学院学生党支部',
    location: '阳光社区服务中心',
    description: '组织党员和积极分子走进社区，为空巢老人提供生活照料、心理慰藉等志愿服务，弘扬尊老敬老传统美德。',
    coverUrl: '',
    activityStartTime: '2026-08-10 08:00:00',
    activityEndTime: '2026-08-10 12:00:00',
    signInStartTime: '2026-08-10 07:30:00',
    signInEndTime: '2026-08-10 12:30:00',
    status: '进行中',
    participantScope: 'specified',
    specifiedIdentities: ['积极分子', '发展对象', '预备党员', '正式党员'],
  },
  11: {
    id: 11,
    name: '学习党章党规组织生活会',
    type: '组织生活',
    branch: '计算机学院学生第一党支部',
    location: '学院楼B座201党员活动室',
    description: '围绕党章党规开展组织生活会，交流学习心得，查摆问题不足，开展批评与自我批评。',
    coverUrl: '',
    activityStartTime: '2026-08-12 15:00:00',
    activityEndTime: '2026-08-12 17:00:00',
    signInStartTime: '2026-08-12 14:30:00',
    signInEndTime: '2026-08-12 17:30:00',
    status: '进行中',
    participantScope: 'specified',
    specifiedIdentities: ['预备党员', '正式党员'],
  },
}

/** 生成默认 Mock 详情（ID 未命中时使用） */
function generateDefaultDetail(id: number): ActivityDetail {
  return {
    id,
    name: `活动详情 #${id}`,
    type: '主题党日',
    branch: '计算机学院学生第一党支部',
    location: '学院楼会议室',
    description: '这是一条通过 Mock 生成的默认活动数据。实际项目中此处由后端接口返回。',
    coverUrl: '',
    activityStartTime: '2026-09-20 14:00:00',
    activityEndTime: '2026-09-20 16:00:00',
    signInStartTime: '2026-09-20 13:30:00',
    signInEndTime: '2026-09-20 16:30:00',
    status: '未开始',
    participantScope: 'all',
    specifiedIdentities: [],
  }
}

// ============================================================
// Mock 签到记录
// TODO: 替换为真实 API 调用
// ============================================================
function generateSignInRecords(act: ActivityDetail): SignInRecord[] {
  const allRecords: SignInRecord[] = [
    { id: 1,  name: '张明',   studentId: '20230101001', signInTime: '2026-08-15 13:35:22', status: '已签到' },
    { id: 2,  name: '李娟',   studentId: '20230101002', signInTime: '2026-08-15 13:38:15', status: '已签到' },
    { id: 3,  name: '王磊',   studentId: '20230101003', signInTime: '2026-08-15 13:42:08', status: '已签到' },
    { id: 4,  name: '赵婷',   studentId: '20230101004', signInTime: '2026-08-15 13:45:33', status: '已签到' },
    { id: 5,  name: '孙浩',   studentId: '20230101005', signInTime: '2026-08-15 13:50:01', status: '已签到' },
    { id: 6,  name: '周颖',   studentId: '20220201006', signInTime: '2026-08-15 13:52:44', status: '已签到' },
    { id: 7,  name: '吴强',   studentId: '20220201001', signInTime: '2026-08-15 13:55:19', status: '已签到' },
    { id: 8,  name: '郑雪',   studentId: '20220201002', signInTime: '2026-08-15 13:58:30', status: '已签到' },
    { id: 9,  name: '陈伟',   studentId: '20220201003', signInTime: '2026-08-15 14:02:11', status: '已签到' },
    { id: 10, name: '刘洋',   studentId: '20220201004', signInTime: '2026-08-15 14:05:47', status: '已签到' },
    { id: 11, name: '黄丽',   studentId: '20220201005', signInTime: '2026-08-15 14:08:23', status: '已签到' },
    { id: 12, name: '杨帆',   studentId: '20210101001', signInTime: '2026-08-15 14:12:05', status: '已签到' },
    { id: 13, name: '朱峰',   studentId: '20210101002', signInTime: '2026-08-15 14:15:38', status: '已签到' },
    { id: 14, name: '马丽',   studentId: '20210101003', signInTime: '2026-08-15 14:18:52', status: '已签到' },
    { id: 15, name: '胡涛',   studentId: '20210101004', signInTime: '2026-08-15 14:22:10', status: '已签到' },
    { id: 16, name: '林芳',   studentId: '20210101005', signInTime: '', status: '未签到' },
    { id: 17, name: '何军',   studentId: '20200101001', signInTime: '', status: '未签到' },
    { id: 18, name: '罗兰',   studentId: '20200101002', signInTime: '', status: '未签到' },
    { id: 19, name: '梁超',   studentId: '20200101003', signInTime: '', status: '未签到' },
    { id: 20, name: '宋雨',   studentId: '20200101004', signInTime: '', status: '未签到' },
  ]
  return allRecords
}

// ============================================================
// Mock 报名列表
// TODO: 替换为真实 API 调用
// ============================================================
function generateRegistrationRecords(): RegistrationRecord[] {
  return [
    { id: 1,  name: '张明', studentId: '20230101001', identity: '发展对象', registrationTime: '2026-08-10 09:15:00' },
    { id: 2,  name: '李娟', studentId: '20230101002', identity: '积极分子', registrationTime: '2026-08-10 09:22:00' },
    { id: 3,  name: '王磊', studentId: '20230101003', identity: '预备党员', registrationTime: '2026-08-10 10:05:00' },
    { id: 4,  name: '赵婷', studentId: '20230101004', identity: '入党申请人', registrationTime: '2026-08-10 10:18:00' },
    { id: 5,  name: '孙浩', studentId: '20230101005', identity: '积极分子', registrationTime: '2026-08-10 11:30:00' },
    { id: 6,  name: '周颖', studentId: '20220201006', identity: '正式党员', registrationTime: '2026-08-10 14:00:00' },
    { id: 7,  name: '吴强', studentId: '20220201001', identity: '发展对象', registrationTime: '2026-08-10 14:45:00' },
    { id: 8,  name: '郑雪', studentId: '20220201002', identity: '积极分子', registrationTime: '2026-08-11 08:30:00' },
    { id: 9,  name: '陈伟', studentId: '20220201003', identity: '入党申请人', registrationTime: '2026-08-11 09:00:00' },
    { id: 10, name: '刘洋', studentId: '20220201004', identity: '正式党员', registrationTime: '2026-08-11 09:45:00' },
    { id: 11, name: '黄丽', studentId: '20220201005', identity: '积极分子', registrationTime: '2026-08-11 10:20:00' },
    { id: 12, name: '杨帆', studentId: '20210101001', identity: '发展对象', registrationTime: '2026-08-11 11:00:00' },
    { id: 13, name: '朱峰', studentId: '20210101002', identity: '预备党员', registrationTime: '2026-08-11 14:30:00' },
    { id: 14, name: '马丽', studentId: '20210101003', identity: '入党申请人', registrationTime: '2026-08-11 15:15:00' },
    { id: 15, name: '胡涛', studentId: '20210101004', identity: '预备党员', registrationTime: '2026-08-12 08:00:00' },
    { id: 16, name: '林芳', studentId: '20210101005', identity: '正式党员', registrationTime: '2026-08-12 08:45:00' },
    { id: 17, name: '何军', studentId: '20200101001', identity: '积极分子', registrationTime: '2026-08-12 09:30:00' },
    { id: 18, name: '罗兰', studentId: '20200101002', identity: '发展对象', registrationTime: '2026-08-12 10:15:00' },
    { id: 19, name: '梁超', studentId: '20200101003', identity: '入党申请人', registrationTime: '2026-08-12 11:00:00' },
    { id: 20, name: '宋雨', studentId: '20200101004', identity: '正式党员', registrationTime: '2026-08-12 14:00:00' },
    { id: 21, name: '唐明', studentId: '20230101006', identity: '积极分子', registrationTime: '2026-08-12 14:45:00' },
    { id: 22, name: '许婷', studentId: '20230101007', identity: '积极分子', registrationTime: '2026-08-12 15:30:00' },
    { id: 23, name: '秦汉', studentId: '20220201007', identity: '正式党员', registrationTime: '2026-08-12 16:15:00' },
    { id: 24, name: '韩冰', studentId: '20210101006', identity: '入党申请人', registrationTime: '2026-08-13 08:00:00' },
    { id: 25, name: '丁一', studentId: '20200101005', identity: '预备党员', registrationTime: '2026-08-13 09:00:00' },
  ]
}

// ============================================================
// 参与范围文本
// ============================================================
const participantScopeText = computed(() => {
  if (!activity.value) return ''
  if (activity.value.participantScope === 'all') return '全部成员'
  return activity.value.specifiedIdentities.join('、')
})

// ============================================================
// 加载活动详情
// ============================================================
const signInRecords = ref<SignInRecord[]>([])
const registrationRecords = ref<RegistrationRecord[]>([])

async function loadActivityDetail(): Promise<void> {
  loading.value = true
  try {
    // TODO: 替换为真实 API 调用
    // const res = await api.getActivityDetail(activityId.value)
    await new Promise(resolve => setTimeout(resolve, 350))

    const detail = mockDetailMap[activityId.value] || generateDefaultDetail(activityId.value)
    activity.value = detail

    // 加载关联数据
    signInRecords.value = generateSignInRecords(detail)
    registrationRecords.value = generateRegistrationRecords()

    // 根据 URL 参数设置初始 tab
    const tabParam = route.query.tab as string
    if (['sign', 'registration', 'statistics'].includes(tabParam)) {
      activeTab.value = tabParam as 'sign' | 'registration' | 'statistics'
    }
  } catch {
    ElMessage.error('加载活动详情失败')
    router.push('/activity')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadActivityDetail()
})

// ============================================================
// 标签页管理（URL 参数同步）
// ============================================================
type TabName = 'sign' | 'registration' | 'statistics'

const activeTab = ref<TabName>('sign')

/** 管理员可看的标签页 */
const adminTabs = [
  { name: 'sign' as TabName, label: '签到管理' },
  { name: 'registration' as TabName, label: '报名列表' },
  { name: 'statistics' as TabName, label: '活动统计' },
]

/** 普通成员可看的标签页（仅签到管理，只读） */
const memberTabs = [
  { name: 'sign' as TabName, label: '签到管理' },
]

const visibleTabs = computed(() => (isAdmin.value ? adminTabs : memberTabs))

function handleTabChange(name: TabName): void {
  router.replace({ query: { ...route.query, tab: name } })
}

// ============================================================
// 日期格式化
// ============================================================
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  return dateStr
}

function formatDateOnly(dateStr: string): string {
  if (!dateStr) return '-'
  return dateStr.split(' ')[0]
}

function formatTimeOnly(dateStr: string): string {
  if (!dateStr) return '-'
  return dateStr.split(' ')[1] || dateStr
}

// ============================================================
// 二维码签到
// ============================================================
const qrDataUrl = ref('')
const qrCountdown = ref(60)
const qrLoading = ref(false)
let qrTimer: ReturnType<typeof setInterval> | null = null

async function generateQRCode(): Promise<void> {
  if (!activity.value) return

  qrLoading.value = true
  try {
    const payload = JSON.stringify({
      activityId: activity.value.id,
      timestamp: Date.now(),
    })
    qrDataUrl.value = await QRCode.toDataURL(payload, {
      width: 220,
      margin: 2,
      color: { dark: '#C12C1F', light: '#FFFFFF' },
    })
    qrCountdown.value = 60
  } catch {
    ElMessage.error('二维码生成失败')
  } finally {
    qrLoading.value = false
  }
}

function startQRTimer(): void {
  stopQRTimer()
  qrTimer = setInterval(() => {
    qrCountdown.value--
    if (qrCountdown.value <= 0) {
      generateQRCode()
    }
  }, 1000)
}

function stopQRTimer(): void {
  if (qrTimer) {
    clearInterval(qrTimer)
    qrTimer = null
  }
}

function handleRefreshQR(): void {
  generateQRCode()
}

function handleCloseQR(): void {
  stopQRTimer()
  qrDataUrl.value = ''
  qrCountdown.value = 60
}

// 离开签到标签页时停止二维码倒计时
watch(activeTab, (tab) => {
  if (tab !== 'sign') {
    stopQRTimer()
  }
})

// ============================================================
// 签到记录筛选 & 分页
// ============================================================
const signFilterStatus = ref('')
const signCurrentPage = ref(1)
const signPageSize = ref(10)

const signStatusOptions = [
  { value: '', label: '全部' },
  { value: '已签到', label: '已签到' },
  { value: '未签到', label: '未签到' },
]

const filteredSignInRecords = computed(() => {
  let list = signInRecords.value
  if (signFilterStatus.value) {
    list = list.filter(r => r.status === signFilterStatus.value)
  }
  return list
})

const signTotalFiltered = computed(() => filteredSignInRecords.value.length)

const pagedSignInRecords = computed(() => {
  const start = (signCurrentPage.value - 1) * signPageSize.value
  return filteredSignInRecords.value.slice(start, start + signPageSize.value)
})

watch(signFilterStatus, () => {
  signCurrentPage.value = 1
})

function handleSignPageChange(page: number): void {
  signCurrentPage.value = page
}

function handleSignSizeChange(size: number): void {
  signPageSize.value = size
  signCurrentPage.value = 1
}

// ============================================================
// 签到统计
// ============================================================
const signInStats = computed(() => {
  const total = signInRecords.value.length
  const signedIn = signInRecords.value.filter(r => r.status === '已签到').length
  const notSignedIn = total - signedIn
  const rate = total > 0 ? Math.round((signedIn / total) * 100) : 0
  return { total, signedIn, notSignedIn, rate }
})

/** 导出签到数据 */
function handleExportSignIn(): void {
  // TODO: 替换为真实导出逻辑（调用后端接口下载 Excel/CSV）
  ElMessage.success('签到数据导出成功（Mock）')
  console.log('[Mock] 导出签到数据：', signInRecords.value)
}

// ============================================================
// 操作按钮（页面头部）
// ============================================================
interface HeaderAction {
  key: string
  label: string
  icon?: any
  type?: 'primary' | 'danger' | 'warning' | 'default'
  visible: boolean
  handler: () => void
}

const headerActions = computed<HeaderAction[]>(() => {
  if (!activity.value) return []
  const { status } = activity.value

  return [
    {
      key: 'edit',
      label: '编辑',
      icon: Edit,
      type: 'default',
      visible: isAdmin.value && status === '未开始',
      handler: handleEdit,
    },
    {
      key: 'delete',
      label: '删除',
      icon: Delete,
      type: 'danger',
      visible: isSuperAdmin.value && status === '未开始',
      handler: handleDelete,
    },
    {
      key: 'qrcode',
      label: '生成二维码',
      icon: PictureFilled,
      type: 'primary',
      visible: isAdmin.value && (status === '报名中' || status === '进行中'),
      handler: () => {
        switchToTab('sign')
        generateQRCode()
        startQRTimer()
      },
    },
    {
      key: 'archive',
      label: '归档',
      type: 'warning',
      visible: isAdmin.value && status === '已结束',
      handler: handleArchive,
    },
  ]
})

function switchToTab(tab: TabName): void {
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

function handleEdit(): void {
  if (!activity.value) return
  router.push(`/activity/edit/${activity.value.id}`)
}

async function handleDelete(): Promise<void> {
  if (!activity.value) return
  try {
    await ElMessageBox.confirm(
      `确定要删除活动"${activity.value.name}"吗？删除后不可恢复。`,
      '删除确认',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    // TODO: 替换为真实 API 调用
    ElMessage.success('活动已删除')
    router.push('/activity')
  } catch {
    // 用户取消
  }
}

async function handleArchive(): Promise<void> {
  if (!activity.value) return
  try {
    await ElMessageBox.confirm(
      `确定要归档活动"${activity.value.name}"吗？`,
      '归档确认',
      { confirmButtonText: '确定归档', cancelButtonText: '取消', type: 'info' }
    )
    // TODO: 替换为真实 API 调用
    activity.value.status = '已归档'
    ElMessage.success('活动已归档')
  } catch {
    // 用户取消
  }
}

// ============================================================
// 返回列表
// ============================================================
function goBack(): void {
  router.push('/activity')
}

// ============================================================
// 生命周期清理
// ============================================================
onUnmounted(() => {
  stopQRTimer()
})
</script>

<template>
  <div class="activity-detail-page" v-loading="loading" element-loading-text="正在加载活动详情...">
    <div class="page-container">
      <!-- ==================== 页面头部 ==================== -->
      <div class="detail-header" v-if="activity">
        <div class="header-top">
          <el-button text @click="goBack" class="back-btn">
            <el-icon><ArrowLeft /></el-icon>
            返回列表
          </el-button>
        </div>

        <div class="header-main">
          <div class="header-info">
            <h2 class="activity-title">{{ activity.name }}</h2>
            <div class="header-meta">
              <el-tag
                :color="activityStatusColorMap[activity.status]"
                effect="light"
                size="large"
              >
                {{ activity.status }}
              </el-tag>
              <span class="meta-branch">{{ activity.branch }}</span>
            </div>
          </div>

          <div class="header-actions" v-if="headerActions.length > 0">
            <el-button
              v-for="action in headerActions"
              :key="action.key"
              :type="action.type || 'default'"
              @click="action.handler"
            >
              <el-icon v-if="action.icon"><component :is="action.icon" /></el-icon>
              {{ action.label }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- ==================== 基本信息卡片 ==================== -->
      <div class="content-card info-card" v-if="activity">
        <h3 class="section-subtitle">基本信息</h3>
        <el-descriptions :column="2" border size="large">
          <el-descriptions-item label="活动类型" :span="1">
            <el-tag
              :color="activityTypeColorMap[activity.type]"
              effect="light"
              size="small"
            >
              {{ activity.type }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="举办支部" :span="1">
            {{ activity.branch }}
          </el-descriptions-item>
          <el-descriptions-item label="活动地点" :span="1">
            {{ activity.location }}
          </el-descriptions-item>
          <el-descriptions-item label="参与范围" :span="1">
            {{ participantScopeText }}
          </el-descriptions-item>
          <el-descriptions-item label="活动时间" :span="1">
            <span class="time-highlight">
              {{ formatDateTime(activity.activityStartTime) }}
            </span>
            <span class="time-separator"> ~ </span>
            <span class="time-highlight">
              {{ formatDateTime(activity.activityEndTime) }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="签到时间" :span="1">
            {{ formatDateTime(activity.signInStartTime) }}
            <span class="time-separator"> ~ </span>
            {{ formatDateTime(activity.signInEndTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="活动简介" :span="2" v-if="activity.description">
            <span class="description-text">{{ activity.description }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- ==================== 标签页 ==================== -->
      <div class="content-card tabs-card" v-if="activity">
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <el-tab-pane
            v-for="tab in visibleTabs"
            :key="tab.name"
            :label="tab.label"
            :name="tab.name"
          >
            <!-- ========== 标签页 1：签到管理 ========== -->
            <template v-if="tab.name === 'sign'">
              <div class="signin-layout">
                <!-- 左侧：二维码区 -->
                <div class="signin-qrcode">
                  <div class="qr-card" v-loading="qrLoading">
                    <img
                      v-if="qrDataUrl"
                      :src="qrDataUrl"
                      alt="签到二维码"
                      class="qr-image"
                    />
                    <div v-else class="qr-placeholder">
                      <el-icon :size="48" class="qr-placeholder-icon"><PictureFilled /></el-icon>
                      <p class="qr-placeholder-text">点击下方按钮生成签到二维码</p>
                    </div>
                    <p v-if="qrDataUrl" class="qr-tip">请使用微信小程序扫码签到</p>
                  </div>

                  <div class="qr-stats">
                    <div class="qr-stat-item">
                      <span class="qr-stat-num signed">{{ signInStats.signedIn }}</span>
                      <span class="qr-stat-label">已签到</span>
                    </div>
                    <div class="qr-stat-divider">/</div>
                    <div class="qr-stat-item">
                      <span class="qr-stat-num total">{{ signInStats.total }}</span>
                      <span class="qr-stat-label">总人数</span>
                    </div>
                  </div>

                  <!-- 未生成二维码：显示生成按钮 -->
                  <el-button
                    v-if="!qrDataUrl"
                    type="primary"
                    @click="handleRefreshQR"
                    :loading="qrLoading"
                    class="qr-refresh-btn"
                  >
                    <el-icon><PictureFilled /></el-icon>
                    生成二维码
                  </el-button>

                  <!-- 已生成二维码：显示倒计时 + 刷新按钮 -->
                  <template v-if="qrDataUrl">
                    <div class="qr-timer" :class="{ warning: qrCountdown <= 10 }">
                      <span class="timer-label">二维码有效期剩余</span>
                      <span class="timer-value">{{ qrCountdown }}s</span>
                    </div>

                    <div class="qr-actions">
                      <el-button
                        class="qr-action-btn"
                        plain
                        @click="handleRefreshQR"
                        :loading="qrLoading"
                      >
                        <el-icon><RefreshRight /></el-icon>
                        刷新二维码
                      </el-button>

                      <el-button
                        class="qr-action-btn"
                        type="danger"
                        plain
                        @click="handleCloseQR"
                      >
                        <el-icon><CircleClose /></el-icon>
                        关闭二维码
                      </el-button>
                    </div>
                  </template>
                </div>

                <!-- 右侧：签到记录表格 -->
                <div class="signin-records">
                  <div class="records-header">
                    <h4 class="records-title">签到记录</h4>
                    <div class="records-toolbar">
                      <el-select
                        v-model="signFilterStatus"
                        placeholder="签到状态"
                        clearable
                        size="small"
                        style="width: 120px"
                      >
                        <el-option
                          v-for="opt in signStatusOptions"
                          :key="opt.value"
                          :label="opt.label"
                          :value="opt.value"
                        />
                      </el-select>
                      <el-button size="small" @click="handleExportSignIn">
                        <el-icon><Download /></el-icon>
                        导出数据
                      </el-button>
                    </div>
                  </div>

                  <el-table
                    :data="pagedSignInRecords"
                    stripe
                    size="small"
                    style="width: 100%"
                  >
                    <el-table-column prop="name" label="姓名" width="80" />
                    <el-table-column prop="studentId" label="学号" width="130" />
                    <el-table-column label="签到时间" min-width="160">
                      <template #default="{ row }">
                        <span v-if="row.signInTime" class="time-cell">
                          {{ formatDateTime(row.signInTime) }}
                        </span>
                        <span v-else class="time-cell time-empty">-</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="状态" width="90" align="center">
                      <template #default="{ row }">
                        <el-tag
                          :color="signInStatusColorMap[row.status]"
                          effect="light"
                          size="small"
                        >
                          {{ row.status }}
                        </el-tag>
                      </template>
                    </el-table-column>
                  </el-table>

                  <div class="records-footer" v-if="signTotalFiltered > 0">
                    <span class="total-info">共 {{ signTotalFiltered }} 条</span>
                    <el-pagination
                      v-model:current-page="signCurrentPage"
                      v-model:page-size="signPageSize"
                      :page-sizes="[10, 20, 50]"
                      :total="signTotalFiltered"
                      layout="sizes, prev, pager, next"
                      background
                      small
                      @current-change="handleSignPageChange"
                      @size-change="handleSignSizeChange"
                    />
                  </div>
                </div>
              </div>
            </template>

            <!-- ========== 标签页 2：报名列表 ========== -->
            <template v-if="tab.name === 'registration'">
              <div class="registration-section">
                <div class="section-toolbar">
                  <h4 class="records-title">
                    报名成员列表
                    <span class="count-badge">{{ registrationRecords.length }} 人</span>
                  </h4>
                  <!-- 二期功能占位 -->
                  <!-- <el-button size="small" type="primary">添加报名</el-button> -->
                </div>

                <el-table :data="registrationRecords" stripe style="width: 100%">
                  <el-table-column prop="name" label="姓名" width="80" />
                  <el-table-column prop="studentId" label="学号" width="130" />
                  <el-table-column label="身份" width="110" align="center">
                    <template #default="{ row }">
                      <el-tag
                        :color="identityColorMap[row.identity] || '#909399'"
                        effect="light"
                        size="small"
                      >
                        {{ row.identity }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="报名时间" min-width="170">
                    <template #default="{ row }">
                      <span class="time-cell">{{ formatDateTime(row.registrationTime) }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </template>

            <!-- ========== 标签页 3：活动统计 ========== -->
            <template v-if="tab.name === 'statistics'">
              <ActivityStatistics :activity-id="activityId" />
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * ActivityDetail.vue 样式
 * ============================================================ */

.activity-detail-page {
  padding: 24px 0 40px;
}

/* ---- 页面头部 ---- */
.detail-header {
  margin-bottom: 24px;
}

.header-top {
  margin-bottom: 8px;
}

.back-btn {
  padding-left: 0;
  color: var(--text-secondary, #909399);
  font-size: 14px;

  &:hover {
    color: var(--party-red, #C12C1F);
  }
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.header-info {
  flex: 1;
}

.activity-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #2C3E50);
  line-height: 1.4;
  margin-bottom: 8px;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meta-branch {
  font-size: 14px;
  color: var(--text-secondary, #909399);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ---- 基本信息卡片 ---- */
.info-card {
  margin-bottom: 24px;
}

.section-subtitle {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);
  margin-bottom: 16px;

  &::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 18px;
    background: var(--party-red, #C12C1F);
    border-radius: 2px;
    margin-right: 10px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
}

.time-highlight {
  font-weight: 600;
  color: var(--text-primary, #2C3E50);
}

.time-separator {
  color: var(--text-placeholder, #C0C4CC);
  margin: 0 4px;
}

.description-text {
  color: var(--text-regular, #606266);
  line-height: 1.8;
}

/* ---- 标签页卡片 ---- */
.tabs-card {
  :deep(.el-tabs__header) {
    margin-bottom: 20px;
  }
}

/* ============================================================
 * 标签页 1：签到管理
 * ============================================================ */
.signin-layout {
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 992px) {
    flex-direction: column;
  }
}

/* 左侧：二维码 */
.signin-qrcode {
  flex-shrink: 0;
  width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-card {
  width: 240px;
  height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-color, #EBEEF5);
  border-radius: var(--radius-lg, 12px);
  padding: 8px;
  background: #fff;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.qr-placeholder-icon {
  color: var(--text-placeholder, #C0C4CC);
}

.qr-placeholder-text {
  font-size: 13px;
  color: var(--text-secondary, #909399);
  text-align: center;
  line-height: 1.5;
}

.qr-tip {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary, #909399);
  text-align: center;
}

.qr-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.qr-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-stat-num {
  font-size: 24px;
  font-weight: 700;

  &.signed { color: #67C23A; }
  &.total  { color: var(--text-primary, #2C3E50); }
}

.qr-stat-label {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.qr-stat-divider {
  font-size: 20px;
  color: var(--text-placeholder, #C0C4CC);
  margin-top: -8px;
}

.qr-timer {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, #909399);

  &.warning {
    color: $party-red;
  }
}

.timer-label {
  color: inherit;
}

.timer-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 32px;
}

.qr-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  width: 100%;
}

.qr-action-btn {
  width: 100% !important;
  margin-left: 0 !important;
  justify-content: center;
}

.qr-refresh-btn {
  margin-top: 16px;
  width: 100% !important;
  justify-content: center;
}

/* 右侧：签到记录 */
.signin-records {
  flex: 1;
  min-width: 0;
}

.records-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.records-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.records-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);
}

.count-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--party-red, #C12C1F);
  background: var(--party-red-bg, rgba(193, 44, 31, 0.08));
  border-radius: 10px;
  line-height: 22px;
}

.records-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.total-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

.time-cell {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-regular, #606266);
}

.time-empty {
  color: var(--text-placeholder, #C0C4CC);
}

/* ============================================================
 * 标签页 2：报名列表
 * ============================================================ */
.registration-section {
  .section-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .header-main {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .activity-title {
    font-size: 18px;
  }
}
</style>
