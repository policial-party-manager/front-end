# 党建云平台——党员发展全过程管理系统

高校党建云平台前端 Demo，基于 Vue 3 + Element Plus 构建。

## 技术栈

- **框架**: Vue 3 (Composition API, `<script setup>`)
- **构建工具**: Vite
- **UI 库**: Element Plus
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **样式**: SCSS

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173` 即可查看效果。

## 项目结构

```
src/
├── main.js                    # 入口文件
├── App.vue                    # 根组件
├── router/index.js            # 路由配置
├── stores/app.js              # Pinia 全局状态（Mock 数据）
├── styles/global.scss         # 全局样式 + CSS 变量
├── views/
│   └── index.vue              # 首页主文件
├── components/
│   ├── TopNav.vue             # 顶部导航栏（sticky）
│   ├── StatCards.vue          # 统计卡片行
│   ├── CarouselBanner.vue     # 轮播图
│   ├── NewsSection.vue        # 党建新闻 + 通知公告
│   ├── QuickEntries.vue       # 快捷入口
│   ├── FooterBar.vue          # 底部版权信息
│   └── SmartAssistant.vue     # 智能助手悬浮按钮
└── assets/images/             # 图片素材
```

## 页面板块

1. **顶部导航栏** - 红色背景，党徽 + 平台名称，6个导航菜单项，用户头像及角色切换下拉菜单
2. **统计卡片** - 总成员数、积极分子、发展对象、本周活动，悬停上浮效果
3. **轮播图** - 3张轮播图，自动播放，支持手动切换
4. **双栏内容区** - 左侧党建新闻，右侧通知公告，悬停高亮
5. **快捷入口** - 思想汇报、下载专区、党校学习、培养档案
6. **底部版权** - 版权声明及备案信息
7. **智能助手** - 右下角悬浮按钮（UI 占位）

## 角色说明

在顶部用户下拉菜单中预留了角色切换入口（当前为 UI 展示 + 数据联动）：

| 角色 | 可见数据范围 |
|------|-------------|
| 超级管理员 | 全平台数据 |
| 党支部书记 | 本支部数据 |
| 普通党员 | 个人相关数据 |
| 积极分子 | 受限视图 |

## 设计规范

- 主色调：党建红 `#C12C1F`
- 宽屏设计，最大宽度 1400px，两侧留白
- 白色卡片 + 柔和阴影
- 响应式适配（桌面端 / 平板 / 手机）
