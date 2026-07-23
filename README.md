# 党建云平台——党员发展全过程管理系统

高校党建云平台前端项目，基于 Vue 3 + TypeScript + Element Plus 构建。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API, `<script setup lang="ts">`) |
| 语言 | TypeScript |
| 构建工具 | Vite 8 |
| UI 库 | Element Plus 2 |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 4 |
| 样式 | SCSS |

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`。

```bash
npm run build      # 生产构建
npm run preview    # 预览构建产物
npm run typecheck  # TypeScript 类型检查（需 vue-tsc 兼容的 TS 版本）
```

## 项目结构

```
src/
├── main.ts                       # 入口文件
├── App.vue                       # 根组件（全局布局：导航 + 路由视图 + 底部）
├── env.d.ts                      # TypeScript 类型声明
├── router/index.ts               # 路由配置 + 导航守卫
├── stores/app.ts                 # Pinia 全局状态（角色、Mock 数据）
├── styles/global.scss            # 全局样式 + CSS 变量
├── views/
│   ├── index.vue                 # 首页
│   ├── development.vue           # 党员发展模块首页（搜索筛选 + 成员列表）
│   ├── members.vue               # 成员管理（占位）
│   ├── activities.vue            # 活动中心（占位）
│   ├── statistics.vue            # 数据统计（占位）
│   ├── downloads.vue             # 下载专区（占位）
│   └── development/
│       ├── MemberDetail.vue      # 成员培养主页（左右两栏 + 标签页）
│       └── BatchAdjust.vue       # 批量身份调整（三步流程）
├── components/
│   ├── TopNav.vue                # 顶部导航栏（sticky，全局）
│   ├── FooterBar.vue             # 底部版权信息（全局）
│   ├── SmartAssistant.vue        # 智能助手悬浮按钮（全局）
│   ├── StatCards.vue             # 统计卡片行
│   ├── CarouselBanner.vue        # 轮播图
│   ├── NewsSection.vue           # 党建新闻 + 通知公告
│   ├── QuickEntries.vue          # 快捷入口
│   ├── AdjustIdentityDialog.vue  # 调整身份弹窗
│   └── development/
│       └── IdentityTimeline.vue  # 身份历史时间线组件
└── assets/images/                # 图片素材（党徽、轮播图等）
```

## 路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 统计卡片 + 轮播图 + 新闻公告 |
| `/members` | 成员管理 | 占位页 |
| `/development` | 党员发展 | 成员列表 + 搜索筛选 + 分页 |
| `/development/member/:id` | 成员培养详情 | 基本信息卡片 + 培养记录/思想汇报/活动参与/身份历史 |
| `/development/batch` | 批量调整身份 | 三步：选择成员 → 设置目标 → 确认执行 |
| `/activities` | 活动中心 | 占位页 |
| `/statistics` | 数据统计 | 占位页 |
| `/downloads` | 下载专区 | 占位页 |

## 功能模块

### 首页
- 统计卡片（总成员数、积极分子、发展对象、本周活动），悬停上浮效果
- 轮播图自动播放，支持手动切换
- 党建新闻 + 通知公告双栏
- 快捷入口（思想汇报、下载专区、党校学习、培养档案）

### 党员发展模块
- **成员列表**：搜索筛选（支部/身份/关键词）+ 分页 + 批量调整入口
- **成员培养主页**：左侧基本信息卡片 + 右侧四个标签页
  - 培养记录：材料列表 + 上传材料
  - 思想汇报：状态标记（待审核/已通过/已驳回）
  - 活动参与：签到状态
  - 身份历史：时间线 + 颜色区分 + 点击展开详情
- **调整身份弹窗**：目标身份选择 + 原因填写 + 培养联系人 + 二次确认
- **批量调整**：多选成员 → 统一设置目标身份 → 二次确认

### 智能助手
- 右下角悬浮按钮，脉冲动画，功能预留

## 角色权限

顶部用户下拉菜单可切换角色，不同角色数据范围不同：

| 角色 | 权限 |
|------|------|
| 超级管理员 | 查看全院数据，可调整身份，可批量操作 |
| 党支部书记（支委） | 查看本支部数据，可调整身份，可批量操作 |
| 普通党员 | 仅看个人数据，无权调整身份 |
| 积极分子 | 受限视图，无权调整身份 |

## 设计规范

- 主色调：党建红 `#C12C1F`
- 页面最大宽度 1400px，居中
- 白色卡片 + 柔和阴影 `0 2px 12px rgba(0,0,0,0.06)`
- 圆角 `8px` / `12px`
- 响应式适配：桌面端 → 平板（1024px）→ 手机（768px）

## Mock 数据说明

当前所有数据均为组件内 Mock 数据，用于 UI 展示和交互验证：
- 成员列表 24 条（覆盖 4 个支部、5 种身份）
- 培养材料、思想汇报、活动参与、身份历史各若干条
- 教师名单 6 人
- API 调用位置均已用 `TODO` 注释标注

## 变更记录

| 版本 | 内容 |
|------|------|
| v1.0 | 首页 Demo |
| v1.1 | 党员发展模块：成员培养详情 + 调整身份弹窗 + 批量调整 + 身份历史时间线 |
| v1.2 | 全项目 JavaScript → TypeScript 迁移 |
| v1.3 | 全局布局重构（TopNav/FooterBar/SmartAssistant 提升至 App.vue） |
