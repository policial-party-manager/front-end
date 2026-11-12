import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// 在真实页面操作表单，仅拦截 HTTP 边界；不读取组件私有状态。
let server;
let browser;
let baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/branch-regressions-vite-${process.pid}`,
    server: { host: "127.0.0.1", port: 5184, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  baseURL = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function eventually(check, message) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.fail(message);
}
const user = (id, name) => ({ id, realName: name, username: `user${id}`, roleId: 7, role: "branch_admin", status: 1 });

async function fixture(t) {
  const context = await browser.newContext();
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "浏览器不应出现未处理的运行错误");
  });
  await context.addInitScript((origin) => {
    // 新页面初始 about:blank 没有存储权限，只初始化测试站点。
    if (location.origin !== origin) return;
    if (localStorage.getItem("party_access_token")) return;
    localStorage.setItem("party_access_token", "test-access");
    localStorage.setItem("party_refresh_token", "test-refresh");
    localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role: "super_admin" }));
  }, baseURL);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const state = {
    users: [user(101, "支委甲"), user(102, "支委乙")],
    branches: [
      { id: 1, branchName: "第一支部", college: "信息学院", secretaryId: 101, description: "", status: 1 },
      { id: 2, branchName: "第二支部", college: "信息学院", secretaryId: 102, description: "", status: 1 },
    ],
    refreshPath: "",
    refreshes: 0,
    writes: [],
    deletes: [],
    searches: [],
    searchGate: null,
    searchStarted: false,
    memberGate: null,
    memberStarted: false,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ json: { code: 200, message: "ok", data } });
    if (path === "/api/v1/auth/refresh") {
      state.refreshes++;
      return ok({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        username: "admin",
        realName: "管理员",
        role: "super_admin",
      });
    }
    if (path === state.refreshPath && request.headers().authorization === "Bearer test-access") {
      return route.fulfill({ status: 401, json: { code: 401, message: "expired" } });
    }
    if (path.endsWith("/roles")) return ok([{ id: 7, roleCode: "branch_admin" }]);
    if (path.endsWith("/users/page")) {
      const keyword = url.searchParams.get("keyword") || "";
      state.searches.push(keyword);
      if (keyword === "甲" && state.searchGate) {
        state.searchStarted = true;
        await state.searchGate.promise;
      }
      const records = state.users.filter((item) => item.realName.includes(keyword));
      return ok({ records, total: records.length });
    }
    const member = path.match(/\/users\/(\d+)$/);
    if (member) {
      if (member[1] === "101" && state.memberGate) {
        state.memberStarted = true;
        await state.memberGate.promise;
      }
      return ok(state.users.find((item) => item.id === Number(member[1])));
    }
    if (path.endsWith("/branches/page")) {
      const keyword = url.searchParams.get("keyword") || "";
      const records = state.branches.filter((item) => item.branchName.includes(keyword));
      return ok({ records, total: records.length });
    }
    if (path.endsWith("/branches") && request.method() === "POST") {
      const body = request.postDataJSON();
      state.writes.push(body);
      state.branches.push({ ...body, id: 3 });
      return ok(null);
    }
    const branch = path.match(/\/branches\/(\d+)$/);
    if (branch && request.method() === "DELETE") {
      state.deletes.push(Number(branch[1]));
      return ok(null);
    }
    if (branch) return ok(state.branches.find((item) => item.id === Number(branch[1])));
    return route.fulfill({ status: 404, json: { code: 404, message: "unexpected request" } });
  });
  await page.goto(`${baseURL}/branches`);
  await page.locator(".branches-table").waitFor({ timeout: 15000 });
  await eventually(async () => (await page.locator(".branches-table tbody tr").count()) === 2, "支部列表应已加载");
  return { page, state };
}
async function createDialog(page) {
  await page.getByRole("button", { name: "新增支部", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增支部", exact: true });
  await dialog.waitFor();
  await eventually(
    async () => (await dialog.locator(".candidate-toolbar").innerText()).includes("共 2 位"),
    "书记候选应已加载",
  );
  return dialog;
}
const field = (dialog, label) => dialog.locator(".el-form-item").filter({ hasText: label }).locator("input");

test("正常 401 刷新保留未保存表单及候选加载结果", async (t) => {
  const { page, state } = await fixture(t);
  const dialog = await createDialog(page);
  await field(dialog, "支部名称").fill("未保存支部");
  state.refreshPath = "/api/v4/admin/users/page";
  await dialog.getByRole("button", { name: "刷新", exact: true }).click();
  await eventually(() => state.refreshes === 1, "应实际触发 401 刷新");
  await eventually(
    async () =>
      (await dialog.isVisible()) && (await dialog.locator(".candidate-toolbar").innerText()).includes("共 2 位"),
    "刷新后表单与候选应保留",
  );
  assert.equal(await field(dialog, "支部名称").inputValue(), "未保存支部");
});

test("在途搜索被清空后恢复完整候选，旧响应不得覆盖", async (t) => {
  const { page, state } = await fixture(t);
  const dialog = await createDialog(page);
  const gate = deferred();
  state.searchGate = gate;
  t.after(() => gate.resolve());
  const input = dialog.locator(".secretary-select input");
  await input.fill("甲");
  await eventually(() => state.searchStarted, "搜索请求应已发出");
  await input.fill("");
  await eventually(
    () => state.searches.filter((keyword) => keyword === "").length === 2,
    "清空在途搜索应重新请求完整候选",
  );
  const response = page.waitForResponse(
    (res) => res.url().includes("/users/page") && new URL(res.url()).searchParams.get("keyword") === "甲",
  );
  gate.resolve();
  await response;
  await eventually(
    async () => (await dialog.locator(".candidate-toolbar").innerText()).includes("共 2 位"),
    "清空后应恢复 2 位候选",
  );
  await input.click();
  await page.getByRole("option").filter({ hasText: "支委乙" }).waitFor();
});

test("详情切换后上一支部的延迟书记响应不得覆盖当前书记", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.memberGate = gate;
  t.after(() => gate.resolve());
  await page
    .locator(".branches-table tbody tr")
    .filter({ hasText: "第一支部" })
    .getByRole("button", { name: "详情" })
    .click();
  await eventually(() => state.memberStarted, "第一支部书记请求应在途");
  const dialog = page.getByRole("dialog", { name: "支部详情", exact: true });
  await dialog.locator(".el-dialog__headerbtn").click();
  await page
    .locator(".branches-table tbody tr")
    .filter({ hasText: "第二支部" })
    .getByRole("button", { name: "详情" })
    .click();
  await eventually(async () => (await dialog.innerText()).includes("支委乙"), "第二支部应显示书记乙");
  const response = page.waitForResponse((res) => res.url().endsWith("/users/101"));
  gate.resolve();
  await response;
  // 等待旧响应完成回写的一个浏览器任务周期，再检查最终界面。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok((await dialog.innerText()).includes("支委乙"), "第二支部不得被书记甲覆盖");
});

test("保存触发 401 刷新后仍只创建一次并展示服务端回读详情", async (t) => {
  const { page, state } = await fixture(t);
  const dialog = await createDialog(page);
  await field(dialog, "支部名称").fill("刷新后新支部");
  await field(dialog, "所属学院").fill("信息学院");
  await dialog.locator(".secretary-select input").click();
  await page.getByRole("option").filter({ hasText: "支委甲" }).click();
  state.refreshPath = "/api/v4/admin/branches";
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "支部详情", exact: true });
  await detail.waitFor();
  assert.ok((await detail.innerText()).includes("刷新后新支部"));
  await eventually(async () => (await detail.innerText()).includes("支委甲"), "应回读正确书记");
  assert.equal(state.refreshes, 1);
  assert.equal(state.writes.length, 1);
});

test("同角色同名账号重新登录使旧表单失效，旧搜索不污染新表单", async (t) => {
  const { page, state } = await fixture(t);
  const dialog = await createDialog(page);
  const gate = deferred();
  state.searchGate = gate;
  t.after(() => gate.resolve());
  await dialog.locator(".secretary-select input").fill("甲");
  await eventually(() => state.searchStarted, "旧会话的搜索应在途");
  // 直接调用公开的登录会话接口，避免本回归依赖登录表单的验证码流程。
  await page.evaluate(async () => {
    const session = await import("/src/utils/session.ts");
    session.applySession({
      accessToken: "another-access",
      refreshToken: "another-refresh",
      role: "super_admin",
      realName: "管理员",
    });
  });
  await eventually(async () => !(await dialog.isVisible()), "显式登录即使同名同角色也应关闭旧表单");
  const next = await createDialog(page);
  const response = page.waitForResponse(
    (res) => res.url().includes("/users/page") && new URL(res.url()).searchParams.get("keyword") === "甲",
  );
  gate.resolve();
  await response;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await next.locator(".secretary-select input").inputValue(), "");
  assert.ok((await next.locator(".candidate-toolbar").innerText()).includes("共 2 位"));
});

test("另一标签页换号关闭旧表单，退出后不再展示管理数据", async (t) => {
  const { page } = await fixture(t);
  const dialog = await createDialog(page);
  const other = await page.context().newPage();
  await other.goto(`${baseURL}/branches`);
  await other.evaluate(async () => {
    const session = await import("/src/utils/session.ts");
    session.applySession({
      accessToken: "other-access",
      refreshToken: "other-refresh",
      role: "super_admin",
      realName: "管理员",
    });
  });
  await page.bringToFront();
  await eventually(async () => !(await dialog.isVisible()), "跨标签页的同名账号登录也应使旧表单失效");
  await createDialog(page);
  await other.evaluate(async () => {
    (await import("/src/utils/session.ts")).clearSession();
  });
  await page.bringToFront();
  await page.getByText("支部管理需要登录", { exact: true }).waitFor();
  assert.equal(await page.locator(".branches-table").count(), 0);
});

test("跨标签页正常刷新保留表单，但请求层旧 Token 快照仍失效", async (t) => {
  const { page } = await fixture(t);
  const dialog = await createDialog(page);
  await field(dialog, "支部名称").fill("跨页刷新保留");
  const other = await page.context().newPage();
  await other.goto(`${baseURL}/branches`);
  const snapshots = await other.evaluate(async () => {
    const session = await import("/src/utils/session.ts");
    const token = session.captureSession();
    const identity = session.captureSessionIdentity();
    const accepted = session.applyRefreshedSession(
      { accessToken: "cross-access", refreshToken: "cross-refresh", role: "super_admin", realName: "跨页刷新" },
      token,
    );
    return {
      accepted,
      oldTokenValid: session.isSessionCurrent(token),
      oldIdentityValid: session.isSessionIdentityCurrent(identity),
    };
  });
  assert.deepEqual(snapshots, { accepted: true, oldTokenValid: false, oldIdentityValid: true });
  await page.bringToFront();
  await eventually(
    () => page.evaluate(async () => (await import("/src/utils/session.ts")).sessionUser.value.name === "跨页刷新"),
    "另一页的刷新资料应已同步",
  );
  assert.ok(await dialog.isVisible());
  assert.equal(await field(dialog, "支部名称").inputValue(), "跨页刷新保留");
});

test("同角色换号后关闭已展示的支部详情与书记资料", async (t) => {
  const { page } = await fixture(t);
  await page
    .locator(".branches-table tbody tr")
    .filter({ hasText: "第一支部" })
    .getByRole("button", { name: "详情" })
    .click();
  const detail = page.getByRole("dialog", { name: "支部详情", exact: true });
  await eventually(async () => (await detail.innerText()).includes("支委甲"), "应先展示旧会话书记资料");
  await page.evaluate(async () => {
    (await import("/src/utils/session.ts")).applySession({
      accessToken: "switched-access",
      refreshToken: "switched-refresh",
      role: "super_admin",
      realName: "管理员",
    });
  });
  await eventually(async () => !(await detail.isVisible()), "同角色换号也应清理旧会话详情");
});

test("换号前打开的删除确认不得以新账号身份提交", async (t) => {
  const { page, state } = await fixture(t);
  await page
    .locator(".branches-table tbody tr")
    .filter({ hasText: "第一支部" })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  const confirmation = page.locator(".el-message-box");
  await confirmation.waitFor();
  await page.evaluate(async () => {
    (await import("/src/utils/session.ts")).applySession({
      accessToken: "delete-switched-access",
      refreshToken: "delete-switched-refresh",
      role: "super_admin",
      realName: "管理员",
    });
  });
  await confirmation.getByRole("button", { name: "确定删除", exact: true }).click();
  await page.waitForLoadState("networkidle");
  assert.deepEqual(state.deletes, [], "旧确认操作不得使用新会话发送 DELETE");
});
