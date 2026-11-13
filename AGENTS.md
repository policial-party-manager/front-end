# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 仓库修改边界

- 本规则适用于本前端仓库的所有任务：仅修改本仓库内与任务相关的前端代码、测试、配置及文档。
- 后端仓库仅用于只读核对接口契约与实现；不得修改后端代码、SQL、配置或数据库，也不得以完成前端任务为由扩大修改范围。
- 如果任务依赖后端变更，先说明所需变更、原因及受影响的前端工作；继续推进不依赖该变更的部分。只有用户另行明确授权后，才能开展后端修改。

## Project Overview

党建云平台（"党员发展全过程管理系统"）— a university party-building SPA for managing party-member development lifecycle: member development stages, activities, news/notices, statistics, and downloadable resources. Built with Vue 3 + TypeScript + Element Plus + Vite. All UI text and code comments are in Chinese — keep that style when adding code.

## Commands

npm is the package manager (CI uses `npm ci`). Scripts from `package.json`:

| Command                           | What it does                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`                     | Start Vite dev server (default http://localhost:5173)                                      |
| `npm run build`                   | Production build to `dist/`                                                                |
| `npm run preview`                 | Preview the production build                                                               |
| `npm run typecheck`               | `vue-tsc --noEmit` TypeScript check                                                        |
| `npm run check:permissions`       | Check page permissions, session fences and development preview policy                      |
| `npm run lint`                    | `eslint src --ext .vue,.ts,.js --fix` (auto-fixes; `no-console` is an error in production) |
| `npm run format` / `format:check` | Prettier write / check (`printWidth: 120`, double quotes, semicolons)                      |
| `npm run test:branches`           | 支部表单浏览器回归（Node.js 测试运行器 + `playwright-core`）                               |
| `npm run test:member-import`      | 成员 Excel 导入浏览器回归（同上）                                                          |
| `npm run test:members`            | 成员管理浏览器回归（同上）                                                                 |
| `npm run test:system`             | 系统管理（角色 + 操作日志）浏览器回归，同时运行两个脚本                                    |

No general unit/e2e framework is configured. Browser regression scripts live in `scripts/` and follow one pattern: they start their own Vite server, intercept business HTTP inside an isolated browser context, and never reach the real backend. Install Chromium first (`npx playwright-core install chromium`) or pass `PLAYWRIGHT_CHROMIUM_EXECUTABLE` with an existing binary path.

CI (`.github/workflows/ci.yml`) runs `format:check` → eslint → `typecheck` → `branch-regressions` → `member-import-regressions` → `member-management-regressions` → `system-management-regressions` → `build` on push/PR to `main`; the build job needs every regression job to pass.

## Architecture

### Global layout

`App.vue` renders the business shell: `TopNav` + left `SideNav` + `<router-view>` + `FooterBar` + floating `SmartAssistant`. `/login` uses an independent full-screen layout. Mobile sidebar behavior switches at 680px.

### Navigation (requires touching 2 files)

Nav items live in the Pinia store (`navItems` in `src/stores/app.ts`); the highlight state `activeNav` is synced in `router.beforeEach` (`src/router/index.ts`) via a `pathKeyMap`. To add a top-level nav entry you must update **both** the store's `navItems` and the guard's `pathKeyMap`.

### State & mock data

`src/stores/app.ts` is the only Pinia store; session state lives in `src/utils/session.ts`. The store exposes role/nav/layout state and retains Mock data. Homepage news/notices now come from `src/api/content.ts`; statistics and to-dos remain examples.

接口接入和模块盘点前阅读 `docs/前后端接入现状.md`。以 `src/router/index.ts` 判断实际页面：党员发展、我的培养、支委成员、统计和资源中心仍为占位路由；仓库中保留的旧 Mock 原型不代表已开放。后端已有报名、二维码签到、培养和统计接口，不能继续笼统写成“后端尚无接口”。

### Role permissions

角色和页面权限定义于 `src/config/permissions.ts`，守卫在 `src/router/index.ts`。正式登录角色映射为 `super_admin`、`party_secretary`、`party_member`；`activist` 仅兼容旧 Mock 与开发预览。政治身份独立于角色，`party_member` 不证明当前用户是党员。

只有开发环境 `VITE_SKIP_LOGIN=true` 且无 access token 时允许免登录预览及切换角色。真实登录后沿用服务端角色。权限变更运行 `npm run check:permissions`；服务端负责最终鉴权及范围校验，不能仅靠前端菜单隐藏。

### Component registration

Element Plus and **all its icons are registered globally** in `src/main.ts`, so `<el-*>` components and icon components (e.g. `<Search />`, `<ArrowDown />`) work in templates with no import. Exceptions: `ElMessage` / `ElMessageBox` are still imported explicitly from `element-plus` when used in script. Vue itself is never auto-imported — import from `vue` normally.

### Styling

- SCSS. Theme color is 党建红 `#C12C1F`.
- CSS custom properties (e.g. `--party-red`, `--shadow-card`, `--radius-base`) are defined once in `src/styles/global.scss` — prefer `var(--…)` over hardcoded values.
- `vite.config.ts` injects SCSS variables `$party-red`, `$party-red-dark`, `$party-red-light` into **every** SFC via `css.preprocessorOptions.scss.additionalData` — usable directly in `<style lang="scss">`.
- Reusable layout classes: `.page-container` (max-width 1400px), `.section-title`, `.content-card`, `.more-link`.
- Responsive breakpoints: 1200px / 992px / 768px / 576px.

### Assets & paths

- Path alias `@` → `src` (configured in both `vite.config.ts` and `tsconfig.json`).
- Images are referenced via `new URL("@/assets/…", import.meta.url).href`, never string paths.

### Shared components worth knowing

- `src/views/content/ContentArticle.vue` serves both `/news/:id` and `/notice/:id`; `ContentList.vue` shares their list implementation. Old `ContentDetail.vue` is not mounted by current routes. Preserve safe plain-text rendering of server content.
- `src/views/activity/ActivityForm.vue` is shared by create (`/activity/create`) and edit (`/activity/edit/:id`) routes.
- `src/views/development/MemberDetail.vue` is a retained Mock prototype; current development routes mount `WorkspacePlaceholder.vue`.

## Notes

- `README.md` summarizes mounted pages; `docs/前后端接入现状.md` separates frontend integration from backend capability. Verify owning code when behavior changes, and update these docs together.
- `unplugin-auto-import` / `unplugin-vue-components` are present in `devDependencies` but **not** wired into `vite.config.ts` — do not rely on them.
- ESLint ignores `*.d.ts`, `vite.config.*`, and `src/assets/**`; `vue/multi-word-component-names` is off (single-word names like `index.vue` / `TopNav` are fine).

## Agent skills

- 读写 GitHub 任务前阅读 `docs/agents/issue-tracker.md`，使用 gh 并遵守发布与关闭授权边界。
- 任务分类前阅读 `docs/agents/triage-labels.md`。
- 探索领域前按 `docs/agents/domain.md` 读取词汇表和相关 ADR。
