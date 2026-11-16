import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 数据统计（政治身份分布）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 只请求分布端点且默认 college、五个维度发送精确枚举、总人数取服务端值不做归一化、
 * 服务端回显维度不一致时显式提示、空分组与 count=0 与缺列分别呈现、
 * 失败可重试且重试用当前维度、维度切换与换号后旧响应不写回、401 刷新后恰好重放一次、
 * 无令牌预览态零请求、普通成员被守卫拦截、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/statistics-distribution-${process.pid}`,
    server: { host: "127.0.0.1", port: 5199, strictPort: false },
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

const identity = (id, name, count, level = id ?? 0) => ({
  identityId: id,
  identityName: name,
  level,
  count,
});

/**
 * 默认夹具：两个分组。第一个分组的 total 故意大于身份人数之和（3 > 1+1），
 * 用于锁定「总人数原样展示、不补齐、不虚构身份」这条口径。
 */
const distributionFixture = () => ({
  dimension: "college",
  groups: [
    {
      key: "马克思主义学院",
      total: 3,
      identities: [identity(1, "中共正式党员", 1), identity(2, "入党积极分子", 1)],
    },
    {
      key: "信息工程学院",
      total: 2,
      identities: [identity(1, "中共正式党员", 2), identity(2, "入党积极分子", 0)],
    },
  ],
});

const ALLOWED_PATHS = new Set([
  "/api/v4/statistics/distribution",
  "/api/v4/user/profile",
  "/api/v1/auth/refresh",
  "/api/v2/content/news/page",
  "/api/v2/content/notices/page",
]);

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 } });
  const errors = [];
  const unexpected = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
  });
  await context.addInitScript(
    ({ role, withToken, previewRole }) => {
      if (location.protocol !== "http:") return;
      if (localStorage.getItem("party_access_token")) return;
      if (withToken) {
        localStorage.setItem("party_access_token", "test-access");
        localStorage.setItem("party_refresh_token", "test-refresh");
        localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role }));
        return;
      }
      // 无令牌的开发预览态：身份由预览角色决定，不能再依赖登录会话。
      if (previewRole) localStorage.setItem("party_dev_preview_role", previewRole);
    },
    { role: options.role || "super_admin", withToken: options.withToken !== false, previewRole: options.previewRole },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    requests: [],
    calls: 0,
    payload: distributionFixture(),
    failCalls: 0,
    unauthorized: 0,
    /** 按维度（或 "*" 通配）冻结响应体，用于验证竞态。 */
    gates: {},
    /** 只冻结第 N 次分布请求（按调用序号），用于验证“旧会话请求迟到”场景。 */
    nthGate: null,
    ...options.state,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (!ALLOWED_PATHS.has(path)) {
      unexpected.push(`${req.method()} ${path}`);
      return route.abort();
    }
    state.requests.push({
      path,
      method: req.method(),
      params: Object.fromEntries(url.searchParams),
      authorization: req.headers().authorization,
    });
    // 被守卫拦回首页、或测试中主动跳转个人中心时，这些页面自身的接口需要给出可渲染响应。
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v4/user/profile") return ok(route, null);
    if (path === "/api/v1/auth/refresh")
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        role: "super_admin",
        username: "admin",
      });
    // 分布端点：只接收 dimension，不应出现任何范围参数。
    state.calls++;
    const dimension = url.searchParams.get("dimension");
    if (state.unauthorized > 0) {
      state.unauthorized--;
      return route.fulfill({ status: 401, json: { code: 401, message: "登录令牌已过期" } });
    }
    if (state.failCalls > 0) {
      state.failCalls--;
      return route.fulfill({ status: 500, json: { code: 500, message: "统计服务暂时不可用" } });
    }
    const body = state.payload;
    if (state.nthGate && state.nthGate.call === state.calls) await state.nthGate.gate.promise;
    const gate = state.gates[dimension ?? "*"] ?? state.gates["*"];
    if (gate) await gate.promise;
    return ok(route, body);
  });
  await page.goto(`${baseURL}${options.path || "/statistics"}`);
  return { page, state, context };
}

const distributionRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/statistics/distribution");
const panel = (page) => page.getByTestId("stat-panel");
const tableRows = (page) => page.locator('[data-testid="stat-table"] .el-table__body tbody tr');

async function chooseDimension(page, label) {
  await page.getByTestId("stat-dimension").getByText(label, { exact: true }).click();
}

async function switchAccount(page, role = "super_admin") {
  await page.evaluate(async (nextRole) => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: nextRole, username: "other" });
  }, role);
}

async function signOut(page) {
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.clearSession();
  });
}

test("进入页面默认只请求一次 college，且不发送任何范围参数", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const calls = distributionRequests(state);
  assert.equal(calls.length, 1, JSON.stringify(state.requests));
  assert.equal(calls[0].params.dimension, "college");
  // 范围由服务端按登录态判定，前端传范围等于绕过服务端校验。
  for (const key of ["branchId", "userId", "scope", "college", "major", "className", "grade"])
    assert.equal(key in calls[0].params, false, `${key} 不应出现在请求参数中`);
  assert.equal(calls[0].path, "/api/v4/statistics/distribution");
});

test("五个维度切换各自发送精确枚举值", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const cases = [
    ["专业", "major"],
    ["班级", "className"],
    ["年级", "grade"],
    ["支部", "branch"],
    ["学院", "college"],
  ];
  for (const [label, value] of cases) {
    const before = distributionRequests(state).length;
    await chooseDimension(page, label);
    await eventually(() => distributionRequests(state).length > before);
    const last = distributionRequests(state).at(-1);
    assert.equal(last.params.dimension, value, `点击「${label}」应发送 ${value}`);
  }
  // 每个维度恰好一次，没有重复请求。
  assert.equal(distributionRequests(state).length, 6);
});

test("总人数取服务端值：total=3 而身份计数之和为 2 时不补齐、不虚构身份", async (t) => {
  const { page } = await fixture(t);
  await panel(page).waitFor();
  const first = tableRows(page).first();
  const text = await first.innerText();
  assert.match(text, /马克思主义学院/);
  assert.match(text, /\b3\b/);
  // 不得把总人数改成身份之和 2，也不得凭空造出第三项身份来凑总数。
  assert.doesNotMatch(text, /未登记/);
  const header = await page.locator('[data-testid="stat-table"] .el-table__header').innerText();
  assert.equal(header.includes("未登记"), false);
  // 口径说明必须存在并逐条覆盖。
  const caliber = await page.getByTestId("stat-caliber").innerText();
  assert.match(caliber, /全部成员数/);
  assert.match(caliber, /可能小于总人数/);
  assert.match(caliber, /未按成员启用\/停用状态过滤/);
  assert.match(caliber, /不等于「启用成员数」/);
});

test("身份列按响应动态生成：某组缺少该身份显示「—」，人数为 0 显示 0", async (t) => {
  const { page } = await fixture(t, {
    state: {
      payload: {
        dimension: "college",
        groups: [
          { key: "甲学院", total: 2, identities: [identity(1, "中共正式党员", 2)] },
          { key: "乙学院", total: 1, identities: [identity(1, "中共正式党员", 0), identity(2, "入党积极分子", 1)] },
        ],
      },
    },
  });
  await panel(page).waitFor();
  const header = await page.locator('[data-testid="stat-table"] .el-table__header').innerText();
  assert.match(header, /中共正式党员/);
  assert.match(header, /入党积极分子/);
  const rows = tableRows(page);
  // 甲学院没有「入党积极分子」这一项：显示「—」而非 0，避免被误读为真实 0 人。
  const firstRow = await rows.nth(0).innerText();
  assert.match(firstRow, /—/);
  // 乙学院的 0 是真实计数，必须显示 0 而不是占位符。
  const secondRow = await rows.nth(1).innerText();
  assert.match(secondRow, /\b0\b/);
});

test("服务端回显维度与请求不一致时明确提示实际采用的维度", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  assert.equal(await page.getByTestId("stat-dimension-echo").count(), 0);
  // 模拟后端对未知维度静默回退 college：请求 major，回显 college。
  state.payload = { ...distributionFixture(), dimension: "college" };
  await chooseDimension(page, "专业");
  const echo = page.getByTestId("stat-dimension-echo");
  await echo.waitFor();
  const text = await echo.innerText();
  assert.match(text, /所选维度为「专业」/);
  assert.match(text, /服务端实际按「学院」统计/);
  // 标题也不能把回退结果说成「按专业分组」。
  assert.doesNotMatch(await panel(page).locator(".section-heading").innerText(), /按专业分组/);
});

test("空分组展示空态而非错误，且不渲染表格", async (t) => {
  const { page } = await fixture(t, { state: { payload: { dimension: "college", groups: [] } } });
  await page.getByTestId("stat-empty").waitFor();
  assert.match(await page.getByTestId("stat-empty").innerText(), /暂无分组数据/);
  assert.equal(await page.getByTestId("stat-error").count(), 0);
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
});

test("groups 或 identities 为 null 时按空集合处理，不抛错也不伪造数字", async (t) => {
  const { page } = await fixture(t, {
    state: { payload: { dimension: "college", groups: [{ key: "未填写", total: 0, identities: null }] } },
  });
  await panel(page).waitFor();
  const header = await page.locator('[data-testid="stat-table"] .el-table__header').innerText();
  // 只有固定的「分组」「总人数」两列，不凭空生成身份列。
  assert.equal(header.includes("—"), false);
  const row = await tableRows(page).first().innerText();
  assert.match(row, /未填写/);
});

test("分组 key 为 null 时显示「未填写」，超长中文分组名不撑破表格", async (t) => {
  const { page } = await fixture(t, {
    state: {
      payload: {
        dimension: "branch",
        groups: [
          {
            key: "这是一个非常非常长的党支部名称用于验证超长中文分组名不会把表格撑破也不影响其他列读取",
            total: 7,
            identities: [identity(1, "中共正式党员", 7)],
          },
          { key: null, total: 1, identities: [identity(1, "中共正式党员", 1)] },
        ],
      },
    },
  });
  await panel(page).waitFor();
  const rows = await tableRows(page).count();
  assert.equal(rows, 2);
  const last = await tableRows(page).nth(1).innerText();
  // 后端把 null key 归入「未填写」；前端遇到 null 也要有确定文案，不能渲染空单元格。
  assert.match(last, /未填写/);
});

test("请求失败展示错误与重试，重试使用当前选中维度而非默认维度", async (t) => {
  const { page, state } = await fixture(t, { state: { failCalls: 1 } });
  const errorCard = page.getByTestId("stat-error");
  await errorCard.waitFor();
  assert.match(await errorCard.innerText(), /统计服务暂时不可用/);
  // 失败时必须清空表格，不能把上一次结果留在页面上冒充本次数据。
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
  await chooseDimension(page, "支部");
  await eventually(() => distributionRequests(state).some((r) => r.params.dimension === "branch"));
  await panel(page).waitFor();
  // 失败再重试：重试必须带当前维度。
  const before = distributionRequests(state).length;
  state.failCalls = 1;
  await chooseDimension(page, "年级");
  await errorCard.waitFor();
  await page.getByTestId("stat-retry").click();
  await eventually(() => distributionRequests(state).length > before + 1);
  assert.equal(distributionRequests(state).at(-1).params.dimension, "grade");
  await panel(page).waitFor();
});

test("请求失败来自业务 code!=200 时同样进入错误态而非空态", async (t) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (location.protocol !== "http:") return;
    localStorage.setItem("party_access_token", "test-access");
    localStorage.setItem("party_refresh_token", "test-refresh");
    localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role: "super_admin" }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await context.route(`${baseURL}/api/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v4/statistics/distribution")
      return route.fulfill({ status: 200, json: { code: 400, message: "统计维度参数不合法" } });
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return route.fulfill({ json: { code: 200, message: "ok", data: { records: [], total: 0 } } });
    return route.abort();
  });
  await page.goto(`${baseURL}/statistics`);
  const errorCard = page.getByTestId("stat-error");
  await errorCard.waitFor();
  assert.match(await errorCard.innerText(), /统计维度参数不合法/);
  assert.equal(await page.getByTestId("stat-empty").count(), 0);
});

test("维度快速切换：慢的旧维度响应不覆盖新维度结果", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const gate = delay();
  state.gates.major = gate;
  // 专业响应被冻结，随后立刻切到支部（正常返回）。
  state.payload = { ...distributionFixture(), dimension: "major" };
  await chooseDimension(page, "专业");
  await eventually(() => distributionRequests(state).some((r) => r.params.dimension === "major"));
  state.payload = {
    dimension: "branch",
    groups: [{ key: "本科生第一党支部", total: 9, identities: [identity(1, "中共正式党员", 9)] }],
  };
  await chooseDimension(page, "支部");
  await eventually(async () => (await panel(page).innerText()).includes("本科生第一党支部"));
  gate.resolve();
  await page.waitForTimeout(300);
  // 迟到的 major 响应不得写回：表格仍应是支部数据。
  const text = await panel(page).innerText();
  assert.match(text, /本科生第一党支部/);
  assert.doesNotMatch(text, /马克思主义学院/);
  assert.equal(await page.getByTestId("stat-dimension-echo").count(), 0);
});

test("切换维度时先清空旧结果，不把上一个维度数据留在表格里", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const gate = delay();
  state.gates.branch = gate;
  await chooseDimension(page, "支部");
  await eventually(async () => (await page.getByRole("status").count()) === 1);
  // 加载中不得继续展示学院维度的旧表格。
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
  gate.resolve();
  await panel(page).waitFor();
});

test("同角色换号清空旧数据并重新拉取，旧会话迟到响应不写回", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const callsBefore = distributionRequests(state).length;
  const gate = delay();
  // 只冻结换号前的那一次请求；换号后的新请求正常返回，才能区分“旧响应是否被丢弃”。
  state.nthGate = { call: callsBefore + 1, gate };
  state.payload = {
    dimension: "branch",
    groups: [{ key: "旧会话支部", total: 88, identities: [identity(1, "中共正式党员", 88)] }],
  };
  await chooseDimension(page, "支部");
  await eventually(() => distributionRequests(state).some((r) => r.params.dimension === "branch"));
  state.payload = {
    dimension: "branch",
    groups: [{ key: "新会话支部", total: 6, identities: [identity(1, "中共正式党员", 6)] }],
  };
  await switchAccount(page);
  // 换号后旧数据必须立即丢弃，不能等新响应回来才消失。
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
  await eventually(async () => (await panel(page).innerText()).includes("新会话支部"));
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
  // 旧会话响应迟到也不得写回新会话页面。
  const text = await panel(page).innerText();
  assert.match(text, /新会话支部/);
  assert.doesNotMatch(text, /旧会话支部/);
});

test("退出登录后清空统计并停止请求", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  await signOut(page);
  await eventually(async () => (await panel(page).count()) === 0);
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
  await page.waitForTimeout(200);
  // 退出后进入无令牌预览态：显示登录提示且不再发业务请求。
  const alertText = await page.locator(".el-alert").first().innerText();
  assert.match(alertText, /数据统计需要登录/);
  const calls = distributionRequests(state).length;
  await page.waitForTimeout(300);
  assert.equal(distributionRequests(state).length, calls);
});

test("离页后迟到响应不写回页面", async (t) => {
  const { page, state } = await fixture(t);
  await panel(page).waitFor();
  const gate = delay();
  state.gates.branch = gate;
  await chooseDimension(page, "支部");
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/profile");
  });
  await eventually(async () => new URL(page.url()).pathname === "/profile");
  gate.resolve();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-testid="stat-table"]').count(), 0);
});

test("401 触发刷新后恰好重放一次分布请求", async (t) => {
  const { page, state } = await fixture(t, { state: { unauthorized: 1 } });
  await panel(page).waitFor();
  const calls = distributionRequests(state);
  assert.equal(calls.length, 2);
  assert.equal(state.requests.filter((r) => r.path === "/api/v1/auth/refresh").length, 1);
  assert.equal(calls[0].authorization, "Bearer test-access");
  assert.equal(calls[1].authorization, "Bearer new-access");
  // 正常刷新不改页面身份，不得把页面推进错误态或无权限提示。
  assert.equal(await page.getByTestId("stat-error").count(), 0);
  assert.equal(await page.getByText("当前身份无权查看数据统计").count(), 0);
});

test("无令牌的开发预览态显示需要登录且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { withToken: false, previewRole: "super_admin" });
  await eventually(async () => (await page.locator(".el-alert").count()) > 0);
  const alertText = await page.locator(".el-alert").first().innerText();
  assert.match(alertText, /数据统计需要登录/);
  assert.match(alertText, /不会请求真实统计数据/);
  await page.waitForTimeout(300);
  assert.equal(state.calls, 0, JSON.stringify(state.requests));
  assert.equal(await page.getByTestId("stat-panel").count(), 0);
});

test("普通成员直访被路由守卫拦回首页且零分布请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  await page.waitForTimeout(200);
  assert.equal(state.calls, 0, JSON.stringify(state.requests));
  assert.equal(await page.getByTestId("stat-panel").count(), 0);
});

test("390px 窄屏无整页横向溢出，表格仍可读取", async (t) => {
  const { page, state } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await panel(page).waitFor();
  // 多个身份列必然比视口宽：允许表格内部横向滚动，但不允许把整页顶出视口。
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  const box = await panel(page).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= overflow.clientWidth + 1, JSON.stringify(box));
  // 关键内容在窄屏上仍可读到。
  assert.match(await panel(page).innerText(), /马克思主义学院/);
  assert.match(await page.getByTestId("stat-caliber").innerText(), /未按成员启用\/停用状态过滤/);
  assert.equal(distributionRequests(state).length, 1);
});

test("支委身份正常访问并标注本支部范围", async (t) => {
  const { page, state } = await fixture(t, { role: "party_secretary" });
  await panel(page).waitFor();
  assert.match(await page.locator(".scope-tag").innerText(), /本支部范围/);
  assert.match(await page.getByTestId("stat-caliber").innerText(), /党支部书记为本人所属支部/);
  assert.equal(distributionRequests(state).length, 1);
  // 前端不得代替服务端限定范围。
  assert.deepEqual(Object.keys(distributionRequests(state)[0].params), ["dimension"]);
});
