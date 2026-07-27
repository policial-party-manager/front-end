<script setup lang="ts">
/**
 * statistics.vue — 数据统计首页
 *
 * 页面包含：
 *   1. 页头（标题 + 描述 + 统计周期切换）
 *   2. 统计卡片（6 张）
 *   3. 培养阶段分布（环形图） + 党支部人数对比（横向柱状图）
 *   4. 关键指标卡片（4 张）
 *   5. 近 6 个月党员发展趋势（折线面积图）
 *   6. 多维度详细数据表格
 *
 * 权限说明（Mock 模拟）：
 *   - super_admin（超级管理员）：查看全院全部数据
 *   - party_secretary（支委）：仅查看本支部数据
 *     实现思路：从 store 获取当前用户角色与所属支部，在 generateMockData 中按角色过滤。
 *     例如：if (userRole === 'party_secretary') { branches = branches.filter(b => b.name === userBranch) }
 *
 * TODO: 接入真实 API 后，替换所有 Mock 数据生成逻辑
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import * as echarts from "echarts";
import { DataAnalysis, Download } from "@element-plus/icons-vue";

// ============================================================
// 类型定义
// ============================================================

type PeriodType = "month" | "quarter" | "year";
type DimensionType = "branch" | "college" | "major" | "class";

interface StatCardItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  trend: number;
  iconColor: string;
  iconBg: string;
  numColor: string;
  linkTo?: string;
  linkQuery?: Record<string, string>;
}

interface StageItem {
  stage: string;
  count: number;
  color: string;
}

interface BranchItem {
  name: string;
  total: number;
  stages: Record<string, number>;
}

interface TrendItem {
  month: string;
  applicant: number;
  activist: number;
  development: number;
  probationary: number;
  full: number;
}

interface DimensionRow {
  name: string;
  total: number;
  normalStudent: number;
  applicant: number;
  activist: number;
  development: number;
  probationary: number;
  full: number;
  activityRate: number;
  reportRate: number;
}

interface KpiItem {
  label: string;
  value: string;
  trend: string;
  percent: number;
}

// ============================================================
// 路由
// ============================================================
const router = useRouter();

// ============================================================
// 阶段颜色配置
// ============================================================
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  normalStudent: { label: "普通学生", color: "#909399" },
  applicant: { label: "入党申请人", color: "#409EFF" },
  activist: { label: "积极分子", color: "#E6A23C" },
  development: { label: "发展对象", color: "#C9973B" },
  probationary: { label: "预备党员", color: "#67C23A" },
  full: { label: "正式党员", color: "#C12C1F" },
};

// ============================================================
// 响应式状态
// ============================================================
const loading = ref(true);
const currentPeriod = ref<PeriodType>("month");
const activeDimension = ref<DimensionType>("branch");

const statCards = ref<StatCardItem[]>([]);
const stageData = ref<StageItem[]>([]);
const branchData = ref<BranchItem[]>([]);
const trendData = ref<TrendItem[]>([]);
const dimensionData = ref<DimensionRow[]>([]);
const kpiData = ref<KpiItem[]>([]);

// ============================================================
// 图表 refs
// ============================================================
const stageChartRef = ref<HTMLDivElement>();
const branchChartRef = ref<HTMLDivElement>();
const trendChartRef = ref<HTMLDivElement>();

let stageChartInstance: echarts.ECharts | null = null;
let branchChartInstance: echarts.ECharts | null = null;
let trendChartInstance: echarts.ECharts | null = null;

// ============================================================
// Mock 数据生成
// ============================================================

function createSeededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getPeriodMultiplier(period: PeriodType): number {
  return { month: 1, quarter: 2.8, year: 10 }[period];
}

function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function generateMonthLabels(count: number): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return labels;
}

/** 生成所有 Mock 数据 */
function generateMockData(period: PeriodType = "month"): void {
  const rand = createSeededRandom(42);
  const mult = getPeriodMultiplier(period);

  // ---------- 党支部数据（5 个支部） ----------
  const branchTemplates: BranchItem[] = [
    { name: "计算机学院学生第一党支部", total: 0, stages: { normalStudent: 18, applicant: 12, activist: 28, development: 8, probationary: 6, full: 15 } },
    { name: "计算机学院学生第二党支部", total: 0, stages: { normalStudent: 22, applicant: 15, activist: 24, development: 10, probationary: 5, full: 12 } },
    { name: "软件学院学生党支部", total: 0, stages: { normalStudent: 14, applicant: 10, activist: 20, development: 6, probationary: 4, full: 18 } },
    { name: "网络空间安全学院学生党支部", total: 0, stages: { normalStudent: 20, applicant: 8, activist: 16, development: 5, probationary: 7, full: 10 } },
    { name: "人工智能学院学生党支部", total: 0, stages: { normalStudent: 16, applicant: 11, activist: 19, development: 7, probationary: 3, full: 9 } },
  ];

  // 权限示例：支委仅看到自己支部
  // const store = useAppStore();
  // if (store.currentRole === 'party_secretary') {
  //   const userBranch = '计算机学院学生第一党支部';
  //   branchTemplates = branchTemplates.filter(b => b.name === userBranch);
  // }

  const branches = branchTemplates.map((b) => {
    const scaled: BranchItem = { ...b, stages: {} };
    Object.entries(b.stages).forEach(([key, v]) => {
      scaled.stages[key] = Math.round(v * mult);
    });
    scaled.total = Object.values(scaled.stages).reduce((sum, v) => sum + v, 0);
    return scaled;
  });
  branches.sort((a, b) => b.total - a.total);
  branchData.value = branches;

  // ---------- 阶段汇总 ----------
  const stageTotals: Record<string, number> = {};
  branches.forEach((b) => {
    Object.entries(b.stages).forEach(([key, count]) => {
      stageTotals[key] = (stageTotals[key] || 0) + count;
    });
  });
  stageData.value = Object.entries(STAGE_CONFIG).map(([key, config]) => ({
    stage: config.label,
    count: stageTotals[key] || 0,
    color: config.color,
  }));

  // ---------- 统计卡片 ----------
  const totalMembers = Object.values(stageTotals).reduce((sum, v) => sum + v, 0);
  const totalActivist = stageTotals.activist || 0;
  const totalDevelopment = stageTotals.development || 0;
  const totalProbationary = stageTotals.probationary || 0;
  const totalFull = stageTotals.full || 0;
  const newActivist = Math.round(totalActivist * (0.08 + rand() * 0.04));
  const newPartyMember = Math.round((totalDevelopment + totalProbationary) * (0.05 + rand() * 0.03));

  // 上期基准（模拟）
  const prev = {
    total: Math.round(totalMembers * (0.92 + rand() * 0.06)),
    activist: Math.round(totalActivist * (0.9 + rand() * 0.08)),
    development: Math.round(totalDevelopment * (0.88 + rand() * 0.1)),
    probationary: Math.round(totalProbationary * (0.95 + rand() * 0.04)),
    full: Math.round(totalFull * (0.93 + rand() * 0.05)),
    newActivist: Math.round(newActivist * (0.7 + rand() * 0.5)),
    newParty: Math.round(newPartyMember * (0.6 + rand() * 0.7)),
  };

  statCards.value = [
    { key: "total", label: "成员总数", value: totalMembers, unit: "人", trend: calcTrend(totalMembers, prev.total), iconColor: "#409EFF", iconBg: "rgba(64,158,255,0.1)", numColor: "#409EFF" },
    { key: "activist", label: "积极分子", value: totalActivist, unit: "人", trend: calcTrend(totalActivist, prev.activist), iconColor: "#E6A23C", iconBg: "rgba(230,162,60,0.1)", numColor: "#E6A23C", linkTo: "/members", linkQuery: { identity: "积极分子" } },
    { key: "development", label: "发展对象", value: totalDevelopment, unit: "人", trend: calcTrend(totalDevelopment, prev.development), iconColor: "#C9973B", iconBg: "rgba(114,46,209,0.1)", numColor: "#722ED1", linkTo: "/members", linkQuery: { identity: "发展对象" } },
    { key: "probationary", label: "预备党员", value: totalProbationary, unit: "人", trend: calcTrend(totalProbationary, prev.probationary), iconColor: "#67C23A", iconBg: "rgba(103,194,58,0.1)", numColor: "#67C23A", linkTo: "/members", linkQuery: { identity: "预备党员" } },
    { key: "full", label: "正式党员", value: totalFull, unit: "人", trend: calcTrend(totalFull, prev.full), iconColor: "#C12C1F", iconBg: "rgba(193,44,31,0.1)", numColor: "#C12C1F", linkTo: "/members", linkQuery: { identity: "正式党员" } },
    { key: "newActivist", label: "本月新增积极分子", value: newActivist, unit: "人", trend: calcTrend(newActivist, prev.newActivist), iconColor: "#409EFF", iconBg: "rgba(64,158,255,0.1)", numColor: "#409EFF", linkTo: "/development" },
  ];

  // ---------- 关键指标 ----------
  kpiData.value = [
    { label: "活动参与率（近30天）", value: (75 + rand() * 20).toFixed(1) + "%", trend: (rand() > 0.5 ? "↑ " : "↓ ") + (rand() * 8).toFixed(1) + "%", percent: Math.round(75 + rand() * 20) },
    { label: "二课总学时（全院累计）", value: (8000 + Math.round(rand() * 8000)).toLocaleString() + " 学时", trend: "↑ " + (rand() * 15).toFixed(1) + "%", percent: Math.round(65 + rand() * 30) },
    { label: "思想汇报完成率", value: (85 + rand() * 12).toFixed(0) + "%", trend: (rand() > 0.3 ? "↑ " : "↓ ") + (rand() * 5).toFixed(1) + "%", percent: Math.round(85 + rand() * 12) },
    { label: "党校学习完成率", value: (78 + rand() * 18).toFixed(0) + "%", trend: "↑ " + (rand() * 10).toFixed(1) + "%", percent: Math.round(78 + rand() * 18) },
  ];

  // ---------- 近 6 个月趋势 ----------
  trendData.value = generateMonthLabels(6).map((month, index) => ({
    month,
    applicant: 25 + index * 3 + Math.round(rand() * 4),
    activist: 55 + index * 4 + Math.round(rand() * 5),
    development: 20 + index * 3 + Math.round(rand() * 3),
    probationary: 15 + index * 2 + Math.round(rand() * 2),
    full: 40 + index * 3 + Math.round(rand() * 3),
  }));

  // ---------- 维度表格 ----------
  dimensionData.value = generateDimensionData(rand, activeDimension.value);
}

function generateDimensionData(rand: () => number, dimension: DimensionType): DimensionRow[] {
  const nameMap: Record<DimensionType, string[]> = {
    branch: ["计算机学院学生第一党支部", "计算机学院学生第二党支部", "软件学院学生党支部", "网络空间安全学院学生党支部", "人工智能学院学生党支部"],
    college: ["计算机学院", "软件学院", "网络空间安全学院", "数学学院", "物理学院", "法学院"],
    major: ["计算机科学与技术", "软件工程", "人工智能", "数学与应用数学", "应用物理", "法学"],
    class: ["计科2101班", "计科2102班", "软工2101班", "人工智能2101班", "数学2101班", "物理2101班", "法学2101班"],
  };

  return (nameMap[dimension] || nameMap.branch).map((name) => {
    const normalStudent = 5 + Math.floor(rand() * 20);
    const applicant = 5 + Math.floor(rand() * 15);
    const activist = 8 + Math.floor(rand() * 25);
    const development = 2 + Math.floor(rand() * 10);
    const probationary = 1 + Math.floor(rand() * 8);
    const full = 3 + Math.floor(rand() * 18);
    return {
      name,
      total: normalStudent + applicant + activist + development + probationary + full,
      normalStudent, applicant, activist, development, probationary, full,
      activityRate: Math.round((65 + rand() * 30) * 10) / 10,
      reportRate: Math.round((75 + rand() * 22) * 10) / 10,
    };
  });
}

// ============================================================
// 周期 / 维度切换
// ============================================================
const periodLabel = computed(() => ({ month: "本月", quarter: "本季度", year: "本年" }[currentPeriod.value]));

function handlePeriodChange(period: PeriodType): void {
  currentPeriod.value = period;
  reloadAll();
}

function handleDimensionChange(dimension: DimensionType): void {
  activeDimension.value = dimension;
  const rand = createSeededRandom(42);
  dimensionData.value = generateDimensionData(rand, dimension);
}

// ============================================================
// 数据重载
// ============================================================
function reloadAll(): void {
  loading.value = true;
  // 模拟接口延迟
  setTimeout(() => {
    generateMockData(currentPeriod.value);
    loading.value = false;
    nextTick(() => initAllCharts());
  }, 500);
}

// ============================================================
// 卡片点击跳转
// ============================================================
function handleCardClick(card: StatCardItem): void {
  if (card.linkTo) {
    router.push({ path: card.linkTo, query: card.linkQuery });
  }
}

// ============================================================
// 导出 Excel（模拟）
// ============================================================
const dimLabelMap: Record<DimensionType, string> = { branch: "党支部", college: "学院", major: "专业", class: "班级" };

function handleExport(): void {
  // TODO: 接入真实导出（调用后端接口或前端 xlsx 库）
  ElMessage.success(`正在导出"按${dimLabelMap[activeDimension.value]}"维度的统计数据，请稍候...`);
}

// ============================================================
// ECharts 图表
// ============================================================

/** 环形图 — 各培养阶段人数分布 */
function initStageChart(): void {
  if (!stageChartRef.value || stageData.value.length === 0) return;
  if (stageChartInstance) stageChartInstance.dispose();
  stageChartInstance = echarts.init(stageChartRef.value);

  stageChartInstance.setOption({
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#fff",
      borderColor: "#EBEEF5",
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: "#2C3E50", fontSize: 13 },
      formatter: (params: any) => `
        <div style="font-weight:600;margin-bottom:6px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${params.color};margin-right:6px"></span>
          ${params.name}
        </div>
        <div>人数：<b style="font-size:16px">${params.value}</b> 人</div>
        <div>占比：<b style="font-size:14px;color:#C12C1F">${params.percent}%</b></div>
      `,
    },
    legend: {
      orient: "vertical",
      right: "5%",
      top: "center",
      itemGap: 14,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 13, color: "#606266" },
    },
    series: [{
      name: "培养阶段分布",
      type: "pie",
      radius: ["52%", "78%"],
      center: ["38%", "50%"],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 4, borderColor: "#fff", borderWidth: 3 },
      label: { show: true, position: "outside", formatter: "{b}\n{d}%", fontSize: 12, color: "#606266", lineHeight: 16 },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: "bold" }, scaleSize: 8 },
      data: stageData.value.map((item) => ({ value: item.count, name: item.stage, itemStyle: { color: item.color } })),
    }],
  });
}

/** 横向柱状图 — 各党支部人数对比 */
function initBranchChart(): void {
  if (!branchChartRef.value || branchData.value.length === 0) return;
  if (branchChartInstance) branchChartInstance.dispose();
  branchChartInstance = echarts.init(branchChartRef.value);

  const names = branchData.value.map((b) => b.name);
  const values = branchData.value.map((b) => b.total);
  // 红色系渐变
  const redShades = ["#C12C1F", "#E84646", "#F56C6C", "#F89898", "#FDE2E2"];

  branchChartInstance.setOption({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      backgroundColor: "#fff",
      borderColor: "#EBEEF5",
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: "#2C3E50", fontSize: 13 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div><div>成员总数：<b style="color:#C12C1F;font-size:16px">${p.value}</b> 人</div>`;
      },
    },
    grid: { left: "3%", right: "10%", bottom: "3%", top: 12, containLabel: true },
    xAxis: {
      type: "value", name: "人数", minInterval: 1,
      nameTextStyle: { fontSize: 12, color: "#606266" },
      axisLabel: { fontSize: 11, color: "#909399" },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: "#F2F6FC", type: "dashed" } },
    },
    yAxis: {
      type: "category", data: names, inverse: true,
      axisLabel: { fontSize: 12, color: "#606266", width: 130, overflow: "truncate" },
      axisLine: { lineStyle: { color: "#EBEEF5" } }, axisTick: { show: false },
    },
    series: [{
      type: "bar", barWidth: "50%",
      data: values.map((v, i) => ({
        value: v,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: "#C12C1F" },
            { offset: 1, color: redShades[i] || "#FDE2E2" },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
      })),
      label: { show: true, position: "right", fontSize: 13, fontWeight: 600, color: "#C12C1F", formatter: "{c} 人" },
    }],
  });
}

/** 折线面积图 — 近 6 个月趋势 */
function initTrendChart(): void {
  if (!trendChartRef.value || trendData.value.length === 0) return;
  if (trendChartInstance) trendChartInstance.dispose();
  trendChartInstance = echarts.init(trendChartRef.value);

  const months = trendData.value.map((d) => d.month);
  const seriesConf = [
    { name: "入党申请人", key: "applicant" as keyof TrendItem, color: "#409EFF" },
    { name: "积极分子", key: "activist" as keyof TrendItem, color: "#E6A23C" },
    { name: "发展对象", key: "development" as keyof TrendItem, color: "#C9973B" },
    { name: "预备党员", key: "probationary" as keyof TrendItem, color: "#67C23A" },
    { name: "正式党员", key: "full" as keyof TrendItem, color: "#C12C1F" },
  ];

  trendChartInstance.setOption({
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: "#fff",
      borderColor: "#EBEEF5",
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: "#2C3E50", fontSize: 13 },
      axisPointer: { type: "cross", crossStyle: { color: "#C0C4CC" } },
    },
    legend: { top: 0, itemWidth: 14, itemHeight: 10, itemGap: 20, textStyle: { fontSize: 13, color: "#606266" } },
    grid: { left: "3%", right: "4%", bottom: "3%", top: 48, containLabel: true },
    xAxis: {
      type: "category", data: months, boundaryGap: false,
      axisLabel: { fontSize: 12, color: "#909399" },
      axisLine: { lineStyle: { color: "#EBEEF5" } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", name: "人数", minInterval: 1,
      nameTextStyle: { fontSize: 12, color: "#606266" },
      axisLabel: { fontSize: 11, color: "#909399" },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: "#F2F6FC", type: "dashed" } },
    },
    series: seriesConf.map((s) => ({
      name: s.name,
      type: "line",
      data: trendData.value.map((d) => (d as any)[s.key] || 0),
      smooth: true,
      symbol: "circle", symbolSize: 6,
      lineStyle: { width: 2.5, color: s.color },
      itemStyle: { color: s.color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: s.color + "40" },
          { offset: 1, color: s.color + "05" },
        ]),
      },
      emphasis: { focus: "series", symbolSize: 10 },
    })),
  });
}

function initAllCharts(): void {
  initStageChart();
  initBranchChart();
  initTrendChart();
}

function handleResize(): void {
  stageChartInstance?.resize();
  branchChartInstance?.resize();
  trendChartInstance?.resize();
}

// ============================================================
// 工具函数
// ============================================================
function trendClass(trend: number): string {
  if (trend > 0) return "trend-up";
  if (trend < 0) return "trend-down";
  return "trend-flat";
}

function trendArrow(trend: number): string {
  if (trend > 0) return "↑";
  if (trend < 0) return "↓";
  return "→";
}

function trendText(trend: number): string {
  return trend === 0 ? "持平" : Math.abs(trend) + "%";
}

// ============================================================
// 生命周期
// ============================================================
onMounted(() => {
  reloadAll();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  stageChartInstance?.dispose();
  branchChartInstance?.dispose();
  trendChartInstance?.dispose();
});
</script>

<template>
  <div class="statistics-page">
    <div class="page-container">
      <!-- ==================== 1. 页头 ==================== -->
      <div class="page-header">
        <h2 class="section-title">数据统计</h2>
        <p class="page-desc">全院数据总览 — 成员培养、活动组织、学时统计等关键指标一览</p>
        <div class="page-header-extra">
          <span class="period-label">统计周期：</span>
          <el-radio-group :model-value="currentPeriod" size="default" @change="handlePeriodChange">
            <el-radio-button value="month">本月</el-radio-button>
            <el-radio-button value="quarter">本季度</el-radio-button>
            <el-radio-button value="year">本年</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- ==================== 2. 统计卡片 ==================== -->
      <div class="stats-grid">
        <div
          v-for="card in statCards"
          :key="card.key"
          class="stat-card"
          :class="{ 'is-clickable': !!card.linkTo }"
          @click="handleCardClick(card)"
        >
          <div class="stat-icon" :style="{ background: card.iconBg }">
            <el-icon :size="22" :color="card.numColor"><DataAnalysis /></el-icon>
          </div>
          <div class="stat-body">
            <span class="stat-num" :style="{ color: card.numColor }">
              {{ card.value.toLocaleString() }}
            </span>
            <span class="stat-label">{{ card.label }}</span>
            <span class="stat-trend" :class="trendClass(card.trend)">
              {{ trendArrow(card.trend) }} {{ trendText(card.trend) }}
            </span>
          </div>
        </div>
      </div>

      <!-- ==================== 3. 第一行图表：两栏布局 ==================== -->
      <el-row :gutter="20" class="charts-row">
        <!-- 左栏：各培养阶段人数分布 -->
        <el-col :xs="24" :lg="12">
          <div class="content-card chart-section">
            <div class="card-header">
              <span class="card-title">各培养阶段人数分布</span>
              <span class="card-subtitle">当前{{ periodLabel }}数据</span>
            </div>
            <div ref="stageChartRef" class="chart-container-stage" />
          </div>
        </el-col>

        <!-- 右栏：各党支部人数对比 -->
        <el-col :xs="24" :lg="12">
          <div class="content-card chart-section">
            <div class="card-header">
              <span class="card-title">各党支部人数对比</span>
              <span class="card-subtitle">按人数降序排列</span>
            </div>
            <div ref="branchChartRef" class="chart-container-stage" />
          </div>
        </el-col>
      </el-row>

      <!-- ==================== 4. 第二行：关键指标卡片 ==================== -->
      <div class="kpi-grid">
        <div v-for="kpi in kpiData" :key="kpi.label" class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">{{ kpi.label }}</span>
            <span class="kpi-trend" :class="kpi.trend.startsWith('↑') ? 'trend-up' : 'trend-down'">
              {{ kpi.trend }}
            </span>
          </div>
          <span class="kpi-value">{{ kpi.value }}</span>
          <el-progress :percentage="kpi.percent" :stroke-width="8" :show-text="false" color="#C12C1F" />
        </div>
      </div>

      <!-- ==================== 5. 第三行：趋势图表（全宽） ==================== -->
      <div class="content-card chart-section">
        <div class="card-header">
          <span class="card-title">近 6 个月党员发展趋势</span>
          <span class="card-subtitle">各阶段人数变化趋势</span>
        </div>
        <div ref="trendChartRef" class="chart-container-trend" />
      </div>

      <!-- ==================== 6. 第四行：详细数据表格 ==================== -->
      <div class="content-card">
        <div class="card-header">
          <span class="card-title">详细数据统计</span>
          <div class="card-actions">
            <el-button type="primary" size="small" :icon="Download" @click="handleExport">导出 Excel</el-button>
          </div>
        </div>

        <!-- 维度切换 + 筛选栏 -->
        <div class="filter-bar">
          <el-row :gutter="16" class="filter-row">
            <el-col :xs="24" :sm="16" :md="12">
              <div class="filter-item">
                <label class="filter-label">统计维度</label>
                <el-radio-group :model-value="activeDimension" size="small" @change="handleDimensionChange">
                  <el-radio-button value="branch">按党支部</el-radio-button>
                  <el-radio-button value="college">按学院</el-radio-button>
                  <el-radio-button value="major">按专业</el-radio-button>
                  <el-radio-button value="class">按班级</el-radio-button>
                </el-radio-group>
              </div>
            </el-col>
          </el-row>
        </div>

        <el-table
          :data="dimensionData"
          stripe
          style="width: 100%"
          :default-sort="{ prop: 'total', order: 'descending' }"
          max-height="480"
        >
          <el-table-column prop="name" label="维度名称" min-width="180" fixed="left" sortable="custom">
            <template #default="{ row }">
              <span class="dim-name">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="total" label="总人数" width="100" sortable>
            <template #default="{ row }">
              <el-tag type="danger" effect="dark" round>{{ row.total }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-for="stage in ['normalStudent', 'applicant', 'activist', 'development', 'probationary', 'full']"
            :key="stage"
            :prop="stage"
            :label="STAGE_CONFIG[stage].label"
            width="110"
            sortable
          >
            <template #default="{ row }">
              <span :style="{ color: STAGE_CONFIG[stage].color, fontWeight: 600 }">
                {{ row[stage as keyof DimensionRow] }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="activityRate" label="活动参与率" width="130" sortable>
            <template #default="{ row }">
              <div class="rate-cell">
                <el-progress
                  :percentage="row.activityRate"
                  :stroke-width="6"
                  :show-text="false"
                  :color="row.activityRate >= 80 ? '#67C23A' : row.activityRate >= 60 ? '#E6A23C' : '#F56C6C'"
                />
                <span class="rate-text">{{ row.activityRate }}%</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="reportRate" label="思想汇报完成率" width="140" sortable>
            <template #default="{ row }">
              <div class="rate-cell">
                <el-progress
                  :percentage="row.reportRate"
                  :stroke-width="6"
                  :show-text="false"
                  :color="row.reportRate >= 80 ? '#67C23A' : row.reportRate >= 60 ? '#E6A23C' : '#F56C6C'"
                />
                <span class="rate-text">{{ row.reportRate }}%</span>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="table-footer">
          <span class="total-info">共 {{ dimensionData.length }} 条记录（{{ dimLabelMap[activeDimension] }}维度）</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* ============================================================
 * statistics.vue 样式
 * 遵循项目设计规范，复用全局样式 + 页面特有样式
 * ============================================================ */

/* ---- 页面容器 ---- */
.statistics-page {
  padding: 24px 0 40px;
}

/* ---- 页头 ---- */
.page-header {
  margin-bottom: 24px;
}

.page-desc {
  color: var(--text-secondary, #909399);
  font-size: 14px;
  margin-top: 4px;
}

.page-header-extra {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.period-label {
  font-size: 14px;
  color: var(--text-secondary, #909399);
}

/* ---- 统计卡片网格（与 members.vue 一致） ---- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: all 0.3s ease;
  cursor: default;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.12));
  }
}

.stat-card.is-clickable {
  cursor: pointer;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-base, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.stat-num {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

.stat-trend {
  font-size: 12px;
  font-weight: 500;

  &.trend-up { color: #67c23a; }
  &.trend-down { color: #f56c6c; }
  &.trend-flat { color: var(--text-placeholder, #c0c4cc); }
}

/* ---- 图表行 ---- */
.charts-row {
  margin-bottom: 24px;
}

.chart-section {
  margin-bottom: 0;
}

/* ---- 卡片标题栏（与 members.vue/development.vue 一致） ---- */
.card-subtitle {
  font-size: 12px;
  color: var(--text-placeholder, #c0c4cc);
  margin-left: auto;
}

/* ---- 图表容器 ---- */
.chart-container-stage {
  width: 100%;
  height: 380px;
}

.chart-container-trend {
  width: 100%;
  height: 420px;
}

/* ---- 关键指标卡片 ---- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.kpi-card {
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-card, 0 2px 12px rgba(0, 0, 0, 0.06));
  padding: 24px;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.12));
  }
}

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.kpi-label {
  font-size: 14px;
  color: var(--text-regular, #606266);
}

.kpi-trend {
  font-size: 13px;
  font-weight: 600;

  &.trend-up { color: #67c23a; }
  &.trend-down { color: #f56c6c; }
}

.kpi-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #2c3e50);
  margin-bottom: 16px;
  font-variant-numeric: tabular-nums;
}

/* ---- 筛选栏（与 members.vue/development.vue 一致） ---- */
.filter-bar {
  margin-bottom: 20px;
  padding: 16px 20px;
  background: var(--bg-page, #f5f6fa);
  border-radius: var(--radius-base, 8px);
}

.filter-row {
  align-items: flex-end;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 14px;
  color: var(--text-regular, #606266);
  font-weight: 500;
}

/* ---- 表格 ---- */
.dim-name {
  font-weight: 600;
  color: var(--text-primary, #2c3e50);
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 8px;

  .el-progress {
    flex: 1;
    min-width: 60px;
  }
}

.rate-text {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  white-space: nowrap;
}

/* ---- 表格底部 ---- */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
}

.total-info {
  font-size: 13px;
  color: var(--text-secondary, #909399);
}

/* ---- Element Plus 内部样式覆盖 ---- */
:deep(.el-table) {
  th.el-table__cell {
    background: var(--bg-page, #f5f6fa);
    color: var(--text-secondary, #909399);
    font-weight: 600;
  }
}

/* ---- 响应式 ---- */
@media (max-width: 1400px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .statistics-page {
    padding: 16px 0 32px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .stat-card {
    padding: 14px 12px;
    gap: 12px;
  }

  .stat-num {
    font-size: 22px;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
  }

  .chart-container-stage {
    height: 300px;
  }

  .chart-container-trend {
    height: 320px;
  }

  .kpi-value {
    font-size: 22px;
  }

  .filter-bar {
    padding: 12px;
  }

  .page-header-extra {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
