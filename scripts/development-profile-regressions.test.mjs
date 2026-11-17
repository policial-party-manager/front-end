import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 管理侧党员发展（成员培养档案列表 + 只读详情）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 列表只请求 `/v4/members/page` 与身份字典（零 `/v4/admin/**`）、`status` 永远显式 1/2、
 * 关键词与政治身份互斥且组合提交零请求、`branchName`/`identityName` 为 null 时的确定降级、
 * 身份字典失败列表仍可用、四态与分页 `total` 取服务端值、
 * 详情只请求一次 `/{userId}` 且不带查询参数、九个 section 与七区块独立空态、摘要缺失与服务端 0 区分、
 * 未知枚举不兜底成成功语义、服务端文本纯文本渲染、内部路径不下发也不成链接、
 * 切换成员/换号/退出/离页后迟到响应不写回、401 刷新恰好重放一次、
 * 无令牌预览零业务请求、普通成员被守卫拦截、非法编号零请求、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/development-profile-${process.pid}`,
    server: { host: "127.0.0.1", port: 5200, strictPort: false },
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

/**
 * 管理侧档案的 `basic` 走 `ScopedMemberServiceImpl.buildVos`：
 * 只写 branchId / identityId，**不写 branchName / identityName**，默认样本必须反映该契约。
 */
const basic = (overrides = {}) => ({
  id: 12,
  username: "2023010101",
  realName: "张同学",
  studentId: "2023010101",
  gender: "女",
  college: "马克思主义学院",
  grade: "2023",
  major: "思想政治教育",
  className: "思政2301",
  branchId: 3,
  branchName: null,
  roleId: null,
  role: null,
  identityId: 2,
  identityName: null,
  phone: "13800138000",
  email: "zhang@example.com",
  contactPerson: null,
  remark: null,
  status: 1,
  createTime: "2025-09-01T08:00:00",
  lastLoginTime: null,
  ...overrides,
});

const member = (id, over = {}) => ({
  ...basic(),
  id,
  username: `20230101${id}`,
  realName: `成员${id}`,
  studentId: `20230101${id}`,
  ...over,
});

/** 完整档案样本；各区块都带数据，便于同时验证渲染与摘要。 */
const profile = (overrides = {}) => ({
  basic: basic(),
  mentors: [
    { mentorId: 21, realName: "李老师", username: "li" },
    { mentorId: 22, realName: null, username: "wang" },
  ],
  identityChanges: [
    {
      id: 5,
      userId: 12,
      fromIdentity: null,
      toIdentity: 2,
      operatorId: 1,
      reason: "支部大会讨论通过",
      status: 2,
      reviewerId: 1,
      reviewTime: "2026-03-02T10:00:00",
      reviewRemark: "同意",
      createTime: "2026-03-01T09:30:00",
    },
  ],
  thoughtReports: [
    {
      id: 31,
      userId: 12,
      reviewerId: 21,
      title: "第一季度思想汇报",
      content: "本季度学习心得。",
      file: "thought/31.txt",
      status: 2,
      reviewRemark: "继续努力",
      submitTime: "2026-04-05T20:10:00",
      reviewTime: "2026-04-08T09:00:00",
    },
  ],
  signRecords: [
    {
      id: 41,
      activityId: 9,
      userId: 12,
      signTime: "2026-05-06T09:05:00",
      signType: "sign",
      device: "web",
      location: "POINT(104 30)",
      remark: "主题党日",
    },
  ],
  leaves: [
    {
      id: 51,
      activityId: 10,
      userId: 12,
      reason: "外出实习",
      operatorId: 21,
      status: 1,
      createTime: "2026-06-01T08:00:00",
      updateTime: null,
    },
  ],
  studyRecords: [
    {
      id: 61,
      userId: 12,
      courseId: 7,
      studyTime: "01:30:00",
      score: 92.5,
      url: "study/cert-61.pdf",
      remark: "党课结业",
      createTime: "2026-06-10T15:00:00",
    },
  ],
  materials: [
    {
      id: 71,
      userId: 12,
      materialType: "入党申请书",
      file: "file:cultivation/71.pdf",
      fileName: "入党申请书.pdf",
      uploaderId: 21,
      remark: null,
      status: 1,
      createTime: "2026-06-12T11:20:00",
    },
  ],
  summary: { thoughtReportCount: 2, thoughtReportApproved: 1, signCount: 1, studyMinutes: 90, materialCount: 1 },
  ...overrides,
});

const IDENTITIES = [
  { id: 1, identityName: "中共正式党员" },
  { id: 2, identityName: "入党积极分子" },
];

const LIST_ROWS = () => [
  // identityName 为 null，只能靠字典映射；branchName 恒 null，只能按编号降级。
  member(101, { realName: "张三", identityId: 2 }),
  member(102, { realName: null, username: "s102", identityId: null, branchId: null }),
  member(103, { realName: "王五", identityId: 99, branchId: 8 }),
];

const PROFILE_ENTRY = /^\/api\/v4\/cultivation-profiles\/(\d+|me)$/;

/** 允许出现的业务请求：成员分页、身份字典、档案详情、令牌刷新，以及被守卫踢回首页后首页自身的资讯接口。 */
const ALLOWED_PATHS = new Set([
  "/api/v4/members/page",
  "/api/v2/content/identities/page",
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
    {
      role: options.role || "super_admin",
      withToken: options.withToken !== false,
      previewRole: options.previewRole,
    },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    requests: [],
    rows: LIST_ROWS(),
    total: 3,
    /** 分页失败次数（每次递减）。 */
    failPageCalls: 0,
    /** 冻结第 n 次分页响应的闸门，用于验证迟到响应。 */
    pageGates: {},
    /** 身份字典失败。 */
    identitiesFail: false,
    identities: IDENTITIES,
    /** 档案端点的响应；键为成员编号，缺省回退到 `defaultProfile`。 */
    profiles: {},
    defaultProfile: profile(),
    profileCalls: 0,
    profileError: null,
    profileUnauthorized: 0,
    /** 冻结第 n 次档案响应的闸门，用于验证迟到响应。 */
    profileGates: {},
    ...options.state,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const isProfile = PROFILE_ENTRY.test(path);
    if (!ALLOWED_PATHS.has(path) && !isProfile) {
      unexpected.push(`${req.method()} ${path}`);
      return route.abort();
    }
    const entry = {
      path,
      method: req.method(),
      params: Object.fromEntries(url.searchParams),
      search: url.search,
      authorization: req.headers().authorization,
    };
    state.requests.push(entry);
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "super_admin", username: "me" });
    if (path === "/api/v2/content/identities/page") {
      if (state.identitiesFail)
        return route.fulfill({ status: 500, json: { code: 500, message: "身份字典暂时不可用" } });
      return ok(route, { records: state.identities, total: state.identities.length });
    }
    if (path === "/api/v4/members/page") {
      const call = pageRequests(state).length;
      if (state.failPageCalls > 0) {
        state.failPageCalls--;
        return route.fulfill({ status: 500, json: { code: 500, message: "成员服务暂时不可用" } });
      }
      // 记录请求时的快照：调用方之后的修改不能污染已发出的响应内容。
      const rows = state.rows;
      const total = state.total;
      const gate = state.pageGates[call];
      if (gate) await gate.promise;
      return ok(route, { records: rows, total });
    }
    // 档案端点：不接受任何查询参数，路径决定查询对象。
    state.profileCalls++;
    const userId = path.split("/").at(-1);
    if (state.profileUnauthorized > 0) {
      state.profileUnauthorized--;
      return route.fulfill({ status: 401, json: { code: 401, message: "登录令牌已过期" } });
    }
    if (state.profileError)
      return route.fulfill({
        status: state.profileError.status,
        json: { code: state.profileError.status, message: state.profileError.message },
      });
    const body = state.profiles[userId] ?? state.defaultProfile;
    const gate = state.profileGates[state.profileCalls];
    if (gate) await gate.promise;
    return ok(route, body);
  });
  await page.goto(`${baseURL}${options.path || "/development"}`);
  return { page, state, context };
}

const pageRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/members/page");
const identityRequests = (state) => state.requests.filter((r) => r.path === "/api/v2/content/identities/page");
const profileRequests = (state) => state.requests.filter((r) => PROFILE_ENTRY.test(r.path));
const section = (page, testId) => page.getByTestId(testId);
const listRows = (page) => section(page, "dev-list-table").locator(".member-row");

async function waitList(page) {
  await eventually(async () => (await section(page, "dev-list-table").count()) === 1);
}

async function waitProfile(page) {
  await eventually(async () => (await section(page, "dev-profile-materials").count()) === 1);
}

async function switchAccount(page, role = "super_admin") {
  // applySession 接收后端角色编码：branch_admin 才会映射成前端 party_secretary。
  const backendRole = role === "party_secretary" ? "branch_admin" : role;
  await page.evaluate(async (nextRole) => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: nextRole, username: "other" });
  }, backendRole);
}

/** 身份下拉的禁用态：el-select 把 disabled 传给内部 input，不看容器类名。 */
async function selectDisabled(page) {
  return section(page, "dev-list-identity").locator("input").isDisabled();
}

async function signOut(page) {
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.clearSession();
  });
}

// ============================ 列表页 ============================

test("列表默认只请求一次成员分页与身份字典，参数精确且不含范围参数", async (t) => {
  const { page, state } = await fixture(t);
  await waitList(page);
  await eventually(() => identityRequests(state).length === 1);
  const calls = pageRequests(state);
  assert.equal(calls.length, 1);
  // 默认启用：显式发送 status=1，避免把「不传即仅启用」的语义固化成客户端假设。
  assert.deepEqual(calls[0].params, { page: "1", size: "10", status: "1" });
  // 范围由服务端裁决，前端拼范围参数等于尝试扩权。
  for (const key of ["branchId", "userId", "scope", "grade", "major", "college", "roleId"])
    assert.equal(key in calls[0].params, false, `${key} 不应出现在列表请求中`);
  assert.equal(calls[0].search.includes("keyword"), false);
  assert.equal(identityRequests(state)[0].params.page, "1");
});

test("total 取服务端值，不被当前页行数改写", async (t) => {
  const { page, state } = await fixture(t, { state: { total: 87 } });
  await waitList(page);
  await eventually(async () =>
    (await section(page, "dev-list-table").locator(".el-pagination__total").innerText()).includes("87"),
  );
  assert.match(await section(page, "dev-list-table").locator(".el-pagination__total").innerText(), /87/);
});

test("切换到停用显式发送 status=2，切回启用发送 status=1，且无全部状态选项", async (t) => {
  const { page, state } = await fixture(t);
  await waitList(page);
  await section(page, "dev-list-status").getByText("停用", { exact: true }).click();
  await eventually(() => pageRequests(state).length === 2);
  assert.equal(pageRequests(state).at(-1).params.status, "2");
  assert.equal(pageRequests(state).at(-1).params.page, "1");
  await section(page, "dev-list-status").getByText("启用", { exact: true }).click();
  await eventually(() => pageRequests(state).length === 3);
  assert.equal(pageRequests(state).at(-1).params.status, "1");
  // 后端 status 缺省等于「仅启用」，无法表达「全部状态」。
  const statusText = await section(page, "dev-list-status").innerText();
  assert.doesNotMatch(statusText, /全部/);
});

test("关键词与政治身份互斥：输入后互相禁用，且只发送单项条件", async (t) => {
  const { page, state } = await fixture(t);
  await waitList(page);
  // 输入关键词后身份下拉被禁用，提交只带关键词。
  await section(page, "dev-list-keyword").fill("张");
  await eventually(() => selectDisabled(page));
  await section(page, "dev-list-search").click();
  await eventually(() => pageRequests(state).length === 2);
  assert.equal(pageRequests(state).at(-1).params.keyword, "张");
  assert.equal("identityId" in pageRequests(state).at(-1).params, false);

  // 反向互斥：清空关键词后先选身份，关键词输入框被禁用且提交只带身份。
  await section(page, "dev-list-reset").click();
  await eventually(() => pageRequests(state).length === 3);
  await eventually(async () => (await selectDisabled(page)) === false);
  await section(page, "dev-list-identity").click();
  await page.locator(".el-select-dropdown__item").first().click();
  await eventually(async () => (await section(page, "dev-list-keyword").isDisabled()) === true);
  await section(page, "dev-list-search").click();
  await eventually(() => pageRequests(state).length === 4);
  assert.equal(pageRequests(state).at(-1).params.identityId, "1");
  assert.equal("keyword" in pageRequests(state).at(-1).params, false);
});

test("组合提交被拦截：两项都有值时零请求并给出原因", async (t) => {
  const { page, state } = await fixture(t);
  await waitList(page);
  await section(page, "dev-list-identity").click();
  await page.locator(".el-select-dropdown__item").first().click();
  await eventually(async () => (await section(page, "dev-list-keyword").isDisabled()) === true);
  // 绕过界面互斥把关键词直接写回模型，验证提交层仍然拦截（不只靠 disabled）。
  await page.evaluate(() => {
    document.querySelector('[data-testid="dev-list-keyword"]').removeAttribute("disabled");
  });
  await section(page, "dev-list-keyword").fill("张");
  await section(page, "dev-list-search").click();
  await eventually(async () => (await page.locator(".el-message").count()) > 0);
  assert.match(await page.locator(".el-message").first().innerText(), /关键词与政治身份暂不支持组合查询/);
  await page.waitForTimeout(300);
  assert.equal(pageRequests(state).length, 1, "组合提交不得发出请求");
});

test("branchName 与 identityName 为 null 时按契约降级显示", async (t) => {
  const { page } = await fixture(t);
  await waitList(page);
  const rows = listRows(page);
  await eventually(async () => (await rows.count()) === 3);
  const first = await rows.nth(0).innerText();
  // identityId=2 且 identityName=null：用一次性加载的身份字典映射。
  assert.match(first, /入党积极分子/);
  assert.match(first, /支部名称不可用（编号 3）/);
  // realName=null：用 username 兜底，不补造姓名；identityId=null：未登记；branchId=null：未分配。
  const second = await rows.nth(1).innerText();
  assert.match(second, /s102|20230101102/);
  assert.match(second, /未登记/);
  assert.match(second, /未分配/);
  // 字典里没有的编号：显示「身份 #99」，不猜名称。
  const third = await rows.nth(2).innerText();
  assert.match(third, /身份 #99/);
  for (const text of [first, second, third]) {
    assert.doesNotMatch(text, /\bnull\b/);
    assert.doesNotMatch(text, /undefined/);
  }
});

test("身份字典请求失败时列表仍可用，身份列降级且筛选禁用", async (t) => {
  const { page, state } = await fixture(t, { state: { identitiesFail: true } });
  await waitList(page);
  await eventually(async () => (await section(page, "dev-list-identity-error").count()) === 1);
  assert.match(await section(page, "dev-list-identity-error").innerText(), /身份列将按编号显示/);
  const rows = listRows(page);
  await eventually(async () => (await rows.count()) === 3);
  // 字典缺失：identityId=2 降级为「身份 #2」。
  assert.match(await rows.nth(0).innerText(), /身份 #2/);
  // 字典失败不影响列表可用性。
  assert.equal(await section(page, "dev-list-error").count(), 0);
  assert.equal(pageRequests(state).length, 1);
  assert.equal(await section(page, "dev-list-identity").locator("input").isDisabled(), true);
});

test("列表失败显示错误与重试，重试成功后渲染数据", async (t) => {
  const { page, state } = await fixture(t, { state: { failPageCalls: 1 } });
  await eventually(async () => (await section(page, "dev-list-error").count()) === 1);
  const errorText = await section(page, "dev-list-error").innerText();
  assert.match(errorText, /成员列表暂时无法加载/);
  assert.match(errorText, /成员服务暂时不可用/);
  assert.equal(await section(page, "dev-list-table").count(), 0);
  await section(page, "dev-list-retry").click();
  await waitList(page);
  assert.equal(pageRequests(state).length, 2);
  assert.equal(await section(page, "dev-list-error").count(), 0);
  assert.match(await section(page, "dev-list-table").innerText(), /成员101|张三/);
});

test("空列表走空态而不是错误态", async (t) => {
  const { page } = await fixture(t, { state: { rows: [], total: 0 } });
  await eventually(async () => (await section(page, "dev-list-empty").count()) === 1);
  assert.match(await section(page, "dev-list-empty").innerText(), /暂无符合条件的成员/);
  assert.equal(await section(page, "dev-list-error").count(), 0);
});

test("分页切到第 2 页只请求一次且带 page=2，total 不被改写", async (t) => {
  const { page, state } = await fixture(t, { state: { total: 25 } });
  await waitList(page);
  const pager = section(page, "dev-list-table").locator(".el-pager li").nth(1);
  await pager.click();
  await eventually(() => pageRequests(state).length === 2);
  assert.equal(pageRequests(state).at(-1).params.page, "2");
  assert.equal(pageRequests(state).at(-1).params.status, "1");
  await eventually(async () =>
    (await section(page, "dev-list-table").locator(".el-pagination__total").innerText()).includes("25"),
  );
});

test("换号后旧会话的迟到列表响应不写回，且筛选回到默认", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { pageGates: { 1: gate } } });
  await eventually(() => pageRequests(state).length === 1);
  await section(page, "dev-list-keyword").fill("旧关键词");
  state.rows = [member(901, { realName: "新会话成员" })];
  state.total = 1;
  await switchAccount(page, "party_secretary");
  await waitList(page);
  await eventually(async () => (await section(page, "dev-list-table").innerText()).includes("新会话成员"));
  // 旧账号的迟到响应解冻后不得改写新会话列表。
  gate.resolve();
  await page.waitForTimeout(300);
  const tableText = await section(page, "dev-list-table").innerText();
  assert.match(tableText, /新会话成员/);
  assert.doesNotMatch(tableText, /成员101/);
  // 新账号的支部范围不同，沿用旧关键词会直接落入空态。
  assert.equal(await section(page, "dev-list-keyword").inputValue(), "");
  assert.equal("keyword" in pageRequests(state).at(-1).params, false);
});

test("无令牌的开发预览态显示需要登录且零业务请求", async (t) => {
  // 两条新路由都必须自己拦住无令牌预览：列表页与详情页各验证一次。
  for (const path of ["/development", "/development/member/12"]) {
    const { page, state } = await fixture(t, { withToken: false, previewRole: "super_admin", path });
    await eventually(async () => (await page.locator(".el-alert").count()) > 0);
    const alertText = await page.locator(".el-alert").first().innerText();
    assert.match(alertText, /需要登录/);
    await page.waitForTimeout(300);
    assert.deepEqual(state.requests, [], `${path} 不得发出任何业务请求`);
    assert.equal(await section(page, "dev-list-table").count(), 0);
    assert.equal(await section(page, "dev-profile-basic").count(), 0);
  }
});

test("列表无数据且有令牌时不会停留在空白页", async (t) => {
  // 页面自身的 canView=false 分支在路由守卫存在时无法通过导航到达（守卫先拦回首页），
  // 因此这里锁定可观察的兜底：任何非成功路径都必须渲染确定提示，而不是只剩页头。
  const { page } = await fixture(t, { state: { failPageCalls: 1 } });
  await eventually(async () => (await section(page, "dev-list-error").count()) === 1);
  const headings = await page
    .locator("main")
    .allInnerTexts()
    .then((texts) => texts.join(" "));
  assert.match(headings, /成员列表暂时无法加载/);
  assert.match(headings, /重新加载/);
});

test("成员状态标签只在启用时使用成功语义", async (t) => {
  const { page } = await fixture(t, {
    state: { rows: [member(101, { status: 1 }), member(102, { status: 2 }), member(103, { status: 9 })], total: 3 },
  });
  await waitList(page);
  const rows = listRows(page);
  await eventually(async () => (await rows.count()) === 3);
  const tagOf = async (index) => rows.nth(index).locator(".el-tag").first().getAttribute("class");
  assert.match(await tagOf(0), /el-tag--success/);
  assert.doesNotMatch(await tagOf(1), /el-tag--success/);
  // 未知状态不得看起来像正常成员。
  assert.doesNotMatch(await tagOf(2), /el-tag--success/);
  assert.match(await rows.nth(2).innerText(), /未知状态（9）/);
});

test("普通成员直访列表被路由守卫拦回首页且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  await page.waitForTimeout(300);
  assert.deepEqual(
    state.requests.filter((r) => r.path !== "/api/v2/content/news/page" && r.path !== "/api/v2/content/notices/page"),
    [],
  );
  assert.equal(await section(page, "dev-list-table").count(), 0);
});

test("列表与详情路由都高亮「党员发展」导航", async (t) => {
  const { page } = await fixture(t);
  await waitList(page);
  // 导航项高亮为 `.side-link.active`（SideNav 用 store.activeNav 控制）。
  const activeNav = () => page.locator(".side-link.active").allInnerTexts();
  await eventually(async () => (await activeNav()).join(" ").includes("党员发展"));
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/development/member/12");
  });
  await waitProfile(page);
  await eventually(async () => (await activeNav()).join(" ").includes("党员发展"));
});

// ============================ 详情页 ============================

test("详情只请求一次档案端点，不带任何查询参数", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/member/12" });
  await waitProfile(page);
  await page.waitForTimeout(200);
  const calls = profileRequests(state);
  assert.equal(calls.length, 1, JSON.stringify(state.requests));
  assert.equal(calls[0].path, "/api/v4/cultivation-profiles/12");
  assert.deepEqual(calls[0].params, {});
  assert.equal(calls[0].search, "");
  // 详情页不额外拉成员、活动、课程、支部或身份字典接口。
  assert.equal(pageRequests(state).length, 0);
  assert.equal(identityRequests(state).length, 0);
  for (const id of [
    "dev-profile-basic",
    "dev-profile-summary",
    "dev-profile-mentors",
    "dev-profile-identity",
    "dev-profile-reports",
    "dev-profile-signs",
    "dev-profile-leaves",
    "dev-profile-studies",
    "dev-profile-materials",
  ])
    assert.equal(await section(page, id).count(), 1, `${id} 应存在`);
});

test("详情内容：基本信息降级、服务端摘要、各区块记录", async (t) => {
  const { page } = await fixture(t, { path: "/development/member/12" });
  await waitProfile(page);
  const heading = await page.locator(".page-heading").innerText();
  assert.match(heading, /管理侧档案 · 只读/);
  assert.match(heading, /范围由服务端按登录身份判定/);
  assert.match(heading, /全院范围/);

  const basicText = await section(page, "dev-profile-basic").innerText();
  assert.match(basicText, /张同学/);
  assert.match(basicText, /支部名称不可用（编号 3）/);
  assert.match(basicText, /未登记政治身份/);
  assert.match(basicText, /13800138000/);
  assert.doesNotMatch(basicText, /\bnull\b/);

  assert.match(await section(page, "dev-profile-summary-thought").innerText(), /2 条/);
  assert.match(await section(page, "dev-profile-summary-thought").innerText(), /其中已通过 1 条/);
  assert.match(await section(page, "dev-profile-summary-sign").innerText(), /1 次/);
  assert.match(await section(page, "dev-profile-summary-sign").innerText(), /仅签到次数/);
  assert.match(await section(page, "dev-profile-summary-study").innerText(), /90 分钟/);
  assert.match(await section(page, "dev-profile-summary-study").innerText(), /约 1 小时 30 分钟/);
  assert.match(await section(page, "dev-profile-summary-material").innerText(), /1 份/);

  assert.match(await section(page, "dev-profile-mentors").innerText(), /李老师/);
  assert.match(await section(page, "dev-profile-mentors").innerText(), /当前生效关系/);
  const identityText = await section(page, "dev-profile-identity").innerText();
  assert.match(identityText, /已生效/);
  assert.match(identityText, /编号不可用 → 2/);
  assert.doesNotMatch(identityText, /null/);
  assert.match(await section(page, "dev-profile-reports").innerText(), /第一季度思想汇报/);
  assert.match(await section(page, "dev-profile-reports").innerText(), /通过/);
  assert.match(await section(page, "dev-profile-signs").innerText(), /活动编号 9/);
  assert.match(await section(page, "dev-profile-signs").innerText(), /本人签到/);
  assert.match(await section(page, "dev-profile-leaves").innerText(), /外出实习/);
  assert.match(await section(page, "dev-profile-leaves").innerText(), /生效/);
  const studyText = await section(page, "dev-profile-studies").innerText();
  assert.match(studyText, /课程编号 7/);
  assert.match(studyText, /90 分钟/);
  assert.match(studyText, /92\.5/);
  assert.match(await section(page, "dev-profile-materials").innerText(), /入党申请书\.pdf/);
});

test("空档案：七个列表区块独立空态，摘要是服务端 0 而不是未统计", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/member/12",
    state: {
      defaultProfile: {
        basic: basic({ realName: null, username: null, studentId: null }),
        mentors: [],
        identityChanges: [],
        thoughtReports: [],
        signRecords: [],
        leaves: [],
        studyRecords: [],
        materials: [],
        summary: { thoughtReportCount: 0, thoughtReportApproved: 0, signCount: 0, studyMinutes: 0, materialCount: 0 },
      },
    },
  });
  await waitProfile(page);
  assert.match(await section(page, "dev-profile-basic").innerText(), /未登记姓名/);
  assert.match(await section(page, "dev-profile-summary-study").innerText(), /0 分钟/);
  assert.match(await section(page, "dev-profile-summary-sign").innerText(), /0 次/);
  const summaryText = await section(page, "dev-profile-summary").innerText();
  assert.doesNotMatch(summaryText, /NaN|undefined|暂无统计/);
  assert.match(await section(page, "dev-profile-mentors").innerText(), /尚未设置培养联系人/);
  assert.match(await section(page, "dev-profile-identity").innerText(), /暂无身份变更记录/);
  assert.match(await section(page, "dev-profile-reports").innerText(), /暂无思想汇报记录/);
  assert.match(await section(page, "dev-profile-signs").innerText(), /暂无活动签到记录/);
  assert.match(await section(page, "dev-profile-leaves").innerText(), /暂无请假记录/);
  assert.match(await section(page, "dev-profile-studies").innerText(), /暂无学习记录/);
  assert.match(await section(page, "dev-profile-materials").innerText(), /暂无培养材料/);
});

test("summary 缺失时显示暂无统计，不出现具体次数", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/member/12",
    state: { defaultProfile: profile({ summary: null }) },
  });
  await waitProfile(page);
  const summaryText = await section(page, "dev-profile-summary").innerText();
  assert.match(summaryText, /暂无统计/);
  assert.match(summaryText, /服务端未返回摘要/);
  assert.doesNotMatch(summaryText, /\d+ 次|\d+ 份/);
});

test("未知枚举显示未知状态，不落成通过或已生效", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/member/12",
    state: {
      defaultProfile: profile({
        identityChanges: [{ ...profile().identityChanges[0], id: 6, status: 9 }],
        thoughtReports: [{ ...profile().thoughtReports[0], id: 32, status: 9 }],
        leaves: [{ ...profile().leaves[0], id: 52, status: 9 }],
      }),
    },
  });
  await waitProfile(page);
  const identityRow = section(page, "dev-profile-identity").locator(".row-card").first();
  await eventually(async () => (await identityRow.innerText()).includes("未知状态（9）"));
  assert.doesNotMatch(await identityRow.innerText(), /已生效/);
  const reportRow = section(page, "dev-profile-reports").locator(".row-card").first();
  await eventually(async () => (await reportRow.innerText()).includes("未知状态（9）"));
  assert.doesNotMatch(await reportRow.innerText(), /通过/);
  const leaveRow = section(page, "dev-profile-leaves").locator(".row-card").first();
  await eventually(async () => (await leaveRow.innerText()).includes("未知状态（9）"));
});

test("服务端 HTML 文本按纯文本渲染，不产生可执行节点", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/member/12",
    state: {
      defaultProfile: profile({
        thoughtReports: [
          {
            ...profile().thoughtReports[0],
            id: 33,
            title: '<img src=x onerror="window.__xss=1">标题',
            content: '<img src=x onerror="window.__xss=1">测试正文',
            reviewRemark: "<script>window.__xss=1</script>",
          },
        ],
        identityChanges: [{ ...profile().identityChanges[0], id: 7, reason: '<script>alert("x")</script>说明' }],
        materials: [{ ...profile().materials[0], id: 73, remark: "<b>加粗</b>" }],
      }),
    },
  });
  const reports = section(page, "dev-profile-reports");
  await eventually(async () => (await reports.innerText()).includes("测试正文"));
  const reportText = await reports.innerText();
  assert.match(reportText, /<img src=x onerror=/);
  assert.match(reportText, /<script>window\.__xss=1<\/script>/);
  assert.equal(await reports.locator("img").count(), 0);
  assert.match(await section(page, "dev-profile-identity").innerText(), /<script>alert/);
  assert.match(await section(page, "dev-profile-materials").innerText(), /<b>加粗<\/b>/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
});

test("材料、汇报附件与证书的内部路径不下发也不成链接", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/member/12",
    state: {
      defaultProfile: profile({
        materials: [{ ...profile().materials[0], file: "file:secret/x.pdf" }],
        thoughtReports: [{ ...profile().thoughtReports[0], file: "file:thought/31.txt" }],
        studyRecords: [{ ...profile().studyRecords[0], url: "file:private/cert.pdf" }],
      }),
    },
  });
  await waitProfile(page);
  const materialText = await section(page, "dev-profile-materials").innerText();
  const reportText = await section(page, "dev-profile-reports").innerText();
  const studyText = await section(page, "dev-profile-studies").innerText();
  for (const text of [materialText, reportText, studyText]) assert.doesNotMatch(text, /file:|secret\/x\.pdf/);
  assert.doesNotMatch(materialText, /thought\/31\.txt/);
  assert.doesNotMatch(studyText, /private\/cert\.pdf/);
  assert.equal(await page.locator('a[href*="file:"]').count(), 0);
  assert.equal(await section(page, "dev-profile-materials").locator("a").count(), 0);
  assert.equal(await section(page, "dev-profile-studies").locator("a").count(), 0);
  // 只展示元数据，并明确说明不提供下载。
  assert.match(materialText, /不提供下载/);
  assert.match(reportText, /不展示其路径/);
  assert.match(studyText, /不展示其路径/);
});

test("跨支部直改 URL 原样转达服务端「用户不存在」，不改写成无权限", async (t) => {
  const { page, state } = await fixture(t, {
    role: "party_secretary",
    path: "/development/member/12",
    state: { profileError: { status: 400, message: "用户不存在" } },
  });
  await eventually(async () => (await section(page, "dev-profile-error").count()) === 1);
  const errorText = await section(page, "dev-profile-error").innerText();
  assert.match(errorText, /用户不存在/);
  assert.doesNotMatch(errorText, /无权限|403|找不到页面/);
  assert.equal(profileRequests(state).length, 1);
  // 页面标题标注本支部范围。
  assert.match(await page.locator(".page-heading").innerText(), /本支部范围/);
});

test("非法成员编号不发请求并显示成员编号无效", async (t) => {
  for (const id of ["abc", "0", "-3"]) {
    const { page, state } = await fixture(t, { path: `/development/member/${id}` });
    await eventually(async () => (await section(page, "dev-profile-invalid").count()) === 1);
    assert.match(await section(page, "dev-profile-invalid").innerText(), /成员编号无效/);
    await page.waitForTimeout(200);
    assert.equal(profileRequests(state).length, 0, `编号 ${id} 不得发出请求`);
  }
});

test("切换成员重新请求且不残留上一位成员的档案", async (t) => {
  const { page, state } = await fixture(t, {
    path: "/development/member/12",
    state: {
      profiles: {
        12: profile(),
        13: profile({ basic: basic({ id: 13, realName: "李同学", username: "s13" }) }),
      },
    },
  });
  await waitProfile(page);
  assert.match(await section(page, "dev-profile-basic").innerText(), /张同学/);
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/development/member/13");
  });
  await eventually(async () => (await section(page, "dev-profile-basic").innerText()).includes("李同学"));
  const calls = profileRequests(state);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].path, "/api/v4/cultivation-profiles/13");
  const basicText = await section(page, "dev-profile-basic").innerText();
  assert.doesNotMatch(basicText, /张同学/);
});

test("切换成员后旧成员的迟到响应不覆盖新成员档案", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, {
    path: "/development/member/12",
    state: {
      profileGates: { 1: gate },
      profiles: {
        12: profile(),
        13: profile({ basic: basic({ id: 13, realName: "新成员甲", username: "s13" }) }),
      },
    },
  });
  await eventually(() => profileRequests(state).length === 1);
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/development/member/13");
  });
  await eventually(async () => (await section(page, "dev-profile-basic").innerText()).includes("新成员甲"));
  // 解冻 12 的响应：页面此刻是 13，不得渲染 12 的数据。
  gate.resolve();
  await page.waitForTimeout(300);
  const basicText = await section(page, "dev-profile-basic").innerText();
  assert.match(basicText, /新成员甲/);
  assert.doesNotMatch(basicText, /张同学/);
});

test("换号后旧会话的迟到档案响应不写回", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, {
    path: "/development/member/12",
    state: { profileGates: { 1: gate } },
  });
  await eventually(() => profileRequests(state).length === 1);
  state.defaultProfile = profile({ basic: basic({ realName: "新会话成员", username: "s-new" }) });
  await switchAccount(page, "super_admin");
  await eventually(async () => (await section(page, "dev-profile-basic").innerText()).includes("新会话成员"));
  gate.resolve();
  await page.waitForTimeout(300);
  const basicText = await section(page, "dev-profile-basic").innerText();
  assert.match(basicText, /新会话成员/);
  assert.doesNotMatch(basicText, /张同学/);
});

test("退出登录后清除已渲染档案并停止请求", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/member/12" });
  await waitProfile(page);
  const calls = profileRequests(state).length;
  await signOut(page);
  await eventually(async () => (await section(page, "dev-profile-basic").count()) === 0);
  await eventually(async () => (await page.locator(".el-alert").first().innerText()).includes("培养档案需要登录"));
  await page.waitForTimeout(300);
  assert.equal(profileRequests(state).length, calls, "退出后不得再请求档案");
});

test("401 触发刷新后恰好重放一次档案请求", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/member/12", state: { profileUnauthorized: 1 } });
  await waitProfile(page);
  const calls = profileRequests(state);
  assert.equal(calls.length, 2);
  assert.equal(state.requests.filter((r) => r.path === "/api/v1/auth/refresh").length, 1);
  assert.equal(calls[0].authorization, "Bearer test-access");
  assert.equal(calls[1].authorization, "Bearer new-access");
  assert.equal(await section(page, "dev-profile-error").count(), 0);
});

test("普通成员直访详情被路由守卫拦回首页且零档案请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member", path: "/development/member/12" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  await page.waitForTimeout(300);
  assert.equal(profileRequests(state).length, 0);
  assert.equal(await section(page, "dev-profile-basic").count(), 0);
});

test("外部请求纪律：全程不出现 /v4/admin/** 或补名接口", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/member/12" });
  await waitProfile(page);
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/development");
  });
  await waitList(page);
  await page.waitForTimeout(200);
  // fixture 的白名单本身会 abort 并断言零非白名单请求，这里再显式核对一遍路径集合。
  const paths = new Set(state.requests.map((r) => r.path));
  for (const path of paths) {
    assert.doesNotMatch(path, /\/api\/v4\/admin\//);
    assert.doesNotMatch(path, /\/api\/v2\/content\/(activities|study-courses)/);
  }
});

test("390px 窄屏不出现整页横向溢出，关键区块仍可见", async (t) => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await waitList(page);
  const listOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    listOverflow.scrollWidth <= listOverflow.clientWidth + 1,
    `列表 scrollWidth=${listOverflow.scrollWidth} clientWidth=${listOverflow.clientWidth}`,
  );
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/development/member/12");
  });
  await waitProfile(page);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `详情 scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  const box = await section(page, "dev-profile-summary").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= overflow.clientWidth + 1, JSON.stringify(box));
});

test("详情各区块本地分页只切数据，不额外请求档案", async (t) => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    id: 100 + index,
    activityId: 200 + index,
    userId: 12,
    signTime: "2026-09-0" + ((index % 9) + 1) + "T09:00:00",
    signType: "sign",
    device: null,
    location: null,
    remark: null,
  }));
  const { page, state } = await fixture(t, {
    path: "/development/member/12",
    state: { defaultProfile: profile({ signRecords: many }) },
  });
  const signs = section(page, "dev-profile-signs");
  await eventually(async () => (await signs.locator(".row-card").count()) === 5);
  assert.match(await signs.innerText(), /本地分页/);
  await signs.locator(".el-pager li").nth(1).click();
  await eventually(async () => (await signs.locator(".row-card").count()) === 5);
  assert.match(await signs.locator(".row-card").first().innerText(), /活动编号 205/);
  await page.waitForTimeout(200);
  assert.equal(profileRequests(state).length, 1, "切页不得重复请求服务端");
});
