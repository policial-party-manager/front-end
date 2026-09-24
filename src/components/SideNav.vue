<script setup lang="ts">
import { computed } from "vue";
import { useAppStore } from "@/stores/app";

defineEmits<{ navigate: [] }>();

const store = useAppStore();
const scope = computed(() => {
  if (store.currentRole === "super_admin") return { name: "全院工作台", detail: "面向全院的业务概览与待办" };
  if (store.currentRole === "party_secretary") return { name: "支部工作台", detail: "仅展示所属党支部数据" };
  return { name: "个人工作台", detail: "围绕个人培养与活动参与" };
});
const icons: Record<string, string> = {
  home: "House",
  members: "User",
  development: "Connection",
  activities: "Calendar",
  content: "Document",
  resources: "FolderOpened",
  statistics: "DataAnalysis",
  system: "Setting",
};
</script>

<template>
  <aside class="side-nav" :class="{ collapsed: store.sidebarCollapsed }">
    <div class="side-scope">
      <span class="side-eyebrow">WORKSPACE / 工作台</span>
      <strong>{{ scope.name }}</strong>
      <small>{{ scope.detail }}</small>
    </div>
    <div class="side-caption">
      <span>业务导航</span>
      <button
        type="button"
        class="collapse-button"
        :aria-label="store.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
        :title="store.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
        :aria-expanded="!store.sidebarCollapsed"
        @click="store.toggleSidebarCollapsed"
      >
        <el-icon><Expand v-if="store.sidebarCollapsed" /><Fold v-else /></el-icon>
      </button>
    </div>
    <nav class="side-menu" aria-label="业务导航">
      <router-link
        v-for="item in store.navItems"
        :key="item.key"
        :to="item.path"
        class="side-link"
        :class="{ active: store.activeNav === item.key }"
        :aria-current="store.activeNav === item.key ? 'page' : undefined"
        :aria-label="item.label"
        :title="store.sidebarCollapsed ? item.label : undefined"
        @click="$emit('navigate')"
      >
        <el-icon><component :is="icons[item.key]" /></el-icon>
        <span class="side-label">{{ item.label }}</span>
        <span class="side-chevron" aria-hidden="true">›</span>
      </router-link>
    </nav>
    <div class="side-bottom">
      <p>菜单根据系统角色展示；党员发展身份用于业务流程，不作为权限角色。</p>
      <router-link
        to="/profile"
        class="side-link"
        :class="{ active: store.activeNav === 'profile' }"
        aria-label="个人中心"
        :title="store.sidebarCollapsed ? '个人中心' : undefined"
        @click="$emit('navigate')"
      >
        <el-icon><UserFilled /></el-icon><span class="side-label">个人中心</span
        ><span class="side-chevron" aria-hidden="true">›</span>
      </router-link>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.side-nav {
  width: 100%;
  height: calc(100vh - 66px);
  position: sticky;
  top: 66px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #fff;
  border-right: 1px solid var(--workspace-line);
}
.side-scope {
  padding: 27px 23px 21px;
  border-bottom: 1px solid var(--workspace-line);
}
.side-eyebrow {
  color: var(--party-red);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
}
.side-scope strong {
  display: block;
  margin-top: 8px;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 20px;
  letter-spacing: 1px;
}
.side-scope small {
  display: block;
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 12px;
}
.side-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #a2a9a9;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 22px 24px 10px;
}
.collapse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #58636b;
  cursor: pointer;
}
.collapse-button:hover,
.collapse-button:focus-visible {
  background: #f8ece8;
  color: var(--workspace-red-deep);
}
.side-menu {
  padding: 0 10px;
  display: grid;
  gap: 4px;
}
.side-link {
  min-height: 47px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-radius: 5px;
  color: #58636b;
  position: relative;
}
.side-link .el-icon {
  font-size: 18px;
  flex: none;
}
.side-link:hover {
  background: #f8f1ee;
  color: var(--workspace-red-deep);
}
.side-link.active {
  background: #f8ece8;
  color: var(--workspace-red-deep);
  font-weight: 700;
}
.side-link.active::before {
  content: "";
  width: 3px;
  height: 23px;
  background: var(--party-red);
  position: absolute;
  left: 0;
  top: 12px;
  border-radius: 4px;
}
.side-chevron {
  margin-left: auto;
  color: #b7bdbd;
  font-size: 20px;
  line-height: 1;
}
.side-bottom {
  margin-top: auto;
  padding: 17px 10px 24px;
  border-top: 1px solid var(--workspace-line);
}
.side-bottom p {
  margin: 0 8px 12px;
  color: #8c9698;
  font-size: 11px;
  line-height: 1.7;
}
@media (min-width: 681px) {
  .side-nav.collapsed .side-scope,
  .side-nav.collapsed .side-caption > span,
  .side-nav.collapsed .side-label,
  .side-nav.collapsed .side-chevron,
  .side-nav.collapsed .side-bottom p {
    display: none;
  }
  .side-nav.collapsed .side-caption {
    padding: 15px 0;
    justify-content: center;
  }
  .side-nav.collapsed .side-menu {
    padding: 0 8px;
  }
  .side-nav.collapsed .side-link {
    justify-content: center;
    padding: 0;
  }
  .side-nav.collapsed .side-bottom {
    padding: 14px 8px 24px;
  }
}
@media (max-width: 680px) {
  .collapse-button {
    display: none;
  }
}
</style>
