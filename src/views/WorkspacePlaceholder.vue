<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppStore } from "@/stores/app";

const route = useRoute();
const store = useAppStore();
const section = computed(() => {
  if (route.path.startsWith("/members")) return "成员与支部";
  if (route.path.startsWith("/my-development")) return "我的培养";
  if (route.path.startsWith("/development")) return "党员发展";
  if (route.path.startsWith("/activity")) return "活动与签到";
  if (route.path.startsWith("/content") || route.path.startsWith("/news") || route.path.startsWith("/notice"))
    return "资讯公告";
  if (route.path.startsWith("/resources")) return "资源中心";
  if (route.path.startsWith("/statistics")) return "数据统计";
  if (route.path.startsWith("/system")) return "系统管理";
  return "个人中心";
});
const isProfile = computed(() => route.path === "/profile");
const range = computed(() =>
  store.currentRole === "super_admin" ? "全院" : store.currentRole === "party_secretary" ? "本支部" : "本人",
);
const description = computed(() => {
  if (route.meta.placeholder === "branch") return "本支部成员接口和数据范围校验完善后，将在这里提供成员查询与管理。";
  if (isProfile.value) return "个人资料、培养档案和活动记录将在完成接口接入后集中展示。";
  return `${section.value}的页面入口已经就位，业务数据和操作将在接口接入后开放。`;
});
</script>

<template>
  <div class="workspace-page">
    <div class="workspace-breadcrumb">
      工作台 / <span>{{ section }}</span>
    </div>
    <div class="workspace-heading">
      <div>
        <h1>{{ section }}</h1>
        <p>{{ range }}范围 · 页面布局</p>
      </div>
    </div>
    <section class="workspace-panel placeholder-panel">
      <span class="placeholder-kicker">WORKSPACE / 功能规划</span>
      <h2>{{ section }}</h2>
      <p>{{ description }}</p>
      <div v-if="isProfile" class="profile-preview">
        <span>当前用户</span><strong>{{ store.userInfo.name }}</strong
        ><span>系统角色</span><strong>{{ store.currentRoleLabel }}</strong>
      </div>
      <div class="placeholder-status">
        <el-icon><InfoFilled /></el-icon><span>当前为占位页面，尚未提供业务操作。</span>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.placeholder-panel {
  min-height: 420px;
  padding: 38px;
  position: relative;
  overflow: hidden;
}
.placeholder-panel::after {
  content: "";
  position: absolute;
  width: 320px;
  height: 320px;
  right: -70px;
  top: -120px;
  border: 1px solid #efddd7;
  border-radius: 50%;
  box-shadow: 0 0 0 44px #f8f1ee;
  pointer-events: none;
}
.placeholder-kicker {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
}
.placeholder-panel h2 {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 29px;
  margin: 24px 0 8px;
}
.placeholder-panel p {
  max-width: 600px;
  color: #718088;
  line-height: 1.8;
}
.placeholder-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 70px;
  color: #9a7750;
  font-size: 12px;
}
.profile-preview {
  display: grid;
  grid-template-columns: 90px max-content;
  gap: 14px 20px;
  margin-top: 32px;
}
.profile-preview span {
  color: #879196;
}
@media (max-width: 680px) {
  .placeholder-panel {
    min-height: 350px;
    padding: 25px;
  }
  .placeholder-panel::after {
    opacity: 0.4;
  }
}
</style>
