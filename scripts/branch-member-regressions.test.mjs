import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 支委成员工作台（`/members/branch`）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 只走 scoped 端点 `/v4/members/**`（零 `/v4/admin/**`）、默认不传 `status` 即「仅启用」、
 * 停用必须显式 `status=2`、`branchName`/`identityName` 恒 null 时的降级显示、
 * 联系方式只提交变更字段且空串表示清空、导出使用已应用条件且校验 ZIP 文件头、
 * 换号/退出/离页后迟到响应不写回、401 刷新恰好重放一次、无令牌预览零业务请求、
 * 普通成员被守卫拦截、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/branch-members-${process.pid}`,
    server: { host: "127.0.0.1", port: 5197, strictPort: false },
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

/** 后端 scoped 接口只写 branchId / identityId，branchName 与 identityName 恒为 null。 */
const member = (id, over = {}) => ({
  id,
  username: `stu${id}`,
  realName: `成员${id}`,
  studentId: `2021${id}`,
  gender: "男",
  college: "马克思主义学院",
  grade: "2021",
  major: "思想政治教育",
  className: "思政2101",
  branchId: 8,
  branchName: null,
  roleId: 2,
  role: "student",
  identityId: null,
  identityName: null,
  phone: null,
  email: null,
  contactPerson: null,
  remark: null,
  status: 1,
  createTime: null,
  lastLoginTime: null,
  ...over,
});

const FIXED_ROWS = () => [
  member(101, { realName: "张三", identityId: 1, phone: "13800138000", email: "zhang@example.com" }),
  member(102, { realName: "李四", branchId: null }),
  member(103, { realName: "王五", identityId: 99 }),
];

const IDENTITIES = [
  { id: 1, identityName: "中共正式党员" },
  { id: 2, identityName: "入党积极分子" },
];

const ALLOWED_PATHS = new Set([
  "/api/v4/members/page",
  "/api/v4/members/export",
  "/api/v2/content/identities/page",
  "/api/v1/auth/refresh",
  "/api/v2/content/news/page",
  "/api/v2/content/notices/page",
  "/api/v4/user/profile",
]);
const MEMBER_ENTRY = /^\/api\/v4\/members\/\d+(\/contact)?$/;

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
        localStorage.setItem("party_user_session", JSON.stringify({ name: "书记", avatar: "", role }));
        return;
      }
      // 无令牌的开发预览态：身份由预览角色决定，不能再依赖登录会话。
      if (previewRole) localStorage.setItem("party_dev_preview_role", previewRole);
    },
    {
      role: options.role || "party_secretary",
      withToken: options.withToken !== false,
      previewRole: options.previewRole,
    },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(() => {
    if (location.protocol !== "http:") return;
    window.__downloads = [];
    const native = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      void blob.text().then((text) => window.__downloads.push({ size: blob.size, text }));
      return native(blob);
    };
    HTMLAnchorElement.prototype.click = function () {};
  });
  const state = {
    requests: [],
    pageCalls: 0,
    rows: FIXED_ROWS(),
    total: 3,
    identities: IDENTITIES,
    identitiesFail: false,
    unauthorized: 0,
    failPageCalls: 0,
    pageError: null,
    /** 按调用序号冻结分页响应（键为第几次请求），用于验证竞态。 */
    pageGates: {},
    detailGate: null,
    /** 保存后回读失败次数。 */
    readbackFail: 0,
    saveFail: null,
    saveGate: null,
    contactWrites: [],
    exportJson: false,
    exportGate: null,
    ...options.state,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (!ALLOWED_PATHS.has(path) && !MEMBER_ENTRY.test(path)) {
      unexpected.push(`${req.method()} ${path}`);
      return route.abort();
    }
    const entry = {
      path,
      method: req.method(),
      params: Object.fromEntries(url.searchParams),
      authorization: req.headers().authorization,
      body: req.postData() || null,
    };
    state.requests.push(entry);
    // 被守卫拦回首页时，首页自身的资讯请求需要给出可渲染响应。
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v4/user/profile") return ok(route, null);
    if (path === "/api/v1/auth/refresh")
      // 刷新响应使用后端角色编码 branch_admin；映射后才是前端角色 party_secretary。
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        role: "branch_admin",
        username: "secretary",
      });
    if (path === "/api/v2/content/identities/page") {
      if (state.identitiesFail)
        return route.fulfill({ status: 500, json: { code: 500, message: "身份字典暂时不可用" } });
      return ok(route, { records: state.identities, total: state.identities.length });
    }
    if (path === "/api/v4/members/page") {
      state.pageCalls++;
      if (state.pageError)
        return route.fulfill({
          status: state.pageError.status,
          json: { code: state.pageError.status, message: state.pageError.message },
        });
      if (state.unauthorized > 0) {
        state.unauthorized--;
        return route.fulfill({ status: 401, json: { code: 401, message: "登录令牌已过期" } });
      }
      if (state.failPageCalls > 0) {
        state.failPageCalls--;
        return route.fulfill({ status: 500, json: { code: 500, message: "成员服务暂时不可用" } });
      }
      // 在进入网关前冻结本次响应的内容：真实服务端已经算好结果，
      // 冻结的旧请求必须携带旧内容，否则「迟到响应覆盖新结果」永远无法构造。
      const payload = { records: JSON.parse(JSON.stringify(state.rows)), total: state.total };
      const gate = state.pageGates[state.pageCalls];
      if (gate) await gate.promise;
      return ok(route, payload);
    }
    if (path === "/api/v4/members/export") {
      if (state.exportGate) await state.exportGate.promise;
      if (state.exportJson)
        // 模拟服务端把错误信息当文件返回：MIME 不是 json，只能靠 ZIP 文件头识别。
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/octet-stream" },
          body: JSON.stringify({ code: 500, message: "导出服务暂时不可用" }),
        });
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        body: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
      });
    }
    if (MEMBER_ENTRY.test(path) && path.endsWith("/contact")) {
      const id = Number(path.split("/").at(-2));
      const payload = JSON.parse(req.postData() || "{}");
      state.contactWrites.push({ id, payload });
      if (state.saveFail)
        return route.fulfill({
          status: state.saveFail.status,
          json: { code: state.saveFail.status, message: state.saveFail.message },
        });
      if (state.saveGate) await state.saveGate.promise;
      const row = state.rows.find((item) => item.id === id);
      // 复刻后端部分更新语义：缺省字段不动，空串清空（服务端 trimToNull 后写 null）。
      if (row && payload.phone !== undefined) row.phone = payload.phone === "" ? null : payload.phone;
      if (row && payload.email !== undefined) row.email = payload.email === "" ? null : payload.email;
      if (row && payload.remark !== undefined) row.remark = payload.remark === "" ? null : payload.remark;
      return ok(route, null);
    }
    if (MEMBER_ENTRY.test(path)) {
      const id = Number(path.split("/").at(-1));
      if (state.detailGate) await state.detailGate.promise;
      if (state.readbackFail > 0) {
        state.readbackFail--;
        return route.fulfill({ status: 500, json: { code: 500, message: "详情服务暂时不可用" } });
      }
      const row = state.rows.find((item) => item.id === id);
      if (!row) return route.fulfill({ status: 400, json: { code: 400, message: "用户不存在" } });
      return ok(route, { ...row });
    }
    return route.abort();
  });
  await page.goto(`${baseURL}${options.path || "/members/branch"}`);
  return { page, state, context };
}

const pageRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/members/page");
const detailRequests = (state, id) => state.requests.filter((r) => r.path === `/api/v4/members/${id}`);
const tableRows = (page) => page.locator('[data-testid="branch-member-table"] .el-table__body tbody tr');
const tableRow = (page, index) => tableRows(page).nth(index);
const panel = (page) => page.getByTestId("branch-member-table");
const detailDialog = (page) => page.locator('[data-testid="branch-member-detail"]');
const downloads = (page) => page.evaluate(() => window.__downloads.length);

async function waitTable(page) {
  await panel(page).waitFor();
}

async function switchAccount(page, role = "party_secretary") {
  // applySession 接收后端角色编码：branch_admin 才会映射成前端 party_secretary。
  const backendRole = role === "party_secretary" ? "branch_admin" : role;
  await page.evaluate(async (nextRole) => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: nextRole, username: "other" });
  }, backendRole);
}

async function signOut(page) {
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.clearSession();
  });
}

test("默认只请求一次分页接口，参数不含 status 与 branchId", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const calls = pageRequests(state);
  assert.equal(calls.length, 1, JSON.stringify(state.requests));
  assert.equal(calls[0].method, "GET");
  // status 缺省即「仅启用」；前端传 1 会把「默认语义」固化成客户端的假设。
  assert.equal("status" in calls[0].params, false, JSON.stringify(calls[0].params));
  // 范围由服务端按登录身份判定，传 branchId 等于尝试扩大范围。
  for (const key of ["branchId", "userId", "scope", "status", "grade", "major", "college", "identityId"])
    assert.equal(key in calls[0].params, false, `${key} 不应出现在默认请求参数中`);
  assert.deepEqual(Object.keys(calls[0].params).sort(), ["page", "size"]);
  assert.equal(calls[0].params.page, "1");
  assert.equal(calls[0].params.size, "10");
  // 保持「启用（默认）」点击搜索同样不得发送 status，否则默认语义会被固化成客户端假设。
  await page.getByTestId("branch-member-search").click();
  await eventually(() => pageRequests(state).length === 2);
  assert.equal("status" in pageRequests(state).at(-1).params, false, JSON.stringify(pageRequests(state).at(-1)));
});

test("全部请求只命中 scoped 端点，不存在任何 /v4/admin 请求", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await detailDialog(page).waitFor();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  const admin = state.requests.filter((r) => r.path.startsWith("/api/v4/admin"));
  assert.deepEqual(admin, [], JSON.stringify(admin));
  const business = state.requests
    .map((r) => r.path)
    .filter((path) => !path.startsWith("/api/v1/auth") && !path.startsWith("/api/v2/content/news"));
  for (const path of business)
    assert.ok(
      path.startsWith("/api/v4/members/") || path === "/api/v2/content/identities/page",
      `意外业务路径 ${path}`,
    );
});

test("切到停用显式发送 status=2，且界面不提供全部状态选项", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const statusGroup = page.getByTestId("branch-member-status");
  const text = await statusGroup.innerText();
  assert.match(text, /启用/);
  assert.match(text, /停用/);
  assert.equal(text.includes("全部"), false);
  state.rows = [member(201, { realName: "停用成员", status: 2 })];
  state.total = 1;
  await statusGroup.getByText("停用", { exact: true }).click();
  await page.getByTestId("branch-member-search").click();
  await eventually(() => pageRequests(state).length === 2);
  const last = pageRequests(state).at(-1);
  assert.equal(last.params.status, "2");
  assert.equal(last.params.page, "1");
  await eventually(async () => (await panel(page).innerText()).includes("停用成员"));
});

test("关键词走服务端查询，total 原样展示服务端值", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  // 服务端 total 故意大于当前页行数：页面不得用行数覆盖。
  state.total = 37;
  state.rows = [member(101, { realName: "张三" })];
  await page.getByTestId("branch-member-keyword").fill("张");
  await page.getByTestId("branch-member-search").click();
  await eventually(() => pageRequests(state).length === 2);
  const last = pageRequests(state).at(-1);
  assert.equal(last.params.keyword, "张");
  assert.equal("status" in last.params, false);
  assert.equal(last.params.page, "1");
  await eventually(async () => (await page.getByTestId("branch-member-total").innerText()).includes("共 37 条"));
  assert.equal((await tableRows(page).count()) >= 1, true);
});

test("branchName 与 identityName 恒为 null 时按契约降级显示", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const rows = tableRows(page);
  // identityId=1 但 identityName=null：用一次性加载的身份字典映射名称。
  const first = await rows.nth(0).innerText();
  assert.match(first, /中共正式党员/);
  assert.doesNotMatch(first, /身份 #1/);
  // identityId=null：显示「未登记」，不能编造身份。
  const second = await rows.nth(1).innerText();
  assert.match(second, /未登记/);
  // identityId 有值但字典里没有：显示「身份 #99」，不猜名称。
  const third = await rows.nth(2).innerText();
  assert.match(third, /身份 #99/);
  // 列表不展示支部列（后端无名称），详情里降级为「支部名称不可用（编号 8）」，不额外请求支部接口。
  const listHeader = await page.locator('[data-testid="branch-member-table"] .el-table__header').innerText();
  assert.equal(listHeader.includes("支部名称"), false, "未补名称前不展示无法取值的支部列");
  await rows.nth(0).getByText("查看", { exact: true }).click();
  await detailDialog(page).waitFor();
  await eventually(async () => (await detailDialog(page).innerText()).includes("支部名称不可用（编号 8）"));
  // 降级只在页面内完成：不额外请求支部字典或逐行补名接口。
  const paths = state.requests.map((r) => r.path);
  assert.equal(paths.includes("/api/v4/members/101"), true, JSON.stringify(paths));
  // 降级只在页面内完成：除分页、身份字典与详情外不额外请求（尤其没有支部字典）。
  assert.deepEqual([...paths].sort(), [
    "/api/v2/content/identities/page",
    "/api/v4/members/101",
    "/api/v4/members/page",
  ]);
});

test("详情只请求 /v4/members/{id}，权威字段只读且无修改入口", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const beforePaths = state.requests.length;
  await page.getByTestId("branch-member-view").first().click();
  await detailDialog(page).waitFor();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  const added = state.requests.slice(beforePaths).map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(added, ["GET /api/v4/members/101"]);
  const text = await detailDialog(page).innerText();
  // 只读展示权威字段，并明确说明不可在本页修改。
  assert.match(text, /马克思主义学院/);
  assert.match(text, /权威字段/);
  assert.equal(text.includes("新增成员"), false);
  assert.equal(text.includes("删除"), false);
});

test("手机号置空时提交空串而非省略，payload 只含变更字段", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  await page.getByTestId("contact-phone").fill("");
  await page.getByTestId("contact-save").click();
  await eventually(() => state.contactWrites.length === 1);
  // 空串代表「清空」；用 truthy 判断或传 null 都会变成「不动」。
  assert.deepEqual(state.contactWrites[0], { id: 101, payload: { phone: "" } });
  await eventually(async () =>
    (await page.locator(".el-message").allInnerTexts()).join(" ").includes("联系方式已保存"),
  );
  // 保存后回读：手机号在详情里被清空显示为占位符，而不是保留旧值。
  await eventually(async () => (await page.getByTestId("contact-phone").inputValue()) === "");
});

test("只改邮箱与备注时 payload 只含这两项，未变更字段不发送", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  await page.getByTestId("contact-email").fill("newmail@example.com");
  await page.getByTestId("contact-remark").fill("已电话确认");
  await page.getByTestId("contact-save").click();
  await eventually(() => state.contactWrites.length === 1);
  assert.deepEqual(state.contactWrites[0].payload, { email: "newmail@example.com", remark: "已电话确认" });
  // 手机号没有改动，不得出现在 payload 中。
  assert.equal("phone" in state.contactWrites[0].payload, false);
});

test("无变更时不发保存请求；保存中重复点击只提交一次", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  await page.getByTestId("contact-save").click();
  await eventually(async () =>
    (await page.locator(".el-message").allInnerTexts()).join(" ").includes("联系方式未修改"),
  );
  assert.equal(state.contactWrites.length, 0);

  const gate = delay();
  state.saveGate = gate;
  await page.getByTestId("contact-remark").fill("防重复提交");
  await page.getByTestId("contact-save").click();
  await eventually(() => state.contactWrites.length === 1);
  // 同一事件循环内连续触发两次点击：Vue 尚未重渲染，只能靠 saving 同步置位拦截第二次。
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="contact-save"]');
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(state.contactWrites.length, 1, JSON.stringify(state.contactWrites));
});

test("保存成功但回读失败时分别提示保存成功与回读失败", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  state.readbackFail = 1;
  await page.getByTestId("contact-phone").fill("13900139000");
  await page.getByTestId("contact-save").click();
  await eventually(async () => {
    const messages = await page.locator(".el-message").allInnerTexts();
    return messages.some((m) => m.includes("联系方式已保存")) && messages.some((m) => m.includes("回读失败"));
  });
  const messages = (await page.locator(".el-message").allInnerTexts()).join(" | ");
  // 回读失败不能被说成保存失败，也不能只说其中一个。
  assert.match(messages, /联系方式已保存/);
  assert.match(messages, /保存成功，但回读失败，请手动刷新/);
  assert.doesNotMatch(messages, /保存失败/);
  // 输入内容保留，供用户手动核对。
  assert.equal(await page.getByTestId("contact-phone").inputValue(), "13900139000");
});

test("手机号与邮箱格式在允许空串的前提下按后端规则校验", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  await page.getByTestId("contact-phone").fill("1380013");
  await page.getByTestId("contact-save").click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("手机号格式不正确"));
  assert.equal(state.contactWrites.length, 0, "格式非法时不应发请求");
  await page.getByTestId("contact-phone").fill("");
  await page.getByTestId("contact-email").fill("not-an-email");
  await page.getByTestId("contact-save").click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("邮箱格式不正确"));
  assert.equal(state.contactWrites.length, 0);
  await page.getByTestId("contact-email").fill("");
  await page.getByTestId("contact-save").click();
  await eventually(() => state.contactWrites.length === 1);
  // 手机号与邮箱同时置空：两项都必须以空串提交。
  assert.deepEqual(state.contactWrites[0].payload, { phone: "", email: "" });
});

test("导出使用已应用条件，不含 page/size/branchId", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-keyword").fill("张");
  await page.getByTestId("branch-member-status").getByText("停用", { exact: true }).click();
  await page.getByTestId("branch-member-search").click();
  await eventually(() => pageRequests(state).length === 2);
  await page.getByTestId("branch-member-export").click();
  await eventually(() => state.requests.some((r) => r.path === "/api/v4/members/export"));
  const exportRequest = state.requests.find((r) => r.path === "/api/v4/members/export");
  assert.deepEqual(exportRequest.params, { keyword: "张", status: "2" });
  await eventually(async () => (await downloads(page)) === 1);
  const text = await page.getByTestId("branch-member-export").innerText();
  assert.match(text, /导出名单/);
  // 界面说明必须与后端 EXPORT_HEADERS 一致：不含政治身份与支部列。
  const hint = await page.locator(".toolbar-hint").first().innerText();
  assert.match(hint, /不含政治身份与支部列/);
});

test("导出返回非 ZIP 内容时报错且不触发下载", async (t) => {
  const { page, state } = await fixture(t, { state: { exportJson: true } });
  await waitTable(page);
  await page.getByTestId("branch-member-export").click();
  const error = page.getByTestId("branch-member-export-error");
  await error.waitFor();
  const text = await error.innerText();
  assert.match(text, /导出服务暂时不可用/);
  await page.waitForTimeout(300);
  assert.equal(await downloads(page), 0, "错误页不得被保存为 xlsx");
});

test("快速切换条件时较慢的旧条件响应不覆盖新结果", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const oldGate = delay();
  // 只冻结关键词「旧」的那次请求；随后的「新」请求正常返回。
  state.pageGates = { 2: oldGate };
  state.rows = [member(911, { realName: "旧条件成员" })];
  state.total = 1;
  await page.getByTestId("branch-member-keyword").fill("旧");
  await page.getByTestId("branch-member-search").click();
  await eventually(() => state.pageCalls === 2);
  state.rows = [member(912, { realName: "新条件成员" })];
  await page.getByTestId("branch-member-keyword").fill("新");
  await page.getByTestId("branch-member-search").click();
  await eventually(() => state.pageCalls === 3);
  await eventually(async () => (await panel(page).innerText()).includes("新条件成员"));
  // 旧条件的响应最后到达：只有请求序号能拦住它覆盖新条件的渲染结果。
  oldGate.resolve();
  await page.waitForTimeout(400);
  const text = await panel(page).innerText();
  assert.match(text, /新条件成员/);
  assert.doesNotMatch(text, /旧条件成员/);
});

test("换号后旧会话的分页响应不写回，且旧数据立即清空", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const oldGate = delay();
  const newGate = delay();
  // 冻结换号前的那次请求（第 2 次）与换号后的新请求（第 3 次）。
  state.pageGates = { 2: oldGate, 3: newGate };
  state.rows = [member(901, { realName: "旧会话成员" })];
  state.total = 1;
  await page.getByTestId("branch-member-keyword").fill("旧");
  await page.getByTestId("branch-member-search").click();
  await eventually(() => state.pageCalls === 2);
  state.rows = [member(902, { realName: "新会话成员" })];
  state.total = 1;
  await switchAccount(page);
  // 换号会清空上一会话已渲染的名单，不能等新响应回来才消失。
  await eventually(async () => (await panel(page).count()) === 0);
  await eventually(() => state.pageCalls === 3);
  // 先让新会话响应到达，再让旧会话响应最后到达：只有序号守卫能阻止旧数据写回。
  newGate.resolve();
  await eventually(async () => (await panel(page).innerText()).includes("新会话成员"));
  oldGate.resolve();
  await page.waitForTimeout(400);
  const text = await panel(page).innerText();
  assert.match(text, /新会话成员/);
  assert.doesNotMatch(text, /旧会话成员/);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
});

test("换号后旧会话的导出 Blob 不触发下载", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  const gate = delay();
  state.exportGate = gate;
  await page.getByTestId("branch-member-export").click();
  await eventually(() => state.requests.some((r) => r.path === "/api/v4/members/export"));
  await switchAccount(page);
  gate.resolve();
  await page.waitForTimeout(400);
  // 旧会话拿到的 Blob 不得在新会话里落盘。
  assert.equal(await downloads(page), 0);
  assert.equal(await page.getByTestId("branch-member-export-error").count(), 0);
});

test("退出登录后清空列表并显示需要登录提示", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await signOut(page);
  await eventually(async () => (await page.getByTestId("branch-members-no-token").count()) === 1);
  assert.equal(await panel(page).count(), 0);
  const alertText = await page.getByTestId("branch-members-no-token").innerText();
  assert.match(alertText, /支委工作台需要登录/);
  assert.match(alertText, /不会请求真实成员数据/);
  const calls = state.requests.length;
  await page.waitForTimeout(300);
  assert.equal(state.requests.length, calls, "退出后不得继续请求成员数据");
});

test("401 触发刷新后恰好重放一次分页请求", async (t) => {
  const { page, state } = await fixture(t, { state: { unauthorized: 1 } });
  await waitTable(page);
  const calls = pageRequests(state);
  assert.equal(calls.length, 2, JSON.stringify(calls));
  assert.equal(state.requests.filter((r) => r.path === "/api/v1/auth/refresh").length, 1);
  assert.equal(calls[0].authorization, "Bearer test-access");
  assert.equal(calls[1].authorization, "Bearer new-access");
  // 正常刷新不改页面身份，不得把页面推进错误态或无权限提示。
  assert.equal(await page.getByTestId("branch-member-error").count(), 0);
  assert.equal(await page.getByTestId("branch-member-no-permission").count(), 0);
  assert.match(await panel(page).innerText(), /张三/);
});

test("分页失败展示错误可重试，重试沿用已应用条件", async (t) => {
  const { page, state } = await fixture(t, { state: { failPageCalls: 1 } });
  const error = page.getByTestId("branch-member-error");
  await error.waitFor();
  assert.match(await error.innerText(), /成员服务暂时不可用/);
  // 失败时必须清空表格，不能把上一次结果留在页面上冒充本次数据。
  assert.equal(await panel(page).count(), 0);
  await page.getByTestId("branch-member-keyword").fill("李");
  state.failPageCalls = 1;
  await page.getByTestId("branch-member-search").click();
  await error.waitFor();
  const failed = pageRequests(state).at(-1);
  assert.equal(failed.params.keyword, "李");
  await page.getByTestId("branch-member-retry").click();
  await waitTable(page);
  const retried = pageRequests(state).at(-1);
  // 重试必须复用已应用条件，而不是回到默认查询。
  assert.equal(retried.params.keyword, "李");
  assert.equal(retried.params.page, "1");
  assert.match(await panel(page).innerText(), /张三/);
});

test("空列表展示空态而非错误，且不渲染表格", async (t) => {
  const { page, state } = await fixture(t, { state: { rows: [], total: 0 } });
  const empty = page.getByTestId("branch-member-empty");
  await empty.waitFor();
  assert.match(await empty.innerText(), /暂无本支部成员/);
  assert.equal(await page.getByTestId("branch-member-error").count(), 0);
  assert.equal(await panel(page).count(), 0);
  assert.equal(pageRequests(state).length, 1);
});

test("支委未归属支部时原样转达服务端 400 原因", async (t) => {
  const { page } = await fixture(t, {
    state: {
      pageError: { status: 400, message: "您尚未归属任何党支部，请联系管理员" },
    },
  });
  const error = page.getByTestId("branch-member-error");
  await error.waitFor();
  const text = await error.innerText();
  // 服务端原因必须原样转达，不能改写成通用的「加载失败」。
  assert.match(text, /您尚未归属任何党支部，请联系管理员/);
  assert.equal(await panel(page).count(), 0);
});

test("身份字典失败时提示按编号显示，列表仍可用", async (t) => {
  const { page } = await fixture(t, { state: { identitiesFail: true } });
  await waitTable(page);
  const hint = page.getByTestId("branch-member-identity-error");
  await hint.waitFor();
  assert.match(await hint.innerText(), /身份列将按编号显示/);
  // 字典失败不得把整页推进错误态：列表仍然渲染成员。
  assert.equal(await page.getByTestId("branch-member-error").count(), 0);
  const first = await tableRow(page, 0).innerText();
  // identityId=1 但字典缺失：降级为「身份 #1」，不空也不编造名称。
  assert.match(first, /身份 #1/);
});

test("身份字典请求失败不是空字典：仍显示编号而不是「未登记」", async (t) => {
  const { page } = await fixture(t, { state: { identitiesFail: true } });
  await waitTable(page);
  const third = await tableRow(page, 2).innerText();
  // identityId 本身为 null 的成员必须仍然是「未登记」，与字典失败无关。
  assert.match(third, /身份 #99/);
  const second = await tableRow(page, 1).innerText();
  assert.match(second, /未登记/);
});

test("未经搜索的输入不进入导出参数（只用已应用条件）", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  // 只在输入框里打字、不点搜索：导出必须仍用上一次已应用的条件（此处为默认无条件）。
  await page.getByTestId("branch-member-keyword").fill("未提交的关键词");
  await page.getByTestId("branch-member-export").click();
  await eventually(() => state.requests.some((r) => r.path === "/api/v4/members/export"));
  const exportRequest = state.requests.find((r) => r.path === "/api/v4/members/export");
  assert.equal("keyword" in exportRequest.params, false, JSON.stringify(exportRequest.params));
  assert.deepEqual(exportRequest.params, {});
});

test("保存请求失败时保留用户输入且不误报成功", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-view").first().click();
  await eventually(async () => (await detailDialog(page).innerText()).includes("张三"));
  state.saveFail = { status: 500, message: "手机号已被使用" };
  await page.getByTestId("contact-phone").fill("13900139000");
  await page.getByTestId("contact-save").click();
  await eventually(async () =>
    (await page.locator(".el-message").allInnerTexts()).join(" ").includes("手机号已被使用"),
  );
  const messages = (await page.locator(".el-message").allInnerTexts()).join(" | ");
  // 失败不得出现成功提示，输入必须保留供用户修正后重试。
  assert.doesNotMatch(messages, /联系方式已保存/);
  assert.equal(await page.getByTestId("contact-phone").inputValue(), "13900139000");
  assert.equal(await page.getByTestId("contact-save").isDisabled(), false);
});

test("390px 窄屏下表格与筛选控件可用键盘操作", async (t) => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await waitTable(page);
  // 关键词输入框可聚焦并用键盘输入，回车触发查询。
  const keyword = page.getByTestId("branch-member-keyword");
  await keyword.focus();
  assert.equal(await keyword.evaluate((el) => el === document.activeElement), true);
  await keyword.fill("张");
  // 导出与搜索按钮可被键盘聚焦（不是纯装饰元素）。
  const focusable = await page.evaluate(() => {
    const ids = ["branch-member-search", "branch-member-reset", "branch-member-export"];
    return ids.map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return { id, found: false };
      const button = el.tagName === "BUTTON" ? el : el.querySelector("button") || el;
      button.focus();
      return { id, found: true, focusable: button === document.activeElement || button.tabIndex >= 0 };
    });
  });
  for (const item of focusable) {
    assert.equal(item.found, true, `${item.id} 应存在`);
    assert.equal(item.focusable, true, `${item.id} 应可用键盘聚焦`);
  }
  // 窄屏下页码与状态切换仍可见可读。
  assert.match(await page.getByTestId("branch-member-status").innerText(), /停用/);
});

test("换号后筛选条件回到默认，不沿用旧账号的关键词", async (t) => {
  const { page, state } = await fixture(t);
  await waitTable(page);
  await page.getByTestId("branch-member-keyword").fill("旧关键词");
  await page.getByTestId("branch-member-search").click();
  await eventually(() => pageRequests(state).length === 2);
  await switchAccount(page);
  await eventually(() => pageRequests(state).length === 3);
  const last = pageRequests(state).at(-1);
  // 新账号的支部范围不同，沿用旧关键词会直接落入空态。
  assert.equal("keyword" in last.params, false, JSON.stringify(last.params));
  assert.equal(await page.getByTestId("branch-member-keyword").inputValue(), "");
});

test("无令牌的开发预览态零业务请求", async (t) => {
  const { page, state } = await fixture(t, { withToken: false, previewRole: "party_secretary" });
  await eventually(async () => (await page.getByTestId("branch-members-no-token").count()) === 1);
  const alertText = await page.getByTestId("branch-members-no-token").innerText();
  assert.match(alertText, /支委工作台需要登录/);
  await page.waitForTimeout(300);
  assert.equal(state.requests.length, 0, JSON.stringify(state.requests));
  assert.equal(state.pageCalls, 0);
});

test("普通成员直访被路由守卫拦回首页且零成员请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  await page.waitForTimeout(200);
  assert.equal(state.pageCalls, 0, JSON.stringify(state.requests));
  assert.equal(await panel(page).count(), 0);
});

test("390px 窄屏无整页横向溢出，表格仍可读取", async (t) => {
  const { page, state } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await waitTable(page);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  const box = await page.locator(".branch-members-page").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= overflow.clientWidth + 1, JSON.stringify(box));
  assert.match(await panel(page).innerText(), /张三/);
  assert.equal(pageRequests(state).length, 1);
});
