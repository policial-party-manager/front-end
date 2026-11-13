import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/members-${process.pid}`,
    server: { host: "127.0.0.1", port: 5191, strictPort: false },
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
const member = (id = 101) => ({
  id,
  username: `user${id}`,
  realName: `成员${id}`,
  studentId: `2024${id}`,
  college: "学院",
  className: "一班",
  branchId: null,
  branchName: null,
  roleId: 7,
  role: "student",
  identityId: 3,
  identityName: "积极分子",
  status: 1,
});
const ok = (route, data) => route.fulfill({ json: { code: 200, message: "ok", data } });
const delay = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function eventually(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.fail("等待行为完成超时");
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
    window.downloads = [];
    const native = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      void blob.text().then((text) => window.downloads.push(text));
      return native(blob);
    };
    HTMLAnchorElement.prototype.click = function () {};
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    rows: [member(), { ...member(102), branchId: 99, identityId: 99, identityName: null }],
    requests: [],
    writes: [],
    dictionaryFail: false,
    branchFail: false,
    batchResult: { total: 1, successCount: 1, failCount: 0, errors: [] },
    pageFail: false,
    exportError: false,
    gate: null,
    detailGate: null,
    refresh: false,
    ...options,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    state.requests.push({ path, params: Object.fromEntries(url.searchParams), method: req.method() });
    if (path === "/api/v1/auth/refresh")
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        role: "super_admin",
        username: "admin",
      });
    if (path === "/api/v1/auth/login/userpass") {
      state.logins = (state.logins || 0) + 1;
      if (state.loginGate) await state.loginGate.promise;
      return ok(route, {
        accessToken: "login-access",
        refreshToken: "login-refresh",
        username: "superadmin",
        realName: "测试账号",
        role: state.loginRole || "student",
        branchId: null,
        branchName: null,
      });
    }
    if (path === "/api/v4/admin/branches/options")
      return state.branchFail
        ? route.fulfill({ status: 500, json: { message: "支部失败" } })
        : ok(route, [{ id: 1, branchName: "正常第一支部" }]);
    if (path === "/api/v4/admin/roles" && state.roleFail)
      return route.fulfill({ status: 500, json: { message: "角色失败" } });
    if (path === "/api/v4/admin/roles")
      return ok(route, [
        { id: 7, roleCode: "student" },
        { id: 8, roleCode: "branch_admin" },
      ]);
    if (path === "/api/v2/content/identities/page") {
      if (state.dictionaryEmpty) return ok(route, { records: [], total: 0 });
      if (state.dictionaryFail) return route.fulfill({ status: 500, json: { message: "字典失败" } });
      return ok(route, {
        total: 2,
        records:
          url.searchParams.get("page") === "1"
            ? [{ id: 3, identityName: "积极分子" }]
            : [{ id: 4, identityName: "正式党员" }],
      });
    }
    if (["/api/v2/content/news/page", "/api/v2/content/notices/page"].includes(path))
      return ok(route, { records: [], total: 0 });
    if (["/api/v4/admin/users/page", "/api/v4/members/page"].includes(path)) {
      if (state.pageGate) {
        const gate = state.pageGate;
        state.pageGate = null;
        await gate.promise;
        return ok(route, { records: [member(999)], total: 1 });
      }
      if (state.pageFail) return route.fulfill({ status: 500, json: { message: "列表失败" } });
      return ok(route, { records: state.rows, total: state.total ?? state.rows.length });
    }
    if (path === "/api/v4/members/export") {
      if (state.gate) await state.gate.promise;
      return state.exportError
        ? route.fulfill({
            contentType: state.exportMime || "application/json",
            body: JSON.stringify({ code: 400, message: "导出失败" }),
          })
        : route.fulfill({
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            body: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x74, 0x65, 0x73, 0x74]),
          });
    }
    if (
      (req.method() === "POST" &&
        (path === "/api/v4/admin/users" || /^\/api\/v4\/admin\/users\/batch\/(status|branch)$/.test(path))) ||
      (req.method() === "PUT" && /^\/api\/v4\/admin\/users\/\d+(\/status)?$/.test(path))
    ) {
      state.writes.push({ path, body: req.postDataJSON() });
      if (state.refresh && req.headers().authorization === "Bearer test-access")
        return route.fulfill({ status: 401, json: { code: 401 } });
      if (state.gate) await state.gate.promise;
      if (state.reject) return route.fulfill({ status: 403, json: { code: 403, message: "没有操作权限" } });
      if (state.abort) return route.abort("failed");
      return ok(route, path.includes("/batch/") ? state.batchResult : null);
    }
    const match = path.match(/^\/api\/v4\/admin\/users\/(\d+)$/);
    if (match) {
      if (state.detailGate && +match[1] === 101) await state.detailGate.promise;
      return ok(
        route,
        state.rows.find((r) => r.id === +match[1]),
      );
    }
    unexpected.push(path);
    return route.abort();
  });
  await page.goto(`${baseURL}/members`);
  await page.locator(".members-table").waitFor();
  await eventually(async () => (await page.locator(".members-table tbody tr").count()) === state.rows.length);
  return { page, state, context };
}
async function edit(page, index = 0) {
  await page.locator(".members-table tbody tr").nth(index).getByRole("button", { name: "编辑", exact: true }).click();
  const d = page.getByRole("dialog", { name: "编辑成员", exact: true });
  await d.waitFor();
  return d;
}
const field = (d, label) =>
  d
    .locator(".el-form-item")
    .filter({ has: d.page().locator("label", { hasText: new RegExp(`^${label}$`) }) })
    .locator("input");
async function choose(page, locator, name) {
  await locator.click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("编辑基础字段只读且更新只发送可编辑白名单，关联未变不发送", async (t) => {
  const { page, state } = await fixture(t);
  const d = await edit(page);
  for (const label of ["登录账号", "姓名", "学号", "学院", "班级"])
    assert.equal(await field(d, label).isDisabled(), true, label);
  await field(d, "手机号").fill("13800138000");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.deepEqual(state.writes[0].body, {
    gender: "",
    grade: "",
    major: "",
    phone: "13800138000",
    email: "",
    contactPerson: "",
    remark: "",
  });
});

test("关联支持有效替换，缺失选项保留原 ID 且无清除入口", async (t) => {
  const { page, state } = await fixture(t);
  const d = await edit(page, 1);
  assert.match(await d.locator(".el-form-item").filter({ hasText: "所属支部" }).innerText(), /支部名称不可用/);
  assert.equal(await d.locator(".el-select__clear").count(), 0);
  await choose(page, d.locator(".el-form-item").filter({ hasText: "所属支部" }).locator(".el-select"), "正常第一支部");
  await choose(page, d.locator(".el-form-item").filter({ hasText: /^角色/ }).locator(".el-select"), "支部管理员");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal(state.writes[0].body.branchId, 1);
  assert.equal(state.writes[0].body.roleId, 8);
});
test("字典失败可重试并加载后续页，空字典与未知身份区分", async (t) => {
  const { page, state } = await fixture(t, { dictionaryFail: true });
  await page.getByRole("button", { name: "重试身份字典" }).waitFor();
  assert.match(await page.locator(".members-table").innerText(), /政治身份名称不可用/);
  state.dictionaryFail = false;
  await page.getByRole("button", { name: "重试身份字典" }).click();
  await eventually(() => state.requests.some((r) => r.path.includes("identities/page") && r.params.page === "2"));
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  await choose(page, page.getByTestId("identity-filter"), "正式党员");
});
test("关联选项失败可重试，不阻断保持关联的资料修改", async (t) => {
  const { page, state } = await fixture(t, { branchFail: true });
  await page.getByRole("button", { name: "重试关联选项" }).waitFor();
  const d = await edit(page);
  await field(d, "邮箱").fill("member@example.test");
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  state.branchFail = false;
  await page.getByRole("button", { name: "重试关联选项" }).click();
  await eventually(async () => (await page.getByRole("button", { name: "重试关联选项" }).count()) === 0);
});
test("详情和编辑旧响应不能覆盖新成员或重新打开新增", async (t) => {
  const { page, state } = await fixture(t);
  state.detailGate = delay();
  await page.locator(".members-table tbody tr").first().getByRole("button", { name: "查看", exact: true }).click();
  await page.getByRole("dialog", { name: "成员详情", exact: true }).locator(".el-dialog__headerbtn").click();
  await page.locator(".members-table tbody tr").nth(1).getByRole("button", { name: "查看", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "成员详情", exact: true });
  await detail.getByText("成员102", { exact: true }).waitFor();
  state.detailGate.resolve();
  await page.waitForTimeout(100);
  assert.equal(await detail.getByText("成员101", { exact: true }).count(), 0);
  await detail.locator(".el-dialog__headerbtn").click();
  state.detailGate = delay();
  const d = await edit(page);
  await d.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "新增成员" }).click();
  state.detailGate.resolve();
  const add = page.getByRole("dialog", { name: "新增成员", exact: true });
  await field(add, "姓名").fill("新增草稿");
  await page.waitForTimeout(100);
  assert.equal(await field(add, "姓名").inputValue(), "新增草稿");
});
test("查询乱序与模式切换不接受旧列表，导出固定已应用筛选", async (t) => {
  const { page, state } = await fixture(t);
  const gate = delay();
  state.pageGate = gate;
  await page.getByPlaceholder("姓名 / 用户名 / 学号 / 手机 / 邮箱").fill("旧查询");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  gate.resolve();
  await eventually(async () => !(await page.locator(".members-table").innerText()).includes("成员999"));
  await choose(page, page.getByTestId("identity-filter"), "正式党员");
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await eventually(() => state.requests.some((r) => r.path.endsWith("/export")));
  assert.deepEqual(state.requests.find((r) => r.path.endsWith("/export")).params, { status: "1" });
});
test("正常401刷新重放更新，保存双击只发一次逻辑操作", async (t) => {
  const { page, state } = await fixture(t, { refresh: true });
  const d = await edit(page);
  await d.getByRole("button", { name: "保存", exact: true }).dblclick();
  await eventually(() => state.writes.length >= 2);
  await page.waitForTimeout(100);
  assert.equal(state.writes.length, 2); // 一次原请求 + 请求层的一次重放
  assert.equal(state.requests.filter((r) => r.path === "/api/v1/auth/refresh").length, 1);
});
test("换号使旧导出和批量响应失效，即使角色相同", async (t) => {
  const { page, state } = await fixture(t);
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  state.gate = delay();
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await eventually(() => state.requests.some((r) => r.path.endsWith("/export")));
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: "super_admin", username: "other" });
  });
  state.gate.resolve();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.downloads.length), 0);
});
for (const [label, result, title] of [
  ["全成功", { total: 1, successCount: 1, failCount: 0, errors: [] }, "批量操作全部成功"],
  [
    "全部失败",
    { total: 1, successCount: 0, failCount: 1, errors: [{ id: 101, reason: "拒绝该成员" }] },
    "批量操作全部失败",
  ],
  ["异常计数", { total: 1, successCount: 2, failCount: 0, errors: [] }, "响应结构或计数异常"],
  [
    "错误ID",
    { total: 1, successCount: 0, failCount: 1, errors: [{ id: 999, reason: "错误ID" }] },
    "响应结构或计数异常",
  ],
])
  test(`批量${label}反馈准确`, async (t) => {
    const { page, state } = await fixture(t, { batchResult: result });
    await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
    await page.getByRole("button", { name: "批量启用", exact: true }).click();
    await page.getByRole("button", { name: "确定启用", exact: true }).click();
    await page.getByTestId("batch-report").getByText(title, { exact: false }).waitFor();
    assert.equal(state.writes.length, 1);
  });
test("空选择禁止请求，取消确认无写入，批量支部提交有效目标", async (t) => {
  const { page, state } = await fixture(t);
  assert.equal(await page.getByRole("button", { name: "批量启用", exact: true }).isDisabled(), true);
  await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
  await page.getByRole("button", { name: "批量停用", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(state.writes.length, 0);
  assert.equal(await page.getByRole("button", { name: "批量调整支部", exact: true }).isDisabled(), true);
  await choose(page, page.locator(".batch-actions .el-select"), "正常第一支部");
  await page.getByRole("button", { name: "批量调整支部", exact: true }).click();
  await page.getByRole("button", { name: "确定调整支部", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.deepEqual(state.writes[0], { path: "/api/v4/admin/users/batch/branch", body: { ids: [101], branchId: 1 } });
});
for (const count of [200, 201])
  test(`批量${count}条边界约束`, async (t) => {
    const { page, state } = await fixture(t, {
      rows: Array.from({ length: count }, (_, i) => member(i + 1)),
      batchResult: { total: count, successCount: count, failCount: 0, errors: [] },
    });
    await page.locator(".members-table thead .el-checkbox").click();
    await page.getByRole("button", { name: "批量启用", exact: true }).click();
    if (count === 200) {
      await page.getByRole("button", { name: "确定启用", exact: true }).click();
      await eventually(() => state.writes.length === 1);
      assert.equal(state.writes[0].body.ids.length, 200);
    } else {
      await page.getByText("请选择 1–200 名当前页成员", { exact: true }).waitFor();
      assert.equal(state.writes.length, 0);
    }
  });
test("批量ID去重，筛选与翻页清空选择", async (t) => {
  const { page, state } = await fixture(t, { rows: [member(), member()], total: 30 });
  await page.locator(".members-table thead .el-checkbox").click();
  await page.getByRole("button", { name: "批量启用", exact: true }).click();
  await page.getByRole("button", { name: "确定启用", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.deepEqual(state.writes[0].body.ids, [101]);
  await page.locator(".members-table thead .el-checkbox").click();
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "批量启用", exact: true }).isDisabled(), true);
  await eventually(async () => !(await page.locator(".el-loading-mask").count()));
  await page.locator(".members-table thead .el-checkbox").click();
  await page.locator(".el-pagination .btn-next").click();
  assert.equal(await page.getByRole("button", { name: "批量启用", exact: true }).isDisabled(), true);
});
for (const cause of ["abort", "reject"])
  test(`批量${cause}不自动重传且保留结果未知提示`, async (t) => {
    const { page, state } = await fixture(t, { [cause]: true });
    await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
    await page.getByRole("button", { name: "批量启用", exact: true }).click();
    await page.getByRole("button", { name: "确定启用", exact: true }).click();
    await page
      .getByTestId("batch-report")
      .getByText(/不会自动重试/)
      .waitFor();
    assert.equal(state.writes.length, 1);
  });
test("角色映射对所有未知字符串回退最低权限", async (t) => {
  const { page } = await fixture(t);
  const result = await page.evaluate(async () => {
    const { roleFromBackend } = await import("/src/config/permissions.ts");
    return ["super_admin", "branch_admin", "student", "unknown", "__proto__", "constructor"].map(roleFromBackend);
  });
  assert.deepEqual(result, [
    "super_admin",
    "party_secretary",
    "party_member",
    "party_member",
    "party_member",
    "party_member",
  ]);
});

for (const [backend, frontend] of [
  ["super_admin", "super_admin"],
  ["branch_admin", "party_secretary"],
  ["student", "party_member"],
  ["unknown", "party_member"],
])
  test(`真实登录页面按响应${backend}处理并恢复会话，不按superadmin用户名提权`, async (t) => {
    const { page, state } = await fixture(t, { loginRole: backend });
    await page.goto(`${baseURL}/login`);
    await page.getByText("密码登录", { exact: true }).click();
    await page.getByPlaceholder("请输入手机号 / 工号").fill("superadmin");
    await page.getByPlaceholder("请输入密码", { exact: true }).fill("test-only-password");
    await page.getByRole("button", { name: "登 录", exact: true }).click();
    await eventually(
      async () =>
        (await page.evaluate(() => JSON.parse(localStorage.getItem("party_user_session"))?.role)) === frontend,
    );
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("party_user_session")).role), frontend);
    if (frontend !== "super_admin") {
      const before = state.requests.filter((r) => r.path.startsWith("/api/v4/admin/users")).length;
      await page.goto(`${baseURL}/members`);
      await page.waitForTimeout(200);
      assert.equal(await page.locator(".members-table").count(), 0);
      assert.equal(state.requests.filter((r) => r.path.startsWith("/api/v4/admin/users")).length, before);
    }
  });
test("登录防重并拒绝覆盖请求期间已切换的会话", async (t) => {
  const { page, state } = await fixture(t);
  state.loginGate = delay();
  await page.goto(`${baseURL}/login`);
  await page.getByText("密码登录", { exact: true }).click();
  await page.getByPlaceholder("请输入手机号 / 工号").fill("superadmin");
  await page.getByPlaceholder("请输入密码", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "登 录", exact: true }).dblclick();
  await eventually(() => state.logins > 0);
  await page.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: "super_admin", username: "other" });
  });
  state.loginGate.resolve();
  await page.waitForTimeout(200);
  assert.equal(state.logins, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("party_access_token")), "other");
});

test("JSON错误即使被标为二进制也不得下载成xlsx", async (t) => {
  const { page, state } = await fixture(t, { exportError: true, exportMime: "application/octet-stream" });
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await page.getByText("导出未完成：导出失败", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.downloads.length), 0);
  state.exportError = false;
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await eventually(async () => (await page.evaluate(() => window.downloads.length)) === 1);
});
test("保存进行中不能取消或关闭而误以为撤销，响应后回读列表", async (t) => {
  const { page, state } = await fixture(t);
  state.gate = delay();
  const d = await edit(page);
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal(await d.getByRole("button", { name: "取消", exact: true }).isDisabled(), true);
  assert.equal(await d.locator(".el-dialog__headerbtn").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(await d.isVisible(), true);
  state.gate.resolve();
  await d.waitFor({ state: "hidden" });
  await eventually(() => state.requests.filter((r) => r.path === "/api/v4/admin/users/page").length === 2);
});
test("空字典明确展示，身份空值和未知ID不冒充普通成员身份", async (t) => {
  const { page } = await fixture(t, {
    dictionaryEmpty: true,
    rows: [
      { ...member(), identityId: null, identityName: null },
      { ...member(102), identityId: 999, identityName: null },
    ],
  });
  await page.getByText("暂无政治身份字典", { exact: true }).waitFor();
  const text = await page.locator(".members-table").innerText();
  assert.match(text, /未登记/);
  assert.match(text, /政治身份名称不可用/);
});

test("管理员关键词与支部组合存在后端绕过缺陷，前端不发送错误组合", async (t) => {
  const { page, state } = await fixture(t);
  await choose(page, page.locator(".filters .el-select").nth(1), "正常第一支部");
  await page.getByPlaceholder("姓名 / 用户名 / 学号 / 手机 / 邮箱").fill("user101");
  const before = state.requests.filter((r) => r.path === "/api/v4/admin/users/page").length;
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page
    .getByText(/关键词与支部暂不支持组合查询/)
    .first()
    .waitFor();
  assert.equal(state.requests.filter((r) => r.path === "/api/v4/admin/users/page").length, before);
});
test("角色加载失败可保持缺失原关联，重试后合法替换", async (t) => {
  const { page, state } = await fixture(t, { roleFail: true, rows: [{ ...member(), roleId: 99, role: "legacy" }] });
  await page.getByRole("button", { name: "重试关联选项" }).waitFor();
  const d = await edit(page);
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal("roleId" in state.writes[0].body, false);
  state.roleFail = false;
  await page.getByRole("button", { name: "重试关联选项" }).click();
  await eventually(async () => (await page.getByRole("button", { name: "重试关联选项" }).count()) === 0);
  const again = await edit(page);
  await choose(page, again.locator(".el-form-item").filter({ hasText: /^角色/ }).locator(".el-select"), "普通成员");
  await again.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 2);
  assert.equal(state.writes[1].body.roleId, 7);
});
test("批量等待期间重复点击无第二次请求，跨标签页换号清理结果和选择", async (t) => {
  const { page, state, context } = await fixture(t);
  state.gate = delay();
  await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
  await page.getByRole("button", { name: "批量启用", exact: true }).click();
  await page.getByRole("button", { name: "确定启用", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  await page.getByRole("button", { name: "批量启用", exact: true }).dispatchEvent("click");
  assert.equal(state.writes.length, 1);
  const other = await context.newPage();
  await other.goto(`${baseURL}/members`);
  await other.evaluate(async () => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "tab-other", refreshToken: "tab-refresh", role: "super_admin", username: "other" });
  });
  state.gate.resolve();
  await page.waitForTimeout(200);
  assert.equal(await page.getByTestId("batch-report").count(), 0);
  assert.equal(await page.getByRole("button", { name: "批量启用", exact: true }).isDisabled(), true);
});
test("超时结果未确认且不自动重传", async (t) => {
  const { page, state } = await fixture(t);
  const gate = delay();
  state.gate = gate;
  t.after(() => gate.resolve());
  await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
  await page.getByRole("button", { name: "批量停用", exact: true }).click();
  await page.getByRole("button", { name: "确定停用", exact: true }).click();
  await page
    .getByTestId("batch-report")
    .getByText(/可能已有项目生效/)
    .waitFor({ timeout: 20000 });
  assert.equal(state.writes.length, 1);
});
test("390px表单按钮可达，筛选及长错误换行，键盘可执行保存", async (t) => {
  const { page, state } = await fixture(t, {
    viewport: { width: 390, height: 780 },
    batchResult: {
      total: 1,
      successCount: 0,
      failCount: 1,
      errors: [{ id: 101, reason: "很长的服务端错误原因".repeat(30) }],
    },
  });
  await page.getByRole("button", { name: "新增成员" }).click();
  const d = page.getByRole("dialog", { name: "新增成员", exact: true });
  const box = await d.getByRole("button", { name: "保存", exact: true }).boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 780);
  await d.getByRole("button", { name: "保存", exact: true }).focus();
  await page.keyboard.press("Enter");
  await d.getByText("请输入姓名", { exact: true }).waitFor();
  assert.equal(state.writes.length, 0);
  await mkdir(".cache/issue-19-review", { recursive: true });
  await page.waitForTimeout(350); // 截图等待 Element Plus 弹窗过渡结束。
  await page.screenshot({ path: ".cache/issue-19-review/mobile-form.png" });
  await d.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator(".members-table tbody tr").first().locator(".el-checkbox").click();
  await page.getByRole("button", { name: "批量停用", exact: true }).click();
  await page.getByRole("button", { name: "确定停用", exact: true }).click();
  await page.getByTestId("batch-report").waitFor();
  await page.waitForTimeout(350);
  await page.getByTestId("batch-report").scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: ".cache/issue-19-review/mobile-result.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: ".cache/issue-19-review/desktop.png", fullPage: true });
});
test("空基础字段不阻断更新，支部未分配和名称不可用准确区分", async (t) => {
  const { page, state } = await fixture(t, {
    rows: [
      { ...member(), realName: null, studentId: null },
      { ...member(102), branchId: 99, branchName: null },
    ],
  });
  assert.match(await page.locator(".members-table").innerText(), /未分配/);
  assert.match(await page.locator(".members-table").innerText(), /支部名称不可用/);
  const d = await edit(page);
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
});
test("新增仍校验姓名学号并发送基础资料", async (t) => {
  const { page, state } = await fixture(t);
  await page.getByRole("button", { name: "新增成员" }).click();
  const d = page.getByRole("dialog", { name: "新增成员", exact: true });
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await d.getByText("请输入姓名", { exact: true }).waitFor();
  assert.equal(state.writes.length, 0);
  for (const [label, value] of [
    ["登录账号", "new1"],
    ["姓名", "新成员"],
    ["学号", "2024001"],
  ])
    await field(d, label).fill(value);
  await d.getByRole("button", { name: "保存", exact: true }).click();
  await eventually(() => state.writes.length === 1);
  assert.equal(state.writes[0].body.studentId, "2024001");
});
test("身份查询完整加载多页字典且禁止关键词组合，保持服务端 total", async (t) => {
  const { page, state } = await fixture(t, { total: 33 });
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  await choose(page, page.getByTestId("identity-filter"), "正式党员");
  assert.equal(await page.getByPlaceholder("姓名 / 用户名 / 学号 / 手机 / 邮箱").isDisabled(), true);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await eventually(() => state.requests.some((r) => r.path === "/api/v4/members/page" && r.params.identityId === "4"));
  const last = state.requests.filter((r) => r.path === "/api/v4/members/page").at(-1);
  assert.equal(last.params.status, "1");
  assert.equal(last.params.keyword, undefined);
  assert.match(await page.locator(".total-label").innerText(), /33/);
});
test("导出使用已应用条件，禁止管理查询静默扩大范围，JSON 不下载", async (t) => {
  const { page, state } = await fixture(t);
  assert.equal(await page.getByRole("button", { name: "导出成员", exact: true }).isDisabled(), true);
  await choose(page, page.getByTestId("query-mode"), "政治身份查询（可导出）");
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await eventually(async () => (await page.evaluate(() => window.downloads.length)) === 1);
  assert.deepEqual(state.requests.find((r) => r.path.endsWith("/export")).params, { status: "1" });
  state.exportError = true;
  await page.getByRole("button", { name: "导出成员", exact: true }).click();
  await page.getByText("导出失败", { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.downloads.length), 1);
});
test("批量部分成功按成员 ID 报告，回读失败保留报告并防重", async (t) => {
  const { page, state } = await fixture(t, {
    batchResult: { total: 2, successCount: 1, failCount: 1, errors: [{ id: 102, reason: "服务端拒绝" }] },
  });
  await page.locator(".members-table thead .el-checkbox").click();
  await page.getByRole("button", { name: "批量停用", exact: true }).click();
  state.pageFail = true;
  await page.getByRole("button", { name: "确定停用", exact: true }).click();
  await page.getByTestId("batch-report").getByText("服务端拒绝", { exact: false }).waitFor();
  assert.deepEqual(state.writes[0].body, { ids: [101, 102], status: 2 });
  assert.equal(state.writes.length, 1);
  assert.match(await page.getByTestId("batch-report").innerText(), /102/);
  assert.match(await page.getByTestId("batch-report").innerText(), /不会整体回滚/);
});
