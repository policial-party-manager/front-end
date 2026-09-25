<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAppStore } from "@/stores/app";
import { pageNews, pageNotices } from "@/api/content";

const store = useAppStore();
const newsTab = ref<"news" | "notice">("news");
const isMember = computed(() => store.currentRole === "party_member" || store.currentRole === "activist");
const range = computed(() =>
  store.currentRole === "super_admin" ? "全院" : store.currentRole === "party_secretary" ? "本支部" : "本人",
);
const greeting = computed(() => (isMember.value ? `你好，${store.userInfo.name}` : `早上好，${store.userInfo.name}`));
const intro = computed(() =>
  isMember.value ? "查看你的培养进度、活动和最新通知。" : `从待办事项开始，快速掌握${range.value}党员发展与活动情况。`,
);
const todos = computed(() =>
  isMember.value
    ? [
        { name: "待提交的思想汇报", count: 1 },
        { name: "即将参加的活动", count: 1 },
        { name: "未读通知", count: 1 },
      ]
    : store.currentRole === "party_secretary"
      ? [
          { name: "待补充的培养记录", count: 2 },
          { name: "待核对的活动记录", count: 2 },
          { name: "即将开展的支部活动", count: 1 },
        ]
      : [
          { name: "待审核的身份调整", count: 5 },
          { name: "待处理的培养材料", count: 4 },
          { name: "即将开展的活动", count: 3 },
        ],
);
const todoTotal = computed(() => todos.value.reduce((sum, item) => sum + item.count, 0));
const stats = computed(() =>
  isMember.value
    ? [
        { label: "当前阶段", value: "积极分子", unit: "" },
        { label: "培养材料", value: "6", unit: "份" },
        { label: "参与活动", value: "8", unit: "场" },
        { label: "未读通知", value: "1", unit: "条" },
      ]
    : [
        { label: "在册成员", value: store.statData.totalMembers, unit: "人" },
        { label: "积极分子", value: store.statData.activists, unit: "人" },
        { label: "发展对象", value: store.statData.developmentCandidates, unit: "人" },
        { label: "本周活动", value: store.statData.weeklyActivities, unit: "场" },
      ],
);
const quickItems = computed(() => {
  const keys = isMember.value
    ? ["development", "activities", "content", "resources"]
    : ["members", "development", "activities", "statistics"];
  return keys.map((key) => store.navItems.find((item) => item.key === key)).filter((item) => item !== undefined);
});
const latestNews = ref<{ id: number; title: string; date: string }[]>([]);
const latestNotices = ref<{ id: number; title: string; date: string }[]>([]);
const contentErrors = ref({ news: false, notice: false });
const articles = computed(() => (newsTab.value === "news" ? latestNews.value : latestNotices.value));
async function loadLatestContent(): Promise<void> {
  contentErrors.value = { news: false, notice: false };
  const [newsResult, noticeResult] = await Promise.allSettled([
    pageNews({ page: 1, size: 4 }),
    pageNotices({ page: 1, size: 4 }),
  ]);
  if (newsResult.status === "fulfilled") {
    latestNews.value = newsResult.value.records.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.createTime?.slice(0, 10) || "—",
    }));
  } else {
    contentErrors.value.news = true;
  }
  if (noticeResult.status === "fulfilled") {
    latestNotices.value = noticeResult.value.records.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.publishTime?.slice(0, 10) || "—",
    }));
  } else {
    contentErrors.value.notice = true;
  }
}
onMounted(() => void loadLatestContent());
</script>

<template>
  <div class="workspace-page home-workspace">
    <div class="workspace-breadcrumb">工作台 / <span>首页</span></div>
    <div class="workspace-heading">
      <div>
        <h1>{{ greeting }}</h1>
        <p>{{ intro }}</p>
      </div>
      <span class="workspace-date">{{
        new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
      }}</span>
    </div>

    <div class="home-grid">
      <section class="home-hero">
        <div>
          <span class="hero-kicker">党员发展 · 工作总览</span>
          <h2>{{ isMember ? "每一步成长，都看得见" : "把重点工作，放在首页第一屏" }}</h2>
          <p>{{ range }}数据、待办事项与常用业务一目了然</p>
        </div>
        <div class="hero-foot">
          <span
            >当前范围 <b>{{ range }}</b></span
          ><span
            >待处理事项 <b>{{ todoTotal }}</b></span
          >
        </div>
      </section>
      <section class="workspace-panel todo-panel">
        <div class="panel-head">
          <h2 class="workspace-panel-title">待办事项</h2>
          <span>示例数据</span>
        </div>
        <div v-for="(item, index) in todos" :key="item.name" class="todo-item">
          <span>{{ item.name }}</span
          ><strong :class="{ soft: index === 2 }">{{ item.count }}</strong>
        </div>
      </section>
      <div class="home-stats">
        <article v-for="stat in stats" :key="stat.label" class="workspace-panel stat-card">
          <small>{{ stat.label }}</small
          ><strong
            >{{ stat.value }}<span>{{ stat.unit }}</span></strong
          ><em>{{ range }}范围 · 示例</em>
        </article>
      </div>
      <div class="home-content">
        <section class="workspace-panel info-panel">
          <div class="panel-head">
            <h2 class="workspace-panel-title">资讯公告</h2>
            <router-link :to="newsTab === 'news' ? '/news' : '/notice'">查看列表 →</router-link>
          </div>
          <div class="news-tabs" role="tablist" aria-label="资讯类型">
            <button
              type="button"
              role="tab"
              :aria-selected="newsTab === 'news'"
              :class="{ active: newsTab === 'news' }"
              @click="newsTab = 'news'"
            >
              党建新闻
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="newsTab === 'notice'"
              :class="{ active: newsTab === 'notice' }"
              @click="newsTab = 'notice'"
            >
              通知公告
            </button>
          </div>
          <ul class="news-list">
            <li v-for="item in articles" :key="item.id">
              <router-link :to="`/${newsTab}/${item.id}`">{{ item.title }}</router-link
              ><time>{{ item.date }}</time>
            </li>
            <li v-if="contentErrors[newsTab]">
              内容加载失败，<button type="button" class="content-retry" @click="loadLatestContent">重试</button>
            </li>
            <li v-else-if="articles.length === 0">暂无已发布内容</li>
          </ul>
        </section>
        <section class="workspace-panel quick-panel">
          <div class="panel-head">
            <h2 class="workspace-panel-title">常用入口</h2>
            <span>按角色展示</span>
          </div>
          <div class="quick-grid">
            <router-link v-for="item in quickItems" :key="item.key" :to="item.path"
              ><span class="quick-icon">→</span><span>{{ item.label }}<small>进入业务板块</small></span></router-link
            >
          </div>
        </section>
      </div>
      <p class="sample-note">首页数字与待办为现有 Mock 或布局示例，正式数据需由对应接口按角色范围提供。</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.9fr);
  gap: 18px;
}
.home-hero {
  min-height: 208px;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(105deg, #8f251f, #ab322a 58%, #c14a37);
  padding: 27px 31px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.home-hero::after {
  content: "";
  position: absolute;
  width: 330px;
  height: 330px;
  right: -90px;
  top: -100px;
  border: 1px solid #ffffff48;
  border-radius: 50%;
  box-shadow:
    0 0 0 42px #ffffff0a,
    0 0 0 92px #ffffff09;
}
.home-hero > * {
  position: relative;
  z-index: 1;
}
.hero-kicker {
  color: #ffe0b0;
  font-size: 12px;
  letter-spacing: 3px;
}
.home-hero h2 {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 29px;
  margin: 13px 0 6px;
}
.home-hero p {
  color: #ffebe8;
  margin: 0;
  font-size: 13px;
}
.hero-foot {
  display: flex;
  gap: 18px;
  color: #ffe9e5;
  font-size: 12px;
}
.hero-foot b {
  font-size: 17px;
  color: #fff;
}
.todo-panel,
.info-panel,
.quick-panel {
  padding: 21px 24px 20px;
  min-width: 0;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.panel-head > span {
  color: #9aa4a4;
  font-size: 12px;
}
.panel-head a {
  color: var(--party-red);
  font-size: 12px;
}
.todo-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #f0f0ed;
  align-items: center;
}
.todo-item strong {
  min-width: 28px;
  height: 24px;
  border-radius: 4px;
  background: #faece8;
  color: var(--party-red);
  display: grid;
  place-items: center;
  font-size: 12px;
}
.todo-item strong.soft {
  background: #f7f2e9;
  color: #a77939;
}
.home-stats {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.stat-card {
  min-height: 127px;
  padding: 20px 22px 18px;
  overflow: hidden;
  position: relative;
}
.stat-card::after {
  content: "";
  position: absolute;
  width: 105px;
  height: 105px;
  right: -26px;
  bottom: -48px;
  border: 1px solid #eddcd7;
  border-radius: 50%;
}
.stat-card small {
  color: #7f898e;
  font-size: 12px;
}
.stat-card strong {
  display: block;
  font-family: Georgia, "Songti SC", serif;
  font-size: 31px;
  font-weight: 600;
  line-height: 1.25;
  margin: 10px 0 3px;
}
.stat-card strong span {
  font:
    12px "Microsoft YaHei",
    sans-serif;
  color: #879196;
  margin-left: 4px;
}
.stat-card em {
  color: #b68957;
  font-size: 11px;
  font-style: normal;
}
.home-content {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr);
  gap: 18px;
}
.news-tabs {
  display: flex;
  gap: 23px;
  border-bottom: 1px solid var(--workspace-line);
}
.news-tabs button {
  border: 0;
  background: none;
  color: #7c888c;
  padding: 0 0 12px;
  position: relative;
}
.news-tabs button.active {
  color: var(--party-red);
  font-weight: 700;
}
.news-tabs button.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--party-red);
}
.news-list {
  padding: 0;
  margin: 3px 0 0;
}
.news-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f1f1ee;
}
.news-list li:last-child {
  border: 0;
}
.news-list a {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.news-list a:hover {
  color: var(--party-red);
}
.content-retry {
  border: 0;
  background: none;
  color: var(--party-red);
  cursor: pointer;
}
.news-list time {
  flex: none;
  color: #a1abad;
  font-size: 11px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.quick-grid a {
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 11px;
  background: #fcfcfa;
  border: 1px solid #eaeae4;
  border-radius: 5px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 700;
}
.quick-grid a:hover {
  border-color: #d6b4a8;
  background: #fff9f6;
}
.quick-grid small {
  display: block;
  color: #9aa4a4;
  font-weight: 400;
  margin-top: 3px;
}
.quick-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--party-red);
  background: #faece8;
  border-radius: 4px;
  font-size: 19px;
  flex: none;
}
.sample-note {
  grid-column: 1 / -1;
  color: #778287;
  border-top: 1px solid #e6e6df;
  padding: 13px 3px;
  margin: 0;
  font-size: 12px;
}
@media (max-width: 1100px) {
  .home-grid,
  .home-content {
    grid-template-columns: 1fr;
  }
  .home-stats,
  .home-content,
  .sample-note {
    grid-column: auto;
  }
  .home-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 680px) {
  .home-hero h2 {
    font-size: 25px;
  }
  .home-stats {
    gap: 9px;
  }
  .stat-card {
    min-height: 112px;
    padding: 17px;
  }
  .stat-card strong {
    font-size: 27px;
  }
  .info-panel,
  .quick-panel {
    padding: 18px;
  }
}
</style>
