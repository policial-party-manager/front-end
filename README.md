# 党建云平台——党员发展全过程管理系统

面向高校基层党组织的党员发展全过程管理前端。项目覆盖成员管理、党员培养、党建活动、新闻公告、数据统计和资料下载等场景，采用 Vue 3、TypeScript、Element Plus 与 Vite 构建。

> 当前项目处于前后端联调阶段：登录、验证码、退出和 Token 刷新已接入后端认证接口；其余业务模块主要使用前端 Mock 数据和模拟异步交互。

## 功能概览

- 登录认证：邮箱验证码登录、账号密码登录、JWT 持久化、Token 自动刷新和退出登录。
- 首页看板：角色相关统计卡片、党建轮播图、新闻公告和快捷入口。
- 成员管理：身份统计、组合筛选、分页、新增、编辑、删除和 CSV 导出；Excel 导入尚为占位功能。
- 党员发展：培养成员筛选、成员培养详情、培养记录、思想汇报、活动参与、身份历史、单人及批量身份调整。
- 新闻公告：新闻/公告列表、关键词与日期筛选、共享详情页、富文本正文和附件列表。
- 活动管理：活动筛选、新建/编辑、状态相关操作、签到二维码、签到记录、报名列表和 ECharts 活动统计。
- 数据统计：周期切换、培养阶段分布、支部人数对比、关键指标、发展趋势和多维明细表。
- 下载专区：分类检索、资源卡片、详情预览，以及按角色控制的上传、编辑和删除入口。
- 全局外壳：固定顶部导航、页脚和智能助手悬浮入口；登录页使用独立全屏布局。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端框架 | Vue 3.5、Composition API、`<script setup lang="ts">` |
| 开发语言 | TypeScript 6 |
| 构建工具 | Vite 8 |
| UI 与图标 | Element Plus、`@element-plus/icons-vue` |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 4 |
| HTTP | Axios |
| 图表 | ECharts 6 |
| 二维码 | qrcode |
| 样式 | SCSS、CSS 自定义属性 |
| 代码质量 | ESLint 10、Prettier 3、vue-tsc |

实际安装版本以 `package-lock.json` 为准。

## 环境要求

- Node.js 20（与 GitHub Actions CI 保持一致）
- npm（项目提交了 `package-lock.json`）
- 可访问的后端认证服务；未登录访问业务路由会被重定向到 `/login`

## 快速开始

```bash
npm ci
npm run dev
```

默认访问地址：`http://localhost:5173`。

开发和生产环境的 API 前缀均由环境变量设置：

```env
VITE_API_BASE_URL=/api
```

开发服务器会将 `/api` 代理到 `vite.config.ts` 中配置的后端地址。首次运行前请将其中的 `server.proxy["/api"].target` 修改为实际后端地址。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建生产版本到 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run typecheck` | 执行 `vue-tsc --noEmit` |
| `npm run lint` | 检查并自动修复 `src` 下的 Vue/TS/JS 文件 |
| `npm run format` | 使用 Prettier 格式化 `src` |
| `npm run format:check` | 检查 `src` 的格式，不写入文件 |

项目当前没有配置单元测试或端到端测试框架。

## 项目结构

```text
.
├── .github/workflows/ci.yml       # GitHub Actions：格式、Lint、类型检查、构建
├── docs/
│   └── 前端开发计划与策略.md      # 前端功能规划、角色权限与协作策略
├── public/                        # 公共 SVG 资源
├── src/
│   ├── api/
│   │   ├── auth.ts                # 登录、验证码、刷新 Token、退出接口
│   │   └── request.ts             # Axios 实例、统一响应与 401 刷新重试
│   ├── assets/images/             # 登录背景、轮播图、党徽素材
│   ├── components/
│   │   ├── activity/              # 活动统计图表
│   │   ├── development/           # 身份历史时间线
│   │   ├── AdjustIdentityDialog.vue
│   │   ├── CarouselBanner.vue
│   │   ├── FooterBar.vue
│   │   ├── NewsSection.vue
│   │   ├── QuickEntries.vue
│   │   ├── SmartAssistant.vue
│   │   ├── StatCards.vue
│   │   └── TopNav.vue
│   ├── router/index.ts            # 路由表、登录守卫、页面标题与导航高亮
│   ├── stores/app.ts              # 唯一 Pinia Store：会话、角色和首页数据
│   ├── styles/global.scss         # 全局变量、重置样式和复用布局类
│   ├── utils/token.ts             # access/refresh token 本地存储
│   ├── views/
│   │   ├── activity/              # 活动列表、表单、详情
│   │   ├── development/           # 成员培养详情、批量身份调整
│   │   ├── news/                  # 新闻列表
│   │   ├── notice/                # 公告列表
│   │   ├── resources/             # 下载专区
│   │   ├── ContentDetail.vue      # 新闻/公告共享详情页
│   │   ├── Login.vue
│   │   ├── development.vue        # 党员发展列表
│   │   ├── index.vue              # 首页
│   │   ├── members.vue            # 成员管理
│   │   └── statistics.vue         # 数据统计
│   ├── App.vue                    # 全局页面外壳
│   └── main.ts                    # 应用入口和全局组件注册
├── .env.development
├── .env.production
├── eslint.config.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

`src/views/activities.vue` 和 `src/views/downloads.vue` 是早期遗留的占位页，当前路由分别使用 `activity/ActivityList.vue` 和 `resources/index.vue`。

## 路由表

除 `/login` 外，所有路由都需要本地存在 access token。

| 路径 | 页面 | 主要能力 |
| --- | --- | --- |
| `/login` | 登录 | 邮箱验证码、账号密码、扫码 UI |
| `/` | 首页 | 统计、轮播、新闻公告、快捷入口 |
| `/members` | 成员管理 | 筛选、分页、增删改、CSV 导出 |
| `/development` | 党员发展 | 培养成员列表、角色数据范围、批量调整入口 |
| `/development/member/:id` | 成员培养详情 | 培养记录、思想汇报、活动参与、身份历史 |
| `/development/batch` | 批量身份调整 | 成员筛选、目标身份、原因和二次确认 |
| `/news` | 党建新闻 | 列表、关键词/日期筛选、分页 |
| `/news/:id` | 新闻详情 | 富文本正文、封面、附件 |
| `/notice` | 通知公告 | 列表、关键词/日期筛选、分页 |
| `/notice/:id` | 公告详情 | 富文本正文、附件 |
| `/activity` | 活动管理 | 列表筛选、状态操作、新建入口 |
| `/activity/create` | 新建活动 | 活动信息、时间、参与范围和封面 |
| `/activity/edit/:id` | 编辑活动 | 与新建页共用表单 |
| `/activity/:id` | 活动详情 | 签到二维码、签到记录、报名、统计 |
| `/statistics` | 数据统计 | ECharts 图表、指标卡、多维表格 |
| `/resources` | 下载专区 | 分类检索、预览、下载和管理操作 |

## 登录与接口约定

认证接口位于 `src/api/auth.ts`，请求层位于 `src/api/request.ts`：

- `POST /v1/auth/login/userpass`：用户名密码登录
- `POST /v1/auth/login/email`：邮箱验证码登录
- `POST /v1/auth/login/phone`：手机号验证码登录（已封装，登录页暂未提供入口）
- `POST /v1/auth/verifyCode`：发送验证码
- `POST /v1/auth/refresh`：刷新 access token
- `POST /v1/auth/logout`：退出登录

请求层约定后端返回：

```ts
interface ApiResponse<T> {
  code: number; // 200 表示成功
  message: string;
  data: T;
}
```

成功响应会直接解包为 `data`。请求自动携带 `Authorization: Bearer <accessToken>`；普通业务请求收到 401 后会尝试刷新 Token 并重放一次，刷新失败则清理会话并跳转登录页。

后端角色会映射为前端角色：

| 后端角色 | 前端角色 |
| --- | --- |
| `super_admin` | `super_admin`（超级管理员） |
| `branch_admin` | `party_secretary`（党支部书记） |
| `student` | `party_member`（普通党员） |
| 其他值 | 回退为 `party_member` |

前端另保留 `activist`（积极分子）角色，用于演示受限视图。

## 角色与权限

当前权限主要在页面组件中通过 `store.currentRole` 进行前端演示控制，不能替代后端鉴权。

| 角色 | 当前前端行为 |
| --- | --- |
| 超级管理员 | 查看全量 Mock 数据；成员管理；身份调整；活动新建、编辑、删除、签到、归档；管理全部资源 |
| 党支部书记 | 多数列表限定为 Mock 的“计算机学院学生第一党支部”；可调整身份、管理本支部活动和支部资源 |
| 普通党员 | 以查看为主；活动列表仅显示“报名中”活动；无成员编辑和身份调整权限 |
| 积极分子 | 与普通党员类似的受限视图 |

顶部用户菜单提供角色切换，便于在 Mock 阶段检查不同视图。统计页的支部级数据过滤目前仅保留了实现说明，尚未启用。

## 数据与功能完成度

| 模块 | 当前数据来源 | 尚未接入或仅模拟的部分 |
| --- | --- | --- |
| 认证 | 真实后端 API | 扫码登录仅生成占位二维码；手机号登录未出现在页面 |
| 首页 | Pinia Mock | 快捷入口和智能助手暂无实际业务跳转/对话能力 |
| 成员管理 | 组件内 Mock | 查询、增删改为本地状态；Excel 导入未实现；导出为前端 CSV |
| 党员发展 | 组件内 Mock | 材料上传、身份调整和批量调整未调用后端 |
| 新闻公告 | 组件内 Mock | 附件下载仅保留交互入口 |
| 活动管理 | 组件内 Mock | 发布、编辑、删除、归档、签到和导出均未持久化 |
| 数据统计 | 可复现随机 Mock | Excel 导出与角色数据隔离未接入 |
| 下载专区 | 组件内 Mock | 上传、编辑、删除、下载和图片预览均为演示逻辑 |

业务接口接入点已在源码中以 `TODO: 替换为真实 API 调用` 或同类注释标记。

## 关键架构约定

### 全局布局

`App.vue` 在业务页外统一渲染 `TopNav`、`router-view`、`FooterBar` 和 `SmartAssistant`。`/login` 使用独立布局，不显示全局外壳。

### 导航同步

新增顶级导航时需要同时修改：

1. `src/stores/app.ts` 中的 `navItems`。
2. `src/router/index.ts` 导航守卫中的 `pathKeyMap`。

### 组件注册

Element Plus 及其全部图标在 `src/main.ts` 全局注册。`ElMessage`、`ElMessageBox` 等命令式 API 仍需在使用文件中显式导入。Vue API 不支持自动导入。

### 样式与资源

- 主题色为党建红 `#C12C1F`。
- 全局 CSS 变量和复用类定义在 `src/styles/global.scss`。
- Vite 为每个 SCSS SFC 注入 `$party-red`、`$party-red-dark`、`$party-red-light`。
- 通用布局类包括 `.page-container`、`.section-title`、`.content-card` 和 `.more-link`。
- `@` 指向 `src`；脚本中的图片通常通过 `new URL("@/assets/...", import.meta.url).href` 引用。
- 主要响应式断点为 1200px、992px、768px 和 576px。

## 持续集成

GitHub Actions 在推送到 `main`、`feature/**`、`fix/**`，以及面向 `main` 的 Pull Request 时运行：

1. `npm ci`
2. `npm run format:check`
3. `npx eslint src --ext .vue,.ts,.js`
4. `npm run typecheck`
5. `npm run build`

`main` 分支推送构建成功后会上传 `dist/` 为 Pages 构建产物，但工作流当前未包含实际部署步骤。
