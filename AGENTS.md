# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
| `npm run lint`                    | `eslint src --ext .vue,.ts,.js --fix` (auto-fixes; `no-console` is an error in production) |
| `npm run format` / `format:check` | Prettier write / check (`printWidth: 120`, double quotes, semicolons)                      |

No test framework is configured. CI (`.github/workflows/ci.yml`) runs `format:check` → eslint → `typecheck` → `build` on push/PR to `main`.

## Architecture

### Global layout

`App.vue` renders a fixed shell around every page: sticky `TopNav` + `<router-view>` + `FooterBar` + floating `SmartAssistant`. A new page is just a new view component plus a route entry — the shell is already in place.

### Navigation (requires touching 2 files)

Nav items live in the Pinia store (`navItems` in `src/stores/app.ts`); the highlight state `activeNav` is synced in `router.beforeEach` (`src/router/index.ts`) via a `pathKeyMap`. To add a top-level nav entry you must update **both** the store's `navItems` and the guard's `pathKeyMap`.

### State & mock data

`src/stores/app.ts` is the only Pinia store. It holds the current role, nav items, and the shared mock data (news, notices, banners, quick entries, user info). Role switching (TopNav dropdown) drives data scoping — e.g. `statData` is a computed that returns different numbers per role.

共享状态中的新闻、通知、轮播图、快捷入口和用户信息等数据仍为 Mock。活动模块已通过 `src/api/activities.ts` 接入服务端活动与类型接口；其他尚未接入的模块仍可能使用 Mock，并以 `TODO: 替换为真实 API 调用` 标记待接入位置。

### Role permissions

Four roles: `super_admin`, `party_secretary`, `party_member`, `activist` (type `Role` in the store). Views check permissions with computed values derived from `store.currentRole` (see `src/views/resources/index.vue` for the full pattern: `canManage`, `isSuperAdmin`, and branch-scoped uploader checks).

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

- `src/views/ContentDetail.vue` intentionally serves **both** `/news/:id` and `/notice/:id` detail pages (type inferred from `route.path`); keep it shared unless the two genuinely diverge — see the design rationale comment at the top of the file.
- `src/views/activity/ActivityForm.vue` is shared by create (`/activity/create`) and edit (`/activity/edit/:id`) routes.
- `src/views/development/MemberDetail.vue` is the largest feature view (tabbed: 培养记录 / 思想汇报 / 活动参与 / 身份历史).

## Notes

- `README.md` is stale — it still lists several pages as placeholders that are actually implemented (statistics, downloads/resources, news/notice, activity). Prefer reading the code and `src/router/index.ts` over the README for the current page inventory.
- `unplugin-auto-import` / `unplugin-vue-components` are present in `devDependencies` but **not** wired into `vite.config.ts` — do not rely on them.
- ESLint ignores `*.d.ts`, `vite.config.*`, and `src/assets/**`; `vue/multi-word-component-names` is off (single-word names like `index.vue` / `TopNav` are fine).
