import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/system-logs-${process.pid}`,
    server: { host: "127.0.0.1", port: 5194, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const log = (id, overrides = {}) => ({
  id: `log-${id}`,
  logType: "OPERATION",
  module: "用户管理",
  action: `动作${id}`,
  method: "POST",
  path: "/api/v4/admin/users",
  operatorId: 1,
  operatorName: "超级管理员",
  role: "super_admin",
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0",
  success: true,
  resultCode: 200,
  errorType: null,
  message: `说明${id}`,
  durationMs: 12,
  occurTime: 1757300000000,
  occurTimeText: "2026-09-08T10:00:00+08:00",
  ...overrides,
});
const ok = (route, data) => route.fulfill({ json: { code: 200, message: "ok", data } });
const delay = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function eventually(fn, hint = "") {
  for (let i = 0; i < 175; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.fail(`等待行为完成超时 ${hint}`);
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 } });
  const errors = [],
    unexpected = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  });
  await context.addInitScript(() => {
    if (location.protocol !== "http:") return;
    if (!localStorage.getItem("party_access_token")) {
      localStorage.setItem("party_access_token", "test-access");
      localStorage.setItem("party_refresh_token", "test-refresh");
      localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role: "super_admin" }));
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    rows: [log(1), log(2, { logType: "LOGIN", method: null, path: null, durationMs: null, resultCode: null })],
    total: 2,
    stats: { LOGIN: 5, LOGOUT: 3, OPERATION: 0, ERROR: 2 },
    requests: [],
    statsRequests: 0,
    pageFail: null,
    statsFail: false,
    statsRaw: null,
    pageGate: null,
    statsGate: null,
    ...options,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    state.requests.push({ path, method: req.method(), params: Object.fromEntries(url.searchParams) });
    if (path === "/api/v1/auth/refresh")
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        role: "super_admin",
        username: "admin",
      });
    if (path === "/api/v4/admin/logs/stats") {
      state.statsRequests++;
      if (state.statsGate) await state.statsGate.promise;
      if (state.statsFail)
        return route.fulfill({ status: 500, json: { code: 500, message: "Elasticsearch 日志服务暂不可用" } });
      return ok(route, state.statsRaw ?? state.stats);
    }
    if (path === "/api/v4/admin/logs/page") {
      if (state.pageGate) await state.pageGate.promise;
      if (state.pageFail)
        return route.fulfill({
          status: state.pageFail,
          json: { code: state.pageFail, message: state.pageMessage || "日志服务暂不可用" },
        });
      return ok(route, { records: state.rows, total: state.total, page: 1, size: 10 });
    }
    unexpected.push(`${req.method()} ${path}`);
    return route.abort();
  });
  await page.goto(`${baseURL}/system/logs`);
  await page.locator(".stats-section").waitFor();
  return { page, state, context };
}

const card = (page, type) => page.locator(`.stats-card[data-type="${type}"]`);
const tableRows = (page) => page.locator(".logs-table tbody tr");
/** el-select 的 placeholder 渲染成 span 而非 input，按位置索引更稳。 */
async function chooseFilter(page, index, name) {
  await page.locator(".filters .el-select").nth(index).click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("四类统计各自独立展示，计数 0 显示 0 而不是占位符", async (t) => {
  const { page } = await fixture(t);
  await eventually(async () => (await card(page, "LOGIN").innerText()).includes("5"));
  assert.match(await card(page, "LOGIN").innerText(), /登录\s*5\s*条/);
  assert.match(await card(page, "LOGOUT").innerText(), /登出\s*3\s*条/);
  // 0 是合法计数，必须与“尚未加载”区分开。
  assert.match(await card(page, "OPERATION").innerText(), /操作\s*0\s*条/);
  assert.match(await card(page, "ERROR").innerText(), /错误\s*2\s*条/);
  assert.doesNotMatch(await card(page, "OPERATION").innerText(), /—/);
});

test("统计失败只影响统计区，列表照常展示且可单独重试", async (t) => {
  const { page, state } = await fixture(t, { statsFail: true });
  await page.locator(".stats-error").waitFor();
  assert.match(await page.locator(".stats-error").innerText(), /日志统计加载失败/);
  assert.equal(await page.locator(".stats-card").count(), 0);
  // 列表独立成功：统计失败不得连带清空或报错。
  await eventually(async () => (await tableRows(page).count()) === 2);
  assert.equal(await page.locator(".logs-table .el-alert").count(), 0);
  state.statsFail = false;
  await page.locator(".stats-error").getByRole("button", { name: "重试", exact: true }).click();
  await eventually(async () => (await card(page, "LOGIN").innerText()).includes("5"));
});

test("统计响应缺字段或含负数视为异常，不默认补 0 冒充真实计数", async (t) => {
  const { page, state } = await fixture(t, { statsRaw: { LOGIN: 5, LOGOUT: 3, OPERATION: 0 } });
  await page.locator(".stats-error").waitFor();
  state.statsRaw = { LOGIN: 5, LOGOUT: -1, OPERATION: 0, ERROR: 2 };
  await page.locator(".stats-error").getByRole("button", { name: "重试", exact: true }).click();
  await eventually(async () => (await page.locator(".stats-error").count()) === 1);
  assert.equal(await page.locator(".stats-card").count(), 0);
});

test("日志服务 500 提示服务不可用并隐藏空表，不谎称无数据", async (t) => {
  const { page } = await fixture(t, { pageFail: 500, pageMessage: "Elasticsearch 日志服务暂不可用" });
  const alert = page.locator(".el-alert--error").filter({ hasText: "日志服务不可用" });
  await alert.waitFor();
  assert.match(await alert.innerText(), /Elasticsearch/);
  // 与“暂无日志数据”互斥：失败时不渲染表格。
  assert.equal(await page.locator(".logs-table").count(), 0);
});

test("参数或权限被拒（400/403）不当成服务故障", async (t) => {
  for (const status of [400, 403]) {
    const { page } = await fixture(t, { pageFail: status });
    const alert = page.locator(".el-alert--error").filter({ hasText: "日志数据加载失败" });
    await alert.waitFor();
    assert.doesNotMatch(await alert.innerText(), /Elasticsearch/);
    assert.match(await alert.innerText(), /权限不足|参数不合法/);
  }
});

test("筛选收敛空值后提交，翻页与筛选不重复请求统计", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(() => state.statsRequests === 1);
  await chooseFilter(page, 0, "登录");
  await page.getByRole("textbox", { name: "操作人", exact: true }).fill(" 超级管理员 ");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await eventually(() => state.requests.some((r) => r.path.endsWith("/logs/page") && r.params.logType === "LOGIN"));
  const applied = state.requests.filter((r) => r.path.endsWith("/logs/page")).pop();
  assert.equal(applied.params.logType, "LOGIN");
  assert.equal(applied.params.operatorName, "超级管理员");
  assert.equal(applied.params.page, "1");
  // 空筛选不得以空串发送，避免后端把 "" 当有效条件。
  for (const key of ["keyword", "ip", "module", "errorType", "success", "startTime", "endTime"])
    assert.equal(key in applied.params, false, `${key} 不应出现`);
  assert.equal(state.statsRequests, 1);
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await eventually(() => state.requests.filter((r) => r.path.endsWith("/logs/page")).length >= 3);
  assert.equal(state.statsRequests, 1);
});

test("日期区间反向时无法确认，搜索不会带非法时间参数", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(() => state.requests.some((r) => r.path.endsWith("/logs/page")));
  const pageCalls = () => state.requests.filter((r) => r.path.endsWith("/logs/page")).length;
  const before = pageCalls();
  // 区间选择器的可编辑输入在 .el-range-input 上，面板中的同名输入需排除。
  const start = page.locator(".filters .el-range-input").first();
  const end = page.locator(".filters .el-range-input").last();
  await start.click();
  await start.fill("2026-09-10 00:00:00");
  await start.press("Enter");
  await end.click();
  await end.fill("2026-09-01 00:00:00");
  await end.press("Enter");
  // Element Plus 自身就禁止反向区间：面板确认按钮置灰，值不会写入。
  const confirm = page.locator(".el-picker-panel__footer").getByRole("button", { name: "确定", exact: true });
  await confirm.waitFor();
  assert.equal(await confirm.isDisabled(), true);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await eventually(() => state.requests.filter((r) => r.path.endsWith("/logs/page")).length > before);
  // 关键约束：反向区间绝不能以 startTime/endTime 发到后端（服务端会静默返回空集）。
  const sent = state.requests.filter((r) => r.path.endsWith("/logs/page")).pop();
  assert.equal("startTime" in sent.params, false);
  assert.equal("endTime" in sent.params, false);
  assert.equal(await start.inputValue(), "");
  assert.equal(await end.inputValue(), "");
});

test("耗时与状态码的 0 是合法值，不显示为占位符", async (t) => {
  const { page, state } = await fixture(t, {
    rows: [log(1, { durationMs: 0, resultCode: 0, module: "", message: "" })],
    total: 1,
  });
  await eventually(async () => (await tableRows(page).count()) === 1);
  assert.match(await tableRows(page).first().innerText(), /\b0 ms\b/);
  assert.doesNotMatch(await tableRows(page).first().innerText(), /— ms/);
  const pageCalls = state.requests.filter((r) => r.path.endsWith("/logs/page")).length;
  await tableRows(page).first().getByRole("button", { name: "详情", exact: true }).click();
  const drawer = page.locator(".el-drawer");
  await drawer.waitFor();
  assert.match(await drawer.innerText(), /状态码\s*0/);
  assert.match(await drawer.innerText(), /耗时\s*0 ms/);
  // 详情复用列表行数据，不另发起请求。
  await page.waitForTimeout(150);
  assert.equal(state.requests.filter((r) => r.path.endsWith("/logs/page")).length, pageCalls);
});

test("空日志列表显示暂无数据而不是错误", async (t) => {
  const { page } = await fixture(t, { rows: [], total: 0 });
  await page.locator(".logs-table").waitFor();
  await eventually(async () => (await page.locator(".logs-table").innerText()).includes("暂无日志数据"));
  assert.equal(await page.locator(".el-alert--error").count(), 0);
  assert.equal(await page.locator(".pagination").count(), 0);
});

test("刷新统计期间旧值不冒充最新结果，失败后清空卡片", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(async () => (await card(page, "LOGIN").innerText()).includes("5"));
  state.statsGate = delay();
  state.stats = { LOGIN: 99, LOGOUT: 99, OPERATION: 99, ERROR: 99 };
  await page.getByRole("button", { name: "刷新统计", exact: true }).click();
  await eventually(async () => (await page.locator(".stats-cards.loading").count()) === 1);
  assert.match(await card(page, "LOGIN").innerText(), /统计中/);
  state.statsFail = true;
  state.statsGate.resolve();
  await page.locator(".stats-error").waitFor();
  assert.equal(await page.locator(".stats-card").count(), 0);
});

test("同角色换号清空统计与列表并重新拉取，旧响应不写回", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(async () => (await tableRows(page).count()) === 2);
  const pageCalls = state.requests.filter((r) => r.path.endsWith("/logs/page")).length;
  const statsCalls = state.statsRequests;
  state.pageGate = delay();
  state.statsGate = delay();
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: "super_admin", username: "other" });
  });
  await eventually(async () => (await tableRows(page).count()) === 0);
  await eventually(() => state.requests.filter((r) => r.path.endsWith("/logs/page")).length > pageCalls);
  assert.ok(state.statsRequests > statsCalls);
  state.pageGate.resolve();
  state.statsGate.resolve();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
});

test("390px 窄屏下筛选区不把页面撑出横向滚动", async (t) => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await eventually(async () => (await tableRows(page).count()) === 2);
  // 日期区间内部两段输入有内容最小宽度，grid/flex 未约束时会把整行顶出视口。
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.equal(overflow.scrollWidth, overflow.clientWidth);
  const timeBox = await page.locator(".filters .filter-time").boundingBox();
  assert.ok(timeBox.x + timeBox.width <= overflow.clientWidth + 1, JSON.stringify(timeBox));
});
