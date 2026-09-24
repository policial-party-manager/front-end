<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import type { Role } from "@/config/permissions";

defineEmits<{ toggleMenu: [] }>();

const store = useAppStore();
const router = useRouter();
const previewRoles = Object.keys(store.roleLabels) as Role[];
const emblemUrl = computed(() => new URL("@/assets/images/Party/党徽黄色1024X1024.png", import.meta.url).href);

function handlePreviewRoleChange(role: Role): void {
  if (store.setPreviewRole(role)) router.replace("/");
}

function handleLogout(): void {
  void store.logout();
  router.push("/login");
}
</script>

<template>
  <header class="top-nav">
    <div class="nav-brand">
      <button class="menu-toggle" type="button" aria-label="打开业务导航" @click="$emit('toggleMenu')">
        <span aria-hidden="true">☰</span>
      </button>
      <img :src="emblemUrl" alt="党徽" class="brand-emblem" />
      <strong class="brand-name">党建云平台</strong>
      <span class="brand-subtitle">党员发展全过程管理系统</span>
    </div>
    <el-dropdown trigger="click" placement="bottom-end">
      <button class="user-trigger" type="button" aria-label="打开用户菜单">
        <span class="user-avatar"
          ><el-icon><UserFilled /></el-icon
        ></span>
        <span class="user-name">{{ store.userInfo.name }}</span>
        <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item disabled>当前角色：{{ store.currentRoleLabel }}</el-dropdown-item>
          <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
          <template v-if="store.canSwitchPreviewIdentity">
            <el-dropdown-item divided disabled>开发预览：切换角色</el-dropdown-item>
            <el-dropdown-item
              v-for="role in previewRoles"
              :key="role"
              :disabled="role === store.currentRole"
              @click="handlePreviewRoleChange(role)"
            >
              {{ store.roleLabels[role] }}
            </el-dropdown-item>
          </template>
          <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </header>
</template>

<style lang="scss" scoped>
.top-nav {
  height: 66px;
  padding: 0 28px;
  background: var(--workspace-red-deep);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 3px 16px rgba(69, 22, 20, 0.1);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.brand-emblem {
  width: 39px;
  height: 39px;
  object-fit: contain;
}
.brand-name {
  font-size: 20px;
  letter-spacing: 2px;
  white-space: nowrap;
}
.brand-subtitle {
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  padding-left: 19px;
  margin-left: 8px;
  color: #f5dfd8;
  font-size: 12px;
  letter-spacing: 2px;
  white-space: nowrap;
}
.user-trigger,
.menu-toggle {
  border: 0;
  color: #fff;
  background: transparent;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.user-trigger:hover,
.menu-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
}
.user-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.dropdown-icon {
  opacity: 0.7;
}
.menu-toggle {
  display: none;
  width: 36px;
  height: 36px;
  border-radius: 5px;
  font-size: 20px;
}

@media (max-width: 900px) {
  .brand-subtitle {
    display: none;
  }
}
@media (max-width: 680px) {
  .top-nav {
    padding: 0 16px;
  }
  .menu-toggle {
    display: grid;
    place-items: center;
  }
  .brand-emblem {
    width: 31px;
    height: 31px;
  }
  .brand-name {
    font-size: 16px;
    letter-spacing: 0;
  }
  .user-name {
    display: none;
  }
}
</style>
