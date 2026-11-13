# Issue #26 系统管理验收记录

核对日期：2026-11-13。前端基线 `origin/main` = `e9704e7`（PR #44），本任务分支 `feat/issue-26-system-management-completion`；后端只读基线 `f2bc9d8`（未修改后端代码、SQL、配置或数据库）。Issue #26 仍为 Open，开始核对时无开放 PR。

本文并列记录：前端实现与本次修复、隔离浏览器回归、本机真实后端联调、本机真实 Elasticsearch 下的日志正常路径验收。**本机真实后端与本地 ES 验证不等于预发或生产验收**；本机已覆盖日志正常有数据路径，B 层成立，C 层仍需按授权推送、CI 与 Issue 结论评论后关闭。

## 验收标准逐项结论

| Issue #26 验收标准                                                                  | 结论                                           | 实现与证据                                                                                                                                                                                                                                                                                                                                   | 剩余边界                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 仅超级管理员可查看系统管理入口和页面；非授权角色访问被路由与服务端拒绝              | 已满足（前端 + 服务端双重）                    | `stores/app.ts` 仅 `super_admin` 追加「系统管理」菜单；`router` 的 `/system` 父路由 `meta.permission='system:manage'`、`roles:['super_admin']`，守卫不满足则告警跳首页；后端 `AdminController` 类级 `@PreAuthorize("hasRole('SUPER_ADMIN')")`，联调中无令牌请求返回 403                                                                      | 前端判断是入口收敛，不是动态授权；服务端拒绝才是安全边界                                                                  |
| 角色列表、详情、新增、编辑、权限分配、后端允许的删除                                | 已满足                                         | `src/api/roles.ts` 7 个函数与 `src/views/system/roles.vue`；本次联调覆盖新增→分配权限→编辑→删除全流程回读                                                                                                                                                                                                                                    | 编辑只改描述：`roleCode` 服务端用 `tb_role.role_name` 派生且后端鉴权依赖 `hasRole('SUPER_ADMIN')`，前端锁定编码并明确告知 |
| 权限点使用服务端返回的字典，删除前提示使用人数并二次确认                            | 已满足                                         | 字典取 `GET /v4/admin/roles/permission-names`（真实 7 项内置权限），本次改为三态状态机；删除确认展示 `roleCode` 与 `userCount`（含 0），取消不发 `DELETE`                                                                                                                                                                                    | 字典未就绪时禁止保存（全量覆盖会写成不完整结果）                                                                          |
| 日志页分页、类型/模块/操作者/时间等筛选和统计，处理空数据、加载失败、日志服务不可用 | 已满足（本机真实 ES 已覆盖正常与异常两条路径） | 列表沿用 #37 能力并加会话隔离；统计为本次新增 `getLogStats` + 四类卡片。本机启动 ES 8.13.4 后，页面四类统计与 `/logs/stats` 逐项一致、首屏与 `/logs/page` 一致、详情抽屉含真实 `method/path/durationMs`、类型/时间筛选与接口一致、真实空区间显示「暂无日志数据」、真实翻页与第 2 页接口一致；停掉 ES 时返回 500 并显示服务不可用态、隐藏空表 | 证据来自本机单节点 ES，非预发/生产集群；ES 生命周期不在本仓库管理                                                         |
| 若提供日志清理入口，明确保留天数、影响范围、删除数量并二次确认                      | 条件未触发，不适用                             | 本次不提供清理入口，前端不调用 `/logs/cleanup`；后端虽已有 `DELETE /logs/cleanup`（`days` 默认 90，合法 1–730），接入属独立需求                                                                                                                                                                                                              | 未实现，不写成已完成；一旦开放需补范围说明、二次确认与结果展示                                                            |
| 不把服务端新建角色自动映射成前端业务菜单                                            | 已满足                                         | `src/config/permissions.ts` 仍只映射 `super_admin/branch_admin/student`，未知编码回落 `party_member`；权限分配弹窗文案如实标注为「角色-权限映射维护」，不承诺动态授权立即生效                                                                                                                                                                | 动态授权规则需单独设计                                                                                                    |

## 日志统计契约（本次新增）

后端只读核对：`AdminController` 的 `GET /api/v4/admin/logs/stats` 返回 `Result<Map<String,Long>>`，`AdminOperationLogServiceImpl.stats()` 遍历 `LOG_TYPES=[LOGIN,LOGOUT,ERROR,OPERATION]` 逐类 `count` 放入 `LinkedHashMap`。

前端 `src/api/logs.ts` 新增 `LogType`、`LOG_TYPES`、`LogStats = Record<LogType, number>`、`parseLogStats`、`getLogStats`：

- 调用 `/v4/admin/logs/stats`（请求层 baseURL 已含 `/api`），不传关键词、时间或分页参数。
- 响应必须是对象，四个键齐全且均为**非负安全整数**；`0` 合法。缺键、`null`、负数、小数、字符串一律抛错，**不默认补 0**，避免把「取不到」显示成真实计数。
- 统计与列表是两条独立数据流：统计失败只影响统计区，列表照常展示并可单独重试；反之亦然。
- 进入加载即清空旧值，失败停在错误态。刷新期间旧数字不得冒充最新结果。
- 统计只在进入页面、会话变化、显式刷新/重试时请求；筛选、重置、翻页、改页长不重复请求统计。
- 错误分类：无 `response`（断网、15s 超时）或 `status >= 500` 判为日志服务不可用；`400/403` 是后端明确拒绝，归为「加载失败」而非服务故障（依据 `GlobalExceptionHandler` 的 400/403/500 映射）。

## 本次角色页修复

| 问题                                                                 | 处理                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限字典用 `permissionNames.length` 粗判成败，合法空字典会被当成失败 | 改为 `permDictState = loading / ready / error` 状态机；空数组 + `ready` 是合法空字典                                                              |
| 详情与字典共用序号，快速切换会互相作废                               | 字典独立 `dictSequence`；权限弹窗用 `permEpoch` + `getRole(id)` 取服务端最新详情，不用列表旧快照                                                  |
| 字典外既有权限可能被静默丢弃                                         | `permUnknown` 保留字典外权限并在界面明确提示；提供显式「移除字典外权限」路径，不再无声覆盖                                                        |
| 写入成功但回读失败会被当成保存失败                                   | `loadRoles()` 返回 `boolean`；写成功即提示成功，回读失败单独提示「角色已保存，但列表回读失败」并保留重试入口                                      |
| 保存期间仍可关闭弹窗/Escape，丢弃在途结果                            | `saving` 在 `await validate()` 之前同步加锁；`close-on-click-modal=false`、`close-on-press-escape=!saving`、`before-close` 阻止关闭、取消按钮禁用 |
| 新增角色编码纯空格可提交                                             | 校验 `trim()` 后非空；提交前再 `trim()`，payload 仅 `{roleCode, description}`                                                                     |
| 编辑请求可能夹带 `roleCode`/`permissionNames`                        | 编辑只发 `{description}`；权限全量覆盖走独立端点 `PUT /roles/{id}/permissions`                                                                    |
| 无会话身份校验，换号后在途响应可能写回                               | 引入 `disposed` + `current(snapshot)`，写回前同时校验页面未卸载、序号匹配、会话身份有效、仍有权限                                                 |
| 删除确认未含使用人数、确认期间可能已换号                             | 确认文案含 `roleCode` 与 `userCount`（含 0）；取消不发请求；确认后再次校验会话与目标仍在列表                                                      |
| 清空全部权限无提示                                                   | `permOriginal.length > 0 && payload.length === 0` 时二次确认「确定清空」，取消不发请求                                                            |

## 本次日志页修复

- 新增全局统计区（四卡 + 刷新 + 错误重试），与列表失败互不影响，语义见上节。
- 增加 `disposed` + `current(snapshot)`、独立 `statsSequence`；`watch([canManage, sessionIdentity])` 在退出/换号/权限变化时清空列表、统计、详情并使用在途请求失效；`onBeforeUnmount` 同理。正常 401 令牌刷新保留页面状态（`applyRefreshedSession` 不改变身份）。
- `isServiceUnavailable` 收紧为「无 `response` → 服务不可用；有 `response` 仅 `status >= 500` → 服务不可用」，`400/403` 明确归为加载失败。
- `loadError` 时继续隐藏表格，避免「暂无日志数据」与服务不可用告警自相矛盾；服务不可用文案明确写「不是无数据」。
- 详情继续复用列表行数据（后端 `pageLogs` 已返回全字段），不额外发请求。
- 数值字段沿用 `??`：`durationMs`、`resultCode` 为 `0` 时显示 `0`，不显示占位符。

## 会话与异步一致性

两页统一采用成员管理页已验证的范式（`members.vue`）：顶层 `disposed` 标志 + `current(snapshot)` 组合判断；列表、字典、详情、统计各用独立请求序号；回写前同时确认页面未卸载、序号匹配、`isSessionIdentityCurrent(snapshot)` 为真、仍有权限。

未修改 `src/utils/route-view.ts`：`getRouteViewKey(route, role)` 保持 `path:role` 语义，`check-permissions.mjs` 的相关断言不变；同角色换号由页面 `watch(sessionIdentity)` 清空并重建，正常 token 轮换不触发清空。

## 验证与证据范围

### 本地检查

| 检查                                                      | 结果                                    |
| --------------------------------------------------------- | --------------------------------------- |
| `npm run test:system`                                     | 25/25 通过（角色 13 + 日志 12），约 20s |
| `npm run format:check`、只读 ESLint                       | 通过，无告警                            |
| `npm run typecheck`                                       | 通过                                    |
| `npm run check:permissions`                               | 通过（输出「权限矩阵校验通过」）        |
| `npm run build`                                           | 通过，仅既有 chunk 体积提示             |
| 新增脚本 / CI / package.json / AGENTS.md 的 Prettier 检查 | 通过                                    |
| `git diff --check`                                        | 通过                                    |

`scripts/system-roles-regressions.test.mjs`（13 项）：本地搜索命中编码与描述、空结果与空数据文案区分；编辑态 `roleCode` 只读且 `PUT` 只发 `description`；新增校验 `trim` 后非空；保存中双击只发一次且不允许关闭；写成功回读失败提示结果有效；字典失败禁用保存并可重试；权限全量覆盖并保留字典外 legacy 权限；清空全部权限需二次确认；删除确认含 `roleCode` 与使用人数（含 0）；同角色换号清空并作废在途详情；详情失败不展示半成品表单。

`scripts/system-logs-regressions.test.mjs`（11 项）：四类统计独立展示且 `0` 显示 `0`；统计失败只影响统计区并可单独重试；缺字段/负数视为异常不补 0；500 提示服务不可用并隐藏空表；400/403 不当服务故障；筛选收敛空值且翻页/筛选不重复请求统计；日期区间反向时无法确认、搜索不带非法时间参数；耗时/状态码 `0` 合法；空列表显示暂无数据；刷新统计期间旧值不冒充最新、失败清空卡片；同角色换号清空并重拉且旧响应不写回；390px 窄屏下筛选区不把页面撑出横向滚动（日期区间两段输入的最小宽度曾把整行顶出视口，已在 `.filters` 显式 `grid-template-columns: minmax(0, 1fr)` 并放开 `.el-range-input` 的 `min-width`）。

脚本只在本机隔离浏览器中于 HTTP 边界拦截，不连接业务后端，因此**不证明真实后端持久化或 ES 查询正确**。

为运行回归另设 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已安装的 `chromium-1223`：本机 `playwright-core@1.65.0` 期望 `chromium-1254`，本地未安装，与本次改动无关；CI 通过 `npx playwright-core install --with-deps chromium` 安装匹配版本。

### 远程 CI

`.github/workflows/ci.yml` 新增 `system-management-regressions` 作业（Node 20、`npm ci`、安装 Chromium、`npm run test:system`、`npm run check:permissions`），并加入 `build.needs`；两个新脚本同时纳入既有 `member-management-regressions` 作业的 Prettier 检查。自动合并策略未改动。

### 本机真实后端联调

后端以本机缓存 Maven 启动在 `:8080`，MySQL `3306`、Redis `6379` 为真实本机实例，使用真实超管账号登录，脚本 `.cache/issue-26-live/live-integration.mjs`，结果 `live-results.json`（均在 `.gitignore` 覆盖的本地目录，未提交凭据或令牌）。

真实联调 **16/16 通过**，无 HTTP 拦截、无模拟响应：

- 真实超管登录 `role=super_admin`；`GET /v4/admin/roles` 返回 3 个角色且带 `userCount`；`GET /v4/admin/roles/permission-names` 返回 7 项内置权限。
- 真实页面新增角色 `i26*****` 后 `GET` 回读成功，新增请求体不含 `permissionNames`。
- 真实页面分配权限后回读权限集合为 `{user:query, news:manage}`，确认走独立端点 `PUT /roles/{id}/permissions`，请求体不含 `roleCode`。
- 真实页面编辑：`roleCode` 输入框 `disabled`，`PUT /roles/{id}` 仅含 `description`，编码与权限均未变化。
- 真实页面删除确认文案含角色编码与「0 个用户使用」，确认后 `GET` 回读确认角色已不存在。
- 真实页面日志页在 ES 未启动时：`GET /v4/admin/logs/stats` 与 `/logs/page` 均返回 HTTP 500 +「Elasticsearch 日志服务暂不可用：Connection refused」，页面显示「日志服务不可用」并隐藏空表，统计区显示错误态而非 0。
- 浏览器无未处理异常。

联调只创建了 1 个临时角色，结束时已通过业务 API 删除并回读确认；未修改角色字典与既有角色，未执行 SQL、迁移或直接改库。

### 本机真实 Elasticsearch 下的日志正常路径

经授权后在本机 Docker 启动 ES，重新验证日志正常有数据路径。ES 为官方镜像 `docker.elastic.co/elasticsearch/elasticsearch:8.13.4`（与后端 `spring-boot-starter-data-elasticsearch` 客户端匹配），单节点、`xpack.security.enabled=false`、`-Xms512m -Xmx512m`，仅绑定 `127.0.0.1:9200`，未写入仓库任何配置。脚本 `.cache/issue-26-live/es-live.mjs`，结果 `es-live-results.json`。

真实 ES 验收 **19/19 通过**，无 HTTP 拦截、无模拟响应：

- 集群 `status=green`；`GET /v4/admin/logs/stats` 返回四个非负整数键，`GET /v4/admin/logs/page` 返回真实记录。
- 页面四类统计卡与接口逐项一致（实测 `LOGIN=16 / LOGOUT=1 / OPERATION=2 / ERROR=1`），且非全 0 桩数据。
- 列表首屏行数与接口 `records` 一致（10 条），最新一条的时间与类型标签渲染正确。
- 详情抽屉展示真实 `POST /api/v4/admin/roles`、状态码 `200` 与真实耗时，复用行数据且不额外请求。
- 按类型筛选「错误」后列表只含该类型且行数与接口一致；**列表筛选不改变全局统计**（统计与列表解耦）。
- 时间区间筛选（今日）行数与接口一致；未来区间真实返回空结果，页面显示「暂无日志数据」且不报错。
- 真实翻到第 2 页，首行与接口第 2 页首条一致。
- 点击「刷新统计」后与最新接口结果一致；全程浏览器无未处理异常。
- 真实操作产生的 OPERATION 日志（新增临时角色）可在列表中查到，超管登录/登出分别计入 LOGIN/LOGOUT，非法参数请求产生 ERROR 记录。

清理：新拉的 ES 容器与本地镜像属本机临时环境，验收结束后停止容器；临时角色已通过业务 API 删除并回读确认；**全程未发送 `/logs/cleanup`**。

### 截图（隔离浏览器 + 合成数据，非真实后端证据）

[角色管理](images/issue26/roles-desktop.png)、[权限分配](images/issue26/role-permissions-desktop.png)、[操作日志（统计与列表）](images/issue26/logs-desktop.png)。页面数据为拦截响应构造的合成数据，不含真实成员或日志内容。

[操作日志真实 ES 正常路径](images/issue26/logs-live-es.png)：本机真实后端 + 真实 ES 下拍摄，含真实四类统计与真实日志行（仅本机登录与临时角色操作记录）。

## 完成层级

- **A 前端可实施工作**：已完成（统计接入、两页一致性修复、25 项浏览器回归、本地全部检查、本文档）。
- **B 本机真实后端验证**：已完成。角色管理全流程、日志异常路径（ES 未启动）与日志正常路径（真实 ES 8.13.4）均已实测通过。
- **C 整个 Issue 收尾**：仅剩流程项——推送分支、发布 PR、等待 CI、发布 Issue 结论评论并关闭，均待明确授权。

## 最小后续行动

1. 取得授权后推送本分支并发布 PR，等待当前 HEAD 的 CI（含新增 `system-management-regressions` 作业）全绿。
2. CI 通过后发布 Issue #26 结论评论并关闭 Issue（需单独授权）。
3. 日志清理若被要求，按独立需求实现：保留天数、影响范围、删除数量二次确认与结果展示；当前前端无入口，不调用 `/logs/cleanup`。
4. 本机 `party-es` 容器与本机 ES 镜像为本次验收临时环境，可按需停止或删除；后端日志功能会随 ES 停止回到「服务不可用」态，属预期行为。
