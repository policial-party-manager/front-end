import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/system-roles-${process.pid}`,
    server: { host: "127.0.0.1", port: 5193, strictPort: false },
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

const role = (id, roleCode, userCount, permissions = []) => ({
  id,
  roleCode,
  description: `${roleCode} 描述`,
  userCount,
  permissions,
});
const ok = (route, data) => route.fulfill({ json: { code: 200, message: "ok", data } });
const delay = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function eventually(fn, hint = "") {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.fail(`等待行为完成超时 ${hint}`);
}

/** 与会员测试同构的夹具：注入超管会话、拦截 /api，并在页面就绪后等待表格渲染。 */
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
  }, options.role || "super_admin");
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    rows: [role(1, "super_admin", 1), role(2, "branch_admin", 4), role(3, "student", 22)],
    dictionary: [
      "user:query",
      "user:manage",
      "branch:manage",
      "role:manage",
      "activity:manage",
      "news:manage",
      "notice:manage",
    ],
    requests: [],
    writes: [],
    listFail: false,
    dictFail: false,
    detailFail: false,
    readbackFail: false,
    writeFail: false,
    gate: null,
    detailGate: null,
    ...options,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      method = req.method();
    state.requests.push({ path, method, params: Object.fromEntries(url.searchParams) });
    if (path === "/api/v1/auth/refresh")
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        role: "super_admin",
        username: "admin",
      });
    // 未授权角色会被路由守卫踢回首页，首页自身的资讯接口需要给出可渲染响应。
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v4/admin/roles/permission-names")
      return state.dictFail
        ? route.fulfill({ status: 500, json: { message: "字典失败" } })
        : ok(route, state.dictionary);
    if (path === "/api/v4/admin/roles" && method === "GET")
      return state.listFail || state.readbackFail
        ? route.fulfill({
            status: typeof state.listFail === "number" ? state.listFail : 500,
            json: { code: 403, message: "无权访问该接口" },
          })
        : ok(route, state.rows);
    if (path === "/api/v4/admin/roles" && method === "POST") {
      state.writes.push({ method, path, body: req.postDataJSON() });
      if (state.writeFail) return route.fulfill({ status: 400, json: { message: "角色已存在" } });
      if (state.gate) await state.gate.promise;
      state.rows = [...state.rows, role(9, req.postDataJSON().roleCode, 0)];
      return ok(route, null);
    }
    if (/^\/api\/v4\/admin\/roles\/\d+$/.test(path) && method === "GET") {
      const id = +path.split("/").pop();
      if (state.detailGate && id === 3) await state.detailGate.promise;
      if (state.detailFail) return route.fulfill({ status: 500, json: { message: "角色详情失败" } });
      return ok(route, state.rows.find((r) => r.id === id) || null);
    }
    if (/^\/api\/v4\/admin\/roles\/\d+\/permissions$/.test(path) && method === "PUT") {
      state.writes.push({ method, path, body: req.postDataJSON() });
      if (state.writeFail) return route.fulfill({ status: 403, json: { message: "没有操作权限" } });
      return ok(route, null);
    }
    if (/^\/api\/v4\/admin\/roles\/\d+$/.test(path) && method === "PUT") {
      state.writes.push({ method, path, body: req.postDataJSON() });
      if (state.writeFail) return route.fulfill({ status: 400, json: { message: "角色不存在" } });
      if (state.gate) await state.gate.promise;
      return ok(route, null);
    }
    if (/^\/api\/v4\/admin\/roles\/\d+$/.test(path) && method === "DELETE") {
      state.writes.push({ method, path });
      if (state.writeFail) return route.fulfill({ status: 400, json: { message: "该角色仍被用户使用，无法删除" } });
      return ok(route, null);
    }
    unexpected.push(`${method} ${path}`);
    return route.abort();
  });
  await page.goto(`${baseURL}/system/roles`);
  if (!(options.role && options.role !== "super_admin") && !state.listFail && !state.readbackFail) {
    await page.locator(".roles-table").waitFor();
    await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === state.rows.length);
  }
  return { page, state, context };
}

const row = (page, index = 0) => page.locator(".roles-table tbody tr").nth(index);
const dialog = (page, name) => page.getByRole("dialog", { name, exact: true });
const messageBox = (page) => page.locator(".el-message-box");
const field = (d, label) =>
  d
    .locator(".el-form-item")
    .filter({ has: d.page().locator("label", { hasText: new RegExp(`^${label}$`) }) })
    .locator("input, textarea");
/** Element Plus 的 checkbox 原始 input 被隐藏，必须点可见的 label。 */
const check = (d, name) =>
  d
    .locator(".el-checkbox")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();

test("列表本地搜索命中编码与描述，空结果与空数据文案区分", async (t) => {
  const { page } = await fixture(t);
  const search = page.locator(".filters input").first();
  await search.fill("branch");
  await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === 1);
  assert.match(await row(page).innerText(), /branch_admin/);
  await search.fill("不存在的角色");
  await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === 0);
  assert.match(await page.locator(".roles-table").innerText(), /没有匹配的角色/);
});

test("编辑角色时编码只读，更新请求不发送 roleCode", async (t) => {
  const { page, state } = await fixture(t);
  await row(page, 2).getByRole("button", { name: "编辑", exact: true }).click();
  const d = dialog(page, "编辑角色");
  await d.waitFor();
  assert.equal(await field(d, "角色编码").isDisabled(), true);
  await field(d, "描述").fill("普通成员描述已更新");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal(state.writes[0].method, "PUT");
  assert.equal(state.writes[0].path, "/api/v4/admin/roles/3");
  assert.deepEqual(state.writes[0].body, { description: "普通成员描述已更新" });
  assert.equal("roleCode" in state.writes[0].body, false);
});

test("新增角色校验 trim 后非空，纯空格与空值都不提交", async (t) => {
  const { page, state } = await fixture(t);
  await page.getByRole("button", { name: "新增角色", exact: true }).click();
  const d = dialog(page, "新增角色");
  await d.waitFor();
  await field(d, "角色编码").fill("   ");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await d.locator(".el-form-item__error").waitFor();
  assert.equal(state.writes.length, 0);
  await field(d, "角色编码").fill("  auditor  ");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.deepEqual(state.writes[0].body, { roleCode: "auditor", description: "" });
  await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === 4);
});

test("保存进行中双击只发一次请求，期间不允许关闭弹窗", async (t) => {
  const { page, state } = await fixture(t);
  await page.getByRole("button", { name: "新增角色", exact: true }).click();
  const d = dialog(page, "新增角色");
  await d.waitFor();
  state.gate = delay();
  await field(d, "角色编码").fill("auditor");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  await field(d, "角色编码").dispatchEvent("input");
  await d.getByRole("button", { name: "保存", exact: true }).dispatchEvent("click");
  assert.equal(state.writes.length, 1);
  // 写入期间关闭按钮被拦截：弹窗仍在，取消按钮禁用。
  await d.locator(".el-dialog__headerbtn").click();
  assert.equal(await d.isVisible(), true);
  assert.equal(await d.getByRole("button", { name: "取消", exact: true }).isDisabled(), true);
  state.gate.resolve();
  await eventually(async () => !(await d.isVisible()));
  assert.equal(state.writes.length, 1);
});

test("写入成功但列表回读失败时明确提示结果有效且保留重试入口", async (t) => {
  const { page, state } = await fixture(t);
  state.readbackFail = true;
  state.listFail = false;
  await page.getByRole("button", { name: "新增角色", exact: true }).click();
  const d = dialog(page, "新增角色");
  await d.waitFor();
  await field(d, "角色编码").fill("auditor");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  await eventually(async () => (await page.locator(".el-alert--error").count()) > 0);
  // 先提示“角色已新增”，回读失败后另加一条“结果有效但列表陈旧”，两条都不演变为失败。
  assert.match(
    await page
      .locator(".el-message")
      .allInnerTexts()
      .then((texts) => texts.join("\n")),
    /角色已新增/,
  );
  assert.match(
    await page
      .locator(".el-message")
      .allInnerTexts()
      .then((texts) => texts.join("\n")),
    /角色已保存，但列表回读失败/,
  );
  assert.match(await page.locator(".el-alert--error").first().innerText(), /角色数据加载失败/);
  state.readbackFail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === 4);
});

test("权限字典加载失败时禁用保存，避免全量覆盖成不完整结果", async (t) => {
  const { page, state } = await fixture(t, { dictFail: true });
  await row(page, 1).getByRole("button", { name: "分配权限", exact: true }).click();
  const d = dialog(page, "分配角色权限");
  await d.waitFor();
  const alert = d.locator(".el-alert--warning").filter({ hasText: "权限点字典加载失败" });
  await alert.waitFor();
  assert.equal(await d.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  state.dictFail = false;
  await alert.getByRole("button", { name: "重试加载", exact: true }).click();
  await eventually(async () => (await d.locator(".el-checkbox").count()) === state.dictionary.length);
  assert.equal(await d.getByRole("button", { name: "保存", exact: true }).isDisabled(), false);
});

test("权限分配全量覆盖提交勾选项，字典外旧权限原样保留", async (t) => {
  const { page, state } = await fixture(t, {
    rows: [role(1, "super_admin", 1), role(2, "branch_admin", 4, ["user:query", "legacy:unknown"])],
  });
  await row(page, 1).getByRole("button", { name: "分配权限", exact: true }).click();
  const d = dialog(page, "分配角色权限");
  await d.waitFor();
  const unknown = d.locator(".el-alert--warning").filter({ hasText: "当前角色包含字典外的权限点" });
  await unknown.waitFor();
  assert.match(await unknown.innerText(), /legacy:unknown/);
  await check(d, "role:manage");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal(state.writes[0].path, "/api/v4/admin/roles/2/permissions");
  assert.deepEqual([...state.writes[0].body.permissionNames].sort(), ["legacy:unknown", "role:manage", "user:query"]);
});

test("清空全部权限需要二次确认，取消则不提交任何覆盖请求", async (t) => {
  const { page, state } = await fixture(t, {
    rows: [role(1, "super_admin", 1), role(2, "branch_admin", 4, ["user:query", "role:manage"])],
  });
  await row(page, 1).getByRole("button", { name: "分配权限", exact: true }).click();
  const d = dialog(page, "分配角色权限");
  await d.waitFor();
  await check(d, "user:query");
  await check(d, "role:manage");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  const confirm = messageBox(page);
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /确定清空角色「branch_admin」的全部 2 项权限/);
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(state.writes.length, 0);
});

test("删除确认展示角色编码与使用人数，取消不发 DELETE", async (t) => {
  const { page, state } = await fixture(t);
  await row(page, 2).getByRole("button", { name: "删除", exact: true }).click();
  const confirm = messageBox(page);
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /student/);
  assert.match(await confirm.innerText(), /22/);
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(state.writes.length, 0);
  await row(page, 2).getByRole("button", { name: "删除", exact: true }).click();
  await messageBox(page).getByRole("button", { name: "确定删除", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.deepEqual(state.writes[0], { method: "DELETE", path: "/api/v4/admin/roles/3" });
});

test("使用人数为 0 也如实展示，删除成功后才回读列表", async (t) => {
  const { page, state } = await fixture(t, { rows: [role(1, "super_admin", 1), role(5, "auditor", 0)] });
  await row(page, 1).getByRole("button", { name: "删除", exact: true }).click();
  const confirm = messageBox(page);
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /该角色当前有 0 个用户使用/);
  const listCalls = state.requests.filter((r) => r.path === "/api/v4/admin/roles" && r.method === "GET").length;
  state.rows = [role(1, "super_admin", 1)];
  await confirm.getByRole("button", { name: "确定删除", exact: true }).click();
  await eventually(
    () => state.requests.filter((r) => r.path === "/api/v4/admin/roles" && r.method === "GET").length > listCalls,
  );
  await eventually(async () => (await page.locator(".roles-table tbody tr").count()) === 1);
});

test("同角色换号清空列表、弹窗与在途详情，旧响应不覆盖新会话", async (t) => {
  const { page, state } = await fixture(t);
  state.detailGate = delay();
  await row(page, 2).getByRole("button", { name: "编辑", exact: true }).click();
  const d = dialog(page, "编辑角色");
  await d.waitFor();
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: "super_admin", username: "other" });
  });
  await eventually(async () => !(await d.isVisible()));
  state.detailGate.resolve();
  await page.waitForTimeout(200);
  assert.equal(await d.count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
  // 新会话重新拉取列表与字典，不复用上一个账号的数据。
  await eventually(
    () => state.requests.filter((r) => r.path === "/api/v4/admin/roles" && r.method === "GET").length >= 2,
  );
});

test("字典加载失败后列表仍可用，但权限弹窗保持禁用状态", async (t) => {
  const { page } = await fixture(t, { dictFail: true });
  assert.equal(await page.locator(".roles-table tbody tr").count(), 3);
  await row(page, 0).getByRole("button", { name: "分配权限", exact: true }).click();
  const d = dialog(page, "分配角色权限");
  await d.waitFor();
  await d.locator(".el-alert--warning").filter({ hasText: "权限点字典加载失败" }).waitFor();
  assert.equal(await d.locator(".el-checkbox").count(), 0);
  assert.equal(await d.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
});

test("角色详情读取失败不展示半成品表单，避免用旧快照覆盖服务端", async (t) => {
  const { page, state } = await fixture(t, { detailFail: true });
  await row(page, 1).getByRole("button", { name: "编辑", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await dialog(page, "编辑角色").count(), 0);
  assert.equal(state.writes.length, 0);
});

test("非超管角色直访系统管理被路由拦截，且不发起管理接口请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_secretary" });
  // 路由守卫应跳到首页，不渲染角色页，也不请求需超管权限的管理接口。
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.equal(await page.locator(".roles-table").count(), 0);
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  assert.deepEqual(
    state.requests.filter((r) => r.path.startsWith("/api/v4/admin")),
    [],
  );
  // 直接访问日志页同样被拦。
  await page.goto(`${baseURL}/system/logs`);
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.equal(await page.locator(".stats-section").count(), 0);
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
});

test("服务端返回 403 时展示真实错误，不冒充空数据也不自行展示权限", async (t) => {
  const { page, state } = await fixture(t, { listFail: 403 });
  await page.locator(".load-error").waitFor();
  assert.match(await page.locator(".load-error").innerText(), /角色数据加载失败/);
  assert.equal(await page.locator(".roles-table tbody tr").count(), 0);
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await eventually(() => state.requests.filter((r) => r.path === "/api/v4/admin/roles").length >= 2);
});
