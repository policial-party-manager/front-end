<script setup lang="ts">
/**
 * ActivityStatistics.vue - 活动统计组件
 *
 * 用于活动详情页"活动统计"标签页。
 * 根据 activityId 生成 Mock 统计数据，展示统计卡片 + 签到时间分布图。
 *
 * Props:
 *   activityId — 活动 ID，用于生成对应的 Mock 数据
 *
 * TODO: 接入真实接口后，将 Mock 数据替换为 API 调用
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import {
  UserFilled,
  CircleCheckFilled,
  CircleCloseFilled,
  TrendCharts,
} from '@element-plus/icons-vue'

// ============================================================
// Props
// ============================================================
const props = defineProps<{
  activityId: number
}>()

// ============================================================
// 简单可复现伪随机数（同一 activityId 生成相同数据）
// ============================================================
function createSeededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    // Mulberry32 算法 — 32 位状态，均匀分布
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================
// Mock 统计数据
// TODO: 替换为真实 API 调用（GET /api/activity/:id/statistics）
// ============================================================

interface StatData {
  total: number
  signedIn: number
  notSignedIn: number
  signInRate: number
}

/** 签到时间分布数据 */
interface TimeBucket {
  label: string // 如 "13:30"
  count: number
}

const statData = ref<StatData>({ total: 0, signedIn: 0, notSignedIn: 0, signInRate: 0 })
const timeBuckets = ref<TimeBucket[]>([])
const loading = ref(false)

/** 根据 activityId 生成 Mock 统计数据 */
function generateMockStats(): void {
  loading.value = true

  // 使用 setTimeout 模拟异步，让 loading 状态可见
  setTimeout(() => {
    const rand = createSeededRandom(props.activityId)

    // 总人数 20 ~ 35
    const total = 20 + Math.floor(rand() * 16)
    // 签到率 65% ~ 95%
    const rate = 0.65 + rand() * 0.30
    const signedIn = Math.round(total * rate)
    const notSignedIn = total - signedIn
    const signInRate = Math.round((signedIn / total) * 1000) / 10 // 保留一位小数

    statData.value = { total, signedIn, notSignedIn, signInRate }

    // 签到时间分布：签到窗口 2.5 小时，每 10 分钟一个桶
    // 起始时间基于 activityId 偏移
    const startHour = 7 + ((props.activityId * 3) % 5) // 7:00 ~ 12:00 之间
    const startMinute = ((props.activityId * 17) % 6) * 10 // 0, 10, 20, 30, 40, 50
    const bucketCount = 15 // 15 * 10min = 150min = 2.5h

    const buckets: TimeBucket[] = []
    let remaining = signedIn

    for (let i = 0; i < bucketCount; i++) {
      const h = startHour + Math.floor((startMinute + i * 10) / 60)
      const m = (startMinute + i * 10) % 60
      const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

      // 中间时段人数多，两端少（模拟正态分布形状）
      const positionFactor = 1 - Math.abs((i - bucketCount / 2) / (bucketCount / 2)) * 0.7
      const maxInBucket = Math.ceil((remaining / (bucketCount - i)) * 2 * positionFactor)
      let count: number
      if (i === bucketCount - 1) {
        count = remaining
      } else {
        count = Math.min(Math.floor(rand() * maxInBucket), remaining)
      }
      remaining -= count
      buckets.push({ label, count })
    }

    timeBuckets.value = buckets
    loading.value = false

    // 数据就绪后初始化图表
    nextTick(() => initChart())
  }, 200)
}

// 监听 activityId 变化，重新生成数据
watch(() => props.activityId, () => {
  generateMockStats()
}, { immediate: false })

// ============================================================
// ECharts 签到时间分布图
// ============================================================
const chartRef = ref<HTMLDivElement>()
let chartInstance: echarts.ECharts | null = null
const chartInited = ref(false)

function buildChartOption(): echarts.EChartsOption {
  const xData = timeBuckets.value.map(b => b.label)
  const yData = timeBuckets.value.map(b => b.count)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      backgroundColor: '#fff',
      borderColor: '#EBEEF5',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: '#2C3E50', fontSize: 13 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        return `
          <div style="font-weight:600;margin-bottom:4px">${p.name} 时间段</div>
          <div>签到人数：<b style="color:#C12C1F;font-size:16px">${p.value}</b> 人</div>
        `
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 16,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: {
        rotate: 45,
        fontSize: 11,
        color: '#909399',
        margin: 10,
      },
      axisTick: { alignWithLabel: true, show: false },
      axisLine: { lineStyle: { color: '#EBEEF5' } },
      name: '时间段（每 10 分钟）',
      nameTextStyle: { fontSize: 12, color: '#606266', padding: [8, 0, 0, 0] },
    },
    yAxis: {
      type: 'value',
      name: '签到人数',
      minInterval: 1,
      nameTextStyle: { fontSize: 12, color: '#606266' },
      axisLabel: { fontSize: 11, color: '#909399' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#F2F6FC', type: 'dashed' } },
    },
    series: [
      {
        name: '签到人数',
        type: 'bar',
        data: yData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#E84646' },
            { offset: 1, color: '#C12C1F' },
          ]),
          borderRadius: [5, 5, 0, 0],
        },
        barWidth: '55%',
        emphasis: {
          itemStyle: {
            color: '#A01E1A',
          },
          label: {
            show: true,
            position: 'top',
            fontSize: 12,
            fontWeight: 600,
            color: '#C12C1F',
            formatter: '{c} 人',
          },
        },
      },
    ],
  }
}

function initChart(): void {
  if (!chartRef.value || timeBuckets.value.length === 0) return

  if (chartInstance) {
    chartInstance.dispose()
  }

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(buildChartOption())
  chartInited.value = true

  window.addEventListener('resize', handleResize)
}

function handleResize(): void {
  chartInstance?.resize()
}

onMounted(() => {
  generateMockStats()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})

// 格式化百分比
const signInRateFormatted = computed(() => {
  return statData.value.signInRate.toFixed(1)
})
</script>

<template>
  <div class="activity-statistics" v-loading="loading" element-loading-text="加载统计数据...">
    <!-- ==================== 统计卡片 ==================== -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6" :span="6">
        <div class="stat-card stat-card--total">
          <div class="stat-card__icon">
            <el-icon :size="22"><UserFilled /></el-icon>
          </div>
          <div class="stat-card__body">
            <span class="stat-card__num">{{ statData.total }}</span>
            <span class="stat-card__label">总人数</span>
          </div>
        </div>
      </el-col>

      <el-col :xs="12" :sm="6" :span="6">
        <div class="stat-card stat-card--signed">
          <div class="stat-card__icon">
            <el-icon :size="22"><CircleCheckFilled /></el-icon>
          </div>
          <div class="stat-card__body">
            <span class="stat-card__num">{{ statData.signedIn }}</span>
            <span class="stat-card__label">已签到</span>
          </div>
        </div>
      </el-col>

      <el-col :xs="12" :sm="6" :span="6">
        <div class="stat-card stat-card--unsigned">
          <div class="stat-card__icon">
            <el-icon :size="22"><CircleCloseFilled /></el-icon>
          </div>
          <div class="stat-card__body">
            <span class="stat-card__num">{{ statData.notSignedIn }}</span>
            <span class="stat-card__label">未签到</span>
          </div>
        </div>
      </el-col>

      <el-col :xs="12" :sm="6" :span="6">
        <div class="stat-card stat-card--rate">
          <div class="stat-card__icon">
            <el-icon :size="22"><TrendCharts /></el-icon>
          </div>
          <div class="stat-card__body">
            <span class="stat-card__num">{{ signInRateFormatted }}<small>%</small></span>
            <span class="stat-card__label">签到率</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- ==================== 签到时间分布图 ==================== -->
    <div class="chart-section">
      <div class="chart-header">
        <h4 class="chart-title">签到时间分布</h4>
        <span class="chart-subtitle">每 10 分钟为一段，展示各时段签到人数</span>
      </div>
      <div class="chart-wrapper">
        <div ref="chartRef" class="chart-container" />
        <el-empty
          v-if="!chartInited && !loading"
          description="暂无签到数据"
          :image-size="80"
          class="chart-empty"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * ActivityStatistics.vue 样式
 * ============================================================ */

.activity-statistics {
  min-height: 200px;
}

/* ---- 统计卡片 ---- */
.stats-row {
  margin-bottom: 28px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 18px;
  border-radius: var(--radius-base, 8px);
  background: var(--bg-white, #FFFFFF);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.25s, transform 0.25s;
  cursor: default;

  &:hover {
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.10);
    transform: translateY(-2px);
  }

  @media (max-width: 768px) {
    margin-bottom: 12px;
  }
}

.stat-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: #fff;
}

.stat-card--total .stat-card__icon {
  background: #409EFF;
}

.stat-card--signed .stat-card__icon {
  background: #67C23A;
}

.stat-card--unsigned .stat-card__icon {
  background: #E6A23C;
}

.stat-card--rate .stat-card__icon {
  background: #C12C1F;
}

.stat-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-card__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #2C3E50);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;

  small {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-secondary, #909399);
    margin-left: 2px;
  }
}

.stat-card__label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* 卡片色调微调 — 数字用主题色 */
.stat-card--signed .stat-card__num { color: #529B2E; }
.stat-card--unsigned .stat-card__num { color: #B88230; }
.stat-card--rate .stat-card__num { color: $party-red; }

/* ---- 图表区域 ---- */
.chart-section {
  margin-top: 4px;
}

.chart-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #2C3E50);

  &::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 16px;
    background: $party-red;
    border-radius: 2px;
    margin-right: 8px;
    vertical-align: middle;
    position: relative;
    top: -1px;
  }
}

.chart-subtitle {
  font-size: 12px;
  color: var(--text-placeholder, #C0C4CC);
}

.chart-wrapper {
  position: relative;
}

.chart-container {
  width: 100%;
  height: 380px;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- 响应式 ---- */
@media (max-width: 768px) {
  .stat-card {
    padding: 14px 12px;
    gap: 10px;
  }

  .stat-card__num {
    font-size: 22px;
  }

  .stat-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
  }

  .chart-container {
    height: 280px;
  }
}
</style>
