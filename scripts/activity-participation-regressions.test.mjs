import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/activity-participation-${process.pid}`,
    server: { host: "127.0.0.1", port: 5196, strictPort: false },
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

const activity = (id = 9) => ({
  id,
  branchId: 1,
  branchName: "第一支部",
  title: "主题党日活动",
  description: "简介",
  type: 1,
  typeName: "主题党日",
  cover: null,
  startTime: "2026-09-08T09:00:00",
  endTime: "2026-09-08T11:00:00",
  location: null,
  locationDescription: "会议室",
  signStart: "2026-09-08T08:30:00",
  signEnd: "2026-09-08T09:10:00",
  maxParticipants: 50,
  status: 1,
  creatorId: 1,
  createTime: "2026-09-01T10:00:00",
  updateTime: null,
});
const signup = (id, userId) => ({
  id,
  activityId: 9,
  userId,
  signupTime: "2026-09-05T10:00:00",
});
const sign = (id, userId, overrides = {}) => ({
  id,
  activityId: 9,
  userId,
  signTime: "2026-09-08T08:55:00",
  signType: "sign",
  device: "iPhone",
  location: "POINT(116 39)",
  remark: null,
  ...overrides,
});
/** 最小可信 xlsx 签名（ZIP 本地文件头），足以验证前端不会把错误页存成表格。 */
const xlsxBody = () => Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
const jsonBody = (message) => Buffer.from(JSON.stringify({ code: 400, message }), "utf8");

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 } });
  const errors = [],
    unexpected = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  });
  await context.addInitScript((role) => {
    if (location.protocol !== "http:") return;
    if (!localStorage.getItem("party_access_token")) {
      localStorage.setItem("party_access_token", "test-access");
      localStorage.setItem("party_refresh_token", "test-refresh");
      localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role }));
    }
    window.downloads = [];
    const native = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      window.downloads.push(blob.size);
      return native(blob);
    };
    HTMLAnchorElement.prototype.click = function () {};
  }, options.role || "super_admin");
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    requests: [],
    detailFail: false,
    detailMessage: "活动不存在",
    signupRows: [signup(1, 101), signup(2, 102)],
    signupTotal: 2,
    signRows: [sign(1, 101), sign(2, 102, { signType: "makeup", signTime: null, device: null, location: null })],
    signTotal: 2,
    signupGate: null,
    exportError: false,
    exportMessage: "导出失败",
    exportMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ...options,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    state.requests.push({ path, method: req.method(), params: Object.fromEntries(url.searchParams) });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "super_admin" });
    // 非授权角色会被守卫踢回首页，首页资讯接口需给出可渲染响应。
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    const detail = path.match(/^\/api\/v4\/activities\/(\d+)$/);
    if (detail) {
      if (state.detailFail) return route.fulfill({ status: 400, json: { code: 400, message: state.detailMessage } });
      return ok(route, activity(Number(detail[1])));
    }
    const adminDetail = path.match(/^\/api\/v4\/admin\/activities\/(\d+)$/);
    if (adminDetail) return ok(route, activity(Number(adminDetail[1])));
    const publishedDetail = path.match(/^\/api\/v2\/content\/activities\/(\d+)$/);
    if (publishedDetail) return ok(route, activity(Number(publishedDetail[1])));
    if (/^\/api\/v4\/activities\/\d+\/signups\/page$/.test(path)) {
      if (state.signupGate) await state.signupGate.promise;
      return ok(route, {
        records: state.signupRows,
        total: state.signupTotal,
        page: Number(url.searchParams.get("page") || 1),
        size: Number(url.searchParams.get("size") || 10),
      });
    }
    if (/^\/api\/v4\/activities\/\d+\/signs\/page$/.test(path))
      return ok(route, {
        records: state.signRows,
        total: state.signTotal,
        page: Number(url.searchParams.get("page") || 1),
        size: Number(url.searchParams.get("size") || 10),
      });
    if (/^\/api\/v4\/activities\/\d+\/signs\/export$/.test(path)) {
      const body = state.exportError ? jsonBody(state.exportMessage) : xlsxBody();
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": state.exportError
            ? state.exportMime
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body,
      });
    }
    unexpected.push(`${req.method()} ${path}`);
    return route.abort();
  });
  const id = options.id ?? 9;
  await page.goto(`${baseURL}${options.path || `/activity/${id}/participation`}`);
  return { page, state, context };
}

const listCalls = (state, kind) => state.requests.filter((r) => r.path.endsWith(`/${kind}/page`));

test("预检失败时停止名单与导出请求，并说明跨支部与不存在同文案", async (t) => {
  const { page, state } = await fixture(t, { detailFail: true, detailMessage: "活动不存在" });
  await page.getByTestId("precheck-error").waitFor();
  assert.match(await page.getByTestId("precheck-error").innerText(), /活动不存在/);
  assert.match(await page.getByTestId("precheck-error").innerText(), /不区分/);
  assert.equal(listCalls(state, "signups").length, 0);
  assert.equal(listCalls(state, "signs").length, 0);
  assert.equal(state.requests.filter((r) => r.path.endsWith("/signs/export")).length, 0);
  assert.equal(await page.getByTestId("signup-table").count(), 0);
});

test("报名名单按服务端分页展示，total 取自分页响应而非当前页行数", async (t) => {
  const { page, state } = await fixture(t, { signupTotal: 47 });
  await eventually(async () => (await page.getByTestId("signup-total").innerText()).includes("47"));
  const first = state.requests.find((r) => r.path.endsWith("/signups/page"));
  assert.equal(first.params.page, "1");
  assert.equal(first.params.size, "10");
  assert.equal("userId" in first.params, false);
  await eventually(async () => (await page.getByTestId("signup-table").innerText()).includes("101"));
  assert.equal(await page.locator("[data-testid='signup-table'] tbody tr").count(), 2);
  // 页签懒加载：签到名单在首次切换到该页签前不应被请求。
  assert.equal(listCalls(state, "signs").length, 0);
  await page.getByRole("tab", { name: "签到记录" }).click();
  await eventually(() => listCalls(state, "signs").length === 1);
  assert.match(await page.getByTestId("sign-total").innerText(), /共 2 条签到记录/);
});

test("成员编号只接受正整数，非法输入不发请求并保留上一次查询条件", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(() => listCalls(state, "signups").length === 1);
  const filter = page.getByTestId("signup-user-filter");
  for (const illegal of ["abc", "0", "-3", "1.5", "1e3"]) {
    await filter.fill(illegal);
    await page.getByTestId("signup-search").click();
    assert.match(await page.locator(".list-error").innerText(), /成员编号必须是正整数/);
    assert.equal(listCalls(state, "signups").length, 1, `非法输入 ${illegal} 不应发起请求`);
  }
  await filter.fill(" 101 ");
  await page.getByTestId("signup-search").click();
  await eventually(() => listCalls(state, "signups").length === 2);
  const applied = listCalls(state, "signups").at(-1);
  assert.equal(applied.params.userId, "101");
  assert.equal(applied.params.page, "1");
});

test("筛选变化回到第一页，翻页大小变化同样回到第一页", async (t) => {
  const { page, state } = await fixture(t, { signupTotal: 90 });
  await eventually(() => listCalls(state, "signups").length === 1);
  await page.locator("[data-testid='signup-pagination'] .el-pager li").filter({ hasText: /^2$/ }).click();
  await eventually(() => listCalls(state, "signups").length === 2);
  assert.equal(listCalls(state, "signups").at(-1).params.page, "2");
  await page.getByTestId("signup-user-filter").fill("102");
  await page.getByTestId("signup-search").click();
  await eventually(() => listCalls(state, "signups").length === 3);
  const afterFilter = listCalls(state, "signups").at(-1);
  assert.equal(afterFilter.params.page, "1");
  assert.equal(afterFilter.params.userId, "102");
  await page.getByTestId("signup-reset").click();
  await eventually(() => listCalls(state, "signups").length === 4);
  assert.equal("userId" in listCalls(state, "signups").at(-1).params, false);
  assert.equal(await page.getByTestId("signup-user-filter").inputValue(), "");
});

test("未知签到类型标为未知，不冒充本人签到也不隐藏原值", async (t) => {
  const { page } = await fixture(t, {
    signRows: [
      sign(1, 101),
      sign(2, 102, { signType: "manual-audit" }),
      sign(3, 103, { signType: null, signTime: null }),
    ],
    signTotal: 3,
  });
  await page.getByRole("tab", { name: "签到记录" }).click();
  await eventually(async () => (await page.locator("[data-testid='sign-table'] tbody tr").count()) === 3);
  const text = await page.getByTestId("sign-table").innerText();
  assert.match(text, /本人签到/);
  assert.match(text, /未知类型（manual-audit）/);
  assert.match(text, /未标注类型/);
  assert.doesNotMatch(text, /未知类型[^（]*\n[^]*补签/);
});

test("导出请求不带筛选与分页参数，失败时不保存为 xlsx", async (t) => {
  const { page, state } = await fixture(t, { exportError: true, exportMime: "application/octet-stream" });
  await eventually(async () => (await page.getByTestId("export-signs").isEnabled()) === true);
  await page.getByTestId("signup-user-filter").fill("101");
  await page.getByTestId("signup-search").click();
  await eventually(() => listCalls(state, "signups").some((r) => r.params.userId === "101"));
  await page.getByTestId("export-signs").click();
  await page.getByTestId("export-error").waitFor();
  assert.match(await page.getByTestId("export-error").innerText(), /导出失败/);
  const sent = state.requests.filter((r) => r.path.endsWith("/signs/export"));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].params, {});
  assert.equal(await page.evaluate(() => window.downloads.length), 0);
  state.exportError = false;
  await page.getByTestId("export-signs").click();
  await eventually(async () => (await page.evaluate(() => window.downloads.length)) === 1);
});

test("导出只出一次请求，进行中重复点击不重复下载", async (t) => {
  const { page, state } = await fixture(t);
  const gate = delay();
  await eventually(async () => (await page.getByTestId("export-signs").isEnabled()) === true);
  // 用响应延迟模拟网关慢返回，验证按钮在途期间被锁定。
  await page.route(/\/api\/v4\/activities\/\d+\/signs\/export$/, async (route) => {
    await gate.promise;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: xlsxBody(),
    });
  });
  await page.getByTestId("export-signs").click();
  await page
    .getByTestId("export-signs")
    .click({ force: true })
    .catch(() => undefined);
  gate.resolve();
  await eventually(async () => (await page.evaluate(() => window.downloads.length)) === 1);
  assert.equal(state.requests.filter((r) => r.path.endsWith("/signs/export")).length, 0);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.downloads.length), 1);
});

test("换号后清空名单并重新预检，旧响应不写回新会话", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(async () => (await page.locator("[data-testid='signup-table'] tbody tr").count()) === 2);
  const before = listCalls(state, "signups").length;
  state.signupGate = delay();
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: "super_admin", username: "other" });
  });
  await eventually(() => listCalls(state, "signups").length > before);
  // 旧会话的在途响应回来时不能覆盖新会话的数据。
  state.signupRows = [];
  state.signupTotal = 0;
  state.signupGate.resolve();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
  const prechecks = state.requests.filter((r) => /^\/api\/v4\/activities\/\d+$/.test(r.path));
  assert.ok(prechecks.length >= 2);
});

test("非管理角色直访参与页被路由拦截，不发起任何参与接口请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  assert.equal(await page.getByTestId("signup-table").count(), 0);
  assert.equal(
    state.requests.filter((r) => r.path.startsWith("/api/v4/activities")).length,
    0,
    JSON.stringify(state.requests),
  );
});

test("支委可进入参与页，范围仍由服务端判定", async (t) => {
  const { page, state } = await fixture(t, { role: "party_secretary" });
  await eventually(async () => (await page.locator("[data-testid='signup-table'] tbody tr").count()) === 2);
  assert.equal(state.requests.filter((r) => r.path === "/api/v4/activities/9").length, 1);
  assert.equal(state.requests.filter((r) => r.path.startsWith("/api/v4/admin")).length, 0);
});

test("活动详情页为管理者提供参与管理入口，普通成员不展示", async (t) => {
  const { page } = await fixture(t, { path: "/activity/9" });
  await page.getByTestId("open-participation").waitFor();
  // 入口说明不得再声称完全不提供签到记录操作。
  assert.doesNotMatch(await page.locator(".schedule-note").innerText(), /不提供报名、签到、二维码或签到记录操作/);
  await page.getByTestId("open-participation").click();
  await eventually(async () => new URL(page.url()).pathname === "/activity/9/participation");
  await eventually(async () => (await page.locator("[data-testid='signup-table'] tbody tr").count()) === 2);
});

test("普通成员在活动详情看不到参与管理入口", async (t) => {
  const { page } = await fixture(t, { role: "party_member", path: "/activity/9" });
  await eventually(async () => (await page.locator(".activity-detail-page").count()) === 1);
  assert.equal(await page.getByTestId("open-participation").count(), 0);
  assert.match(await page.locator(".schedule-note").innerText(), /不提供报名、签到、二维码或签到记录操作/);
});

test("非法活动编号不请求任何接口", async (t) => {
  const { page, state } = await fixture(t, { id: "abc" });
  await eventually(async () => (await page.locator(".page-alert").first().innerText()).includes("活动编号无效"));
  assert.equal(state.requests.filter((r) => r.path.startsWith("/api/v4/activities")).length, 0);
});

test("390px 窄屏下工具栏与表格不把页面撑出横向滚动", async (t) => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 }, signupTotal: 40 });
  await eventually(async () => (await page.locator("[data-testid='signup-table'] tbody tr").count()) === 2);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.equal(overflow.scrollWidth, overflow.clientWidth);
  const filterBox = await page.getByTestId("signup-user-filter").boundingBox();
  assert.ok(filterBox.x + filterBox.width <= overflow.clientWidth + 1, JSON.stringify(filterBox));
});
