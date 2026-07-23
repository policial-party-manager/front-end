<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

/**
 * TopNav - 顶部导航栏组件
 *
 * 红色背景，左侧党徽 + 平台名称，中间导航菜单，右侧用户信息
 * 导航菜单支持高亮切换（当前页为"首页"）
 * 用户下拉菜单中预留角色切换入口（仅UI，功能待实现）
 */

const store = useAppStore()
const router = useRouter()

// 党徽图标路径
// 用途：顶部导航栏左侧品牌标识
// 使用项目中已有的黄色党徽图片
const emblemUrl = computed(() => {
  return new URL('@/assets/images/Party/党徽黄色1024X1024.png', import.meta.url).href
})

function handleNavClick(key: string): void {
  store.setActiveNav(key)
  // 根据导航 key 跳转到对应路由
  const item = store.navItems.find(n => n.key === key)
  if (item) router.push(item.path)
}

function handleLogout(): void {
  // 退出登录逻辑（待实现）
  console.log('退出登录')
}
</script>

<template>
  <header class="top-nav">
    <div class="nav-inner">
      <!-- 左侧：品牌标识 -->
      <div class="nav-brand">
        <img
          :src="emblemUrl"
          alt="党徽"
          class="brand-emblem"
        />
        <span class="brand-name">党建云平台</span>
      </div>

      <!-- 中间：导航菜单 -->
      <nav class="nav-menu">
        <a
          v-for="item in store.navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: store.activeNav === item.key }"
          href="javascript:void(0)"
          @click="handleNavClick(item.key)"
        >
          {{ item.label }}
        </a>
      </nav>

      <!-- 右侧：用户信息 -->
      <div class="nav-user">
        <el-dropdown trigger="click" placement="bottom-end">
          <div class="user-trigger">
            <el-avatar :size="32" icon="UserFilled" class="user-avatar" />
            <span class="user-name">{{ store.userInfo.name }}</span>
            <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
          </div>

          <template #dropdown>
            <el-dropdown-menu>
              <!--
                角色切换入口说明：
                以下角色选项为 UI 预留，当前仅展示，不实现实际切换逻辑。
                不同角色可见的数据已在 store/app.js 的 statData 中定义：
                - 超级管理员：全部数据
                - 党支部书记：本支部数据
                - 普通党员：个人相关数据
                - 积极分子：受限视图
              -->
              <el-dropdown-item disabled class="role-group-title">
                <strong>切换角色（功能预留）</strong>
              </el-dropdown-item>
              <el-dropdown-item
                v-for="(label, role) in store.roleLabels"
                :key="role"
                :class="{ 'is-active-role': store.currentRole === role }"
                @click="store.switchRole(role)"
              >
                <span v-if="store.currentRole === role" class="role-check">✓</span>
                <span :style="{ marginLeft: store.currentRole === role ? '0' : '20px' }">
                  {{ label }}
                </span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.top-nav {
  position: sticky;
  top: 0;
  z-index: 1000;
  width: 100%;
  height: 60px;
  /* 红色背景 - 使用纯色，如需背景纹理图可替换为：
     background-image: url('@/assets/images/backgrounds/red-bg-pure.jpg');
     当前使用党建红纯色背景 */
  background: linear-gradient(135deg, #C12C1F 0%, #D4332A 50%, #C12C1F 100%);
  box-shadow: var(--shadow-nav);
}

.nav-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 品牌标识 */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-emblem {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.brand-name {
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  white-space: nowrap;
}

/* 导航菜单 */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 0;
}

.nav-item {
  padding: 8px 18px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 500;
  border-radius: 4px;
  transition: all 0.25s ease;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.15);
  }

  &.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.25);
    font-weight: 700;
  }
}

/* 用户区域 */
.nav-user {
  flex-shrink: 0;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }
}

.user-avatar {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.user-name {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.dropdown-icon {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.role-group-title {
  pointer-events: none;
  color: var(--text-secondary) !important;
}

.is-active-role {
  color: var(--party-red) !important;
  font-weight: 600;
}

.role-check {
  color: var(--party-red);
  font-weight: 700;
}

/* 响应式：小屏幕隐藏部分导航文字 */
@media (max-width: 1200px) {
  .nav-item {
    padding: 8px 12px;
    font-size: 14px;
  }
}

@media (max-width: 992px) {
  .brand-name {
    font-size: 16px;
  }

  .nav-item {
    padding: 6px 10px;
    font-size: 13px;
  }

  .user-name {
    display: none;
  }
}

@media (max-width: 768px) {
  .nav-menu {
    gap: 2px;
  }

  .nav-item {
    padding: 6px 8px;
    font-size: 12px;
  }
}
</style>
