import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 个人中心（本人资料查询 + 联系方式编辑）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 只读字段齐全且无输入控件、政治身份/所属支部/身份证号的确定兜底、
 * 编辑抽屉只含 4 个可编辑字段、只提交实际变化字段、无变化不发请求、
 * 有值改空串时字段级提示且零请求（4 字段全覆盖）、与后端一致的校验、
 * 保存成功以重新 GET 回读为准、保存失败保留输入并展示服务端原因、
 * 回读失败与保存失败分开提示、双击只提交一次、换号后旧响应不写回、
 * 无令牌预览态零业务请求、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/profile-edit-${process.pid}`,
    server: { host: "127.0.0.1", port: 5201, strictPort: false },
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

/** 字段与后端 UserProfileVo 对齐；可空字段默认 null，便于验证兜底口径。 */
const profile = (overrides = {}) => ({
  id: 12,
  username: "2023010101",
  status: 1,
  realName: "张同学",
  studentId: "2023010101",
  identityCardNumber: "510101200001010011",
  gender: "女",
  college: "马克思主义学院",
  grade: "2023",
  major: "思想政治教育",
  className: "思政2301",
  contactPerson: "张父 13800000000",
  remark: "需要跟进",
  branchId: 3,
  branchName: "本科生第一党支部",
  identityId: 2,
  identityName: "积极分子",
  phone: "13800138000",
  email: "zhang@example.com",
  ...overrides,
});

/** 允许出现的业务请求：本人资料端点与令牌刷新。 */
const ALLOWED_PATHS = new Set(["/api/v4/user/profile", "/api/v1/auth/refresh"]);

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
        localStorage.setItem("party_user_session", JSON.stringify({ name: "成员", avatar: "", role }));
        return;
      }
      // 无令牌的开发预览态：身份由预览角色决定，不能再依赖登录会话。
      if (previewRole) localStorage.setItem("party_dev_preview_role", previewRole);
    },
    { role: options.role || "party_member", withToken: options.withToken !== false, previewRole: options.previewRole },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  const state = {
    requests: [],
    profile: profile(),
    getCalls: 0,
    getFail: 0,
    putCalls: 0,
    putBodies: [],
    putFail: false,
    putBusinessFail: false,
    freezeFirstGet: false,
    firstGate: null,
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
    state.requests.push({ path, method: req.method(), search: url.search });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "student", username: "me" });
    if (req.method() === "PUT") {
      state.putCalls++;
      state.putBodies.push(req.postDataJSON());
      if (state.putBusinessFail) return route.fulfill({ json: { code: 400, message: "手机号格式不正确" } });
      if (state.putFail) return route.fulfill({ status: 500, json: { code: 500, message: "服务暂时不可用" } });
      return ok(route, null);
    }
    // 本人资料端点：不接受任何查询参数，服务端按登录态决定查询对象。
    state.getCalls++;
    const call = state.getCalls;
    if (state.freezeFirstGet && call === 1) {
      const body = state.profile;
      await state.firstGate.promise;
      return ok(route, body);
    }
    if (state.getFail > 0) {
      state.getFail--;
      return route.fulfill({ status: 500, json: { code: 500, message: "资料服务暂时不可用" } });
    }
    return ok(route, state.profile);
  });
  await page.goto(`${baseURL}${options.path || "/profile"}`);
  return { page, state, context };
}

const gets = (state) => state.requests.filter((r) => r.path === "/api/v4/user/profile" && r.method === "GET");

async function switchAccount(page, role = "party_member") {
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

async function openDrawer(page) {
  await eventually(async () => (await page.getByTestId("profile-edit-open").count()) === 1);
  await page.getByTestId("profile-edit-open").click();
  await eventually(async () => (await page.getByTestId("profile-edit-form").isVisible()) === true);
}

const drawerInput = (page, key) => page.getByTestId(`profile-edit-${key}`);
const submitButton = (page) => page.getByTestId("profile-edit-submit");
const fieldError = (page, key) =>
  page.locator(`.el-form-item:has([data-testid="profile-edit-${key}"]) .el-form-item__error`);

test("只读字段渲染齐全，政治身份与支部按既有口径兜底", async (t) => {
  const { page, state } = await fixture(t, {
    state: {
      profile: profile({
        identityName: null,
        branchName: null,
        identityCardNumber: null,
        gender: null,
        contactPerson: "张父 13800000000",
        remark: "需要跟进",
      }),
    },
  });
  await eventually(async () => (await page.getByTestId("profile-readonly").count()) === 1);
  const readonly = page.getByTestId("profile-readonly");
  const text = await readonly.innerText();
  // 本次补全的字段必须真实渲染出来，而不是只存在于类型声明。
  assert.match(text, /政治身份/);
  assert.match(text, /性别/);
  assert.match(text, /身份证号/);
  assert.match(text, /张同学/);
  assert.match(text, /2023010101/);
  assert.match(text, /本科生第一党支部|未分配支部/);
  assert.equal(await page.getByTestId("profile-value-identityName").innerText(), "未登记");
  assert.equal(await page.getByTestId("profile-value-branchName").innerText(), "未分配支部");
  assert.equal(await page.getByTestId("profile-value-identityCardNumber").innerText(), "未填写");
  assert.equal(await page.getByTestId("profile-value-gender").innerText(), "未登记");
  // 可编辑字段在只读卡片可见，不需要打开抽屉就能看到当前值。
  assert.equal(await page.getByTestId("profile-value-contactPerson").innerText(), "张父 13800000000");
  assert.equal(await page.getByTestId("profile-value-remark").innerText(), "需要跟进");
  await page.waitForTimeout(200);
  assert.equal(state.getCalls, 1);
  assert.equal(gets(state)[0].search, "", "本人资料端点不得携带查询参数");
});

test("只读区没有任何输入控件，政治身份与支部不可编辑", async (t) => {
  const { page } = await fixture(t);
  await eventually(async () => (await page.getByTestId("profile-readonly").count()) === 1);
  const readonly = page.getByTestId("profile-readonly");
  for (const selector of ["input", "textarea", "select"]) {
    assert.equal(await readonly.locator(selector).count(), 0, `只读区不应出现 ${selector}`);
  }
  // 政治身份、姓名、学号等不给任何编辑入口：连 data-testid 形式的编辑控件都不存在。
  for (const key of ["identityName", "realName", "studentId", "college", "branchName"]) {
    assert.equal(await page.getByTestId(`profile-edit-${key}`).count(), 0);
  }
  assert.equal(await page.getByTestId("profile-edit-identityName").count(), 0);
  await openDrawer(page);
  assert.equal(await page.getByTestId("profile-edit-identityName").count(), 0);
  assert.equal(await page.getByTestId("profile-edit-realName").count(), 0);
  // 文案不得再笼统声称所有资料都需要联系管理员。
  const heading = await page.locator(".page-heading").innerText();
  assert.doesNotMatch(heading, /资料有误请联系管理员/);
  assert.match(await page.locator(".section-heading").first().innerText(), /可自行修改/);
});

test("编辑抽屉只含 4 个可输入控件", async (t) => {
  const { page } = await fixture(t);
  await openDrawer(page);
  const controls = page.locator('[data-testid="profile-edit-form"] input, [data-testid="profile-edit-form"] textarea');
  assert.equal(await controls.count(), 4);
  for (const key of ["phone", "email", "contactPerson", "remark"]) {
    assert.equal(await drawerInput(page, key).count(), 1, `${key} 应存在`);
    assert.equal(await drawerInput(page, key).isEditable(), true, `${key} 应可编辑`);
  }
  // 打开即用当前资料预填。
  assert.equal(await drawerInput(page, "phone").inputValue(), "13800138000");
  assert.equal(await drawerInput(page, "email").inputValue(), "zhang@example.com");
});

test("无任何变化时保存按钮禁用且零请求", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  assert.equal(await submitButton(page).isDisabled(), true);
  // 手工点击也不得发出请求。
  await submitButton(page).click({ force: true });
  await page.waitForTimeout(250);
  assert.equal(state.putCalls, 0);
});

test("只改手机号时请求体精确为 { phone }", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "phone").fill("13900139000");
  assert.equal(await submitButton(page).isDisabled(), false);
  await submitButton(page).click();
  await eventually(() => state.putCalls === 1);
  assert.deepEqual(state.putBodies[0], { phone: "13900139000" });
  // 未编辑的字段绝不出现在请求体里，否则会覆盖管理侧同时修改的内容。
  assert.equal(state.putBodies[0].email, undefined);
  assert.equal(state.putBodies[0].contactPerson, undefined);
  assert.equal(state.putBodies[0].remark, undefined);
  // 只提交一次 PUT，且不带用户标识参数。
  const puts = state.requests.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].search, "");
});

test("手机号由有值改空串：字段级提示且零请求", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "phone").fill("");
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "phone").count()) === 1);
  assert.match(await fieldError(page, "phone").innerText(), /不支持清空手机号/);
  await eventually(async () => (await page.locator(".el-message").count()) > 0);
  assert.match(await page.locator(".el-message").first().innerText(), /不支持清空|未提交/);
  await page.waitForTimeout(250);
  assert.equal(state.putCalls, 0, "清空意图不得发出请求");
  // 抽屉不关闭，用户填的内容仍在。
  assert.equal(await drawerInput(page, "phone").inputValue(), "");
});

test("邮箱、紧急联系人、备注由有值改空串同样被拦截且零请求", async (t) => {
  for (const [key, label] of [
    ["email", "电子邮箱"],
    ["contactPerson", "紧急联系人"],
    ["remark", "备注"],
  ]) {
    const { page, state } = await fixture(t);
    await openDrawer(page);
    await drawerInput(page, key).fill("");
    await submitButton(page).click();
    await eventually(async () => (await fieldError(page, key).count()) === 1, key);
    assert.match(await fieldError(page, key).innerText(), new RegExp(`不支持清空${label}`), key);
    await page.waitForTimeout(250);
    assert.equal(state.putCalls, 0, `${key} 清空不得发请求`);
  }
});

test("原本就为空的字段保持为空不算清空，可与其他修改一起提交", async (t) => {
  const { page, state } = await fixture(t, { state: { profile: profile({ phone: null, email: null }) } });
  await openDrawer(page);
  await drawerInput(page, "remark").fill("改后的备注");
  await submitButton(page).click();
  await eventually(() => state.putCalls === 1);
  assert.deepEqual(state.putBodies[0], { remark: "改后的备注" });
});

test("手机号格式非法零请求并定位字段", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "phone").fill("12345");
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "phone").count()) === 1);
  assert.match(await fieldError(page, "phone").innerText(), /手机号格式不正确/);
  await page.waitForTimeout(250);
  assert.equal(state.putCalls, 0);
});

test("邮箱超 25 字与格式非法零请求并定位字段", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "email").fill("a".repeat(20) + "@example.com");
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "email").count()) === 1);
  assert.match(await fieldError(page, "email").innerText(), /邮箱长度不能超过 25/);
  await drawerInput(page, "email").fill("not-an-email");
  await submitButton(page).click();
  await eventually(async () => /邮箱格式不正确/.test(await fieldError(page, "email").innerText()));
  await page.waitForTimeout(250);
  assert.equal(state.putCalls, 0);
});

test("备注超 500 字与紧急联系人超 50 字零请求", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "remark").fill("备".repeat(501));
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "remark").count()) === 1);
  assert.match(await fieldError(page, "remark").innerText(), /备注长度不能超过 500/);
  await drawerInput(page, "remark").fill("正常备注");
  await drawerInput(page, "contactPerson").fill("张".repeat(51));
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "contactPerson").count()) === 1);
  assert.match(await fieldError(page, "contactPerson").innerText(), /紧急联系人长度不能超过 50/);
  await page.waitForTimeout(250);
  assert.equal(state.putCalls, 0);
});

test("保存成功后重新 GET 回读，页面值以回读为准", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "phone").fill("13900139000");
  // 服务端回读值与请求值不同：页面必须展示回读结果，不能本地改写成本地输入。
  state.profile = profile({ phone: "13700137000", email: "server@example.com" });
  await submitButton(page).click();
  await eventually(() => state.getCalls === 2);
  await eventually(async () => (await page.getByTestId("profile-value-phone").innerText()) === "13700137000");
  assert.equal(await page.getByTestId("profile-value-phone").innerText(), "13700137000");
  assert.equal(await page.getByTestId("profile-value-email").innerText(), "server@example.com");
  assert.equal(await page.getByTestId("profile-value-phone").count(), 1);
  // 保存成功后关闭抽屉，让用户看到回读后的页面值（抽屉保留在 DOM 中但不可见）。
  await eventually(
    async () =>
      (await page
        .getByTestId("profile-edit-form")
        .isVisible()
        .catch(() => false)) === false,
  );
  assert.match(await page.locator(".el-message").last().innerText(), /联系方式已保存/);
});

test("保存失败保留已填内容并展示服务端原因", async (t) => {
  const { page, state } = await fixture(t, { state: { putFail: true } });
  await openDrawer(page);
  await drawerInput(page, "phone").fill("13900139000");
  await drawerInput(page, "remark").fill("待审批备注");
  await submitButton(page).click();
  await eventually(async () => (await page.locator(".el-message").count()) > 0);
  const messages = await page.locator(".el-message").allInnerTexts();
  assert.ok(
    messages.some((text) => /服务暂时不可用/.test(text)),
    JSON.stringify(messages),
  );
  // 失败后抽屉保持打开，输入内容不丢。
  assert.equal(await drawerInput(page, "phone").inputValue(), "13900139000");
  assert.equal(await drawerInput(page, "remark").inputValue(), "待审批备注");
  assert.equal(state.putCalls, 1);
  // 页面展示值仍是服务端上一次的资料，不做本地改写。
  assert.equal(await page.getByTestId("profile-value-phone").innerText(), "13800138000");
});

test("业务码 400 的保存失败同样展示服务端 message", async (t) => {
  const { page, state } = await fixture(t, { state: { putBusinessFail: true } });
  await openDrawer(page);
  await drawerInput(page, "phone").fill("13900139000");
  await submitButton(page).click();
  await eventually(async () => (await page.locator(".el-message").count()) > 0);
  const messages = await page.locator(".el-message").allInnerTexts();
  assert.ok(
    messages.some((text) => /手机号格式不正确/.test(text)),
    JSON.stringify(messages),
  );
  assert.equal(state.putCalls, 1);
  assert.equal(await drawerInput(page, "phone").inputValue(), "13900139000");
});

test("保存成功但回读失败：两条不同提示，不把回读失败说成保存失败", async (t) => {
  const { page, state } = await fixture(t, { state: { getFail: 0 } });
  await openDrawer(page);
  await drawerInput(page, "email").fill("new@example.com");
  // PUT 成功之后的下一次 GET 才失败。
  state.getFail = 1;
  await submitButton(page).click();
  await eventually(async () => (await page.locator(".el-message").count()) >= 2);
  const messages = await page.locator(".el-message").allInnerTexts();
  assert.ok(
    messages.some((text) => /联系方式已保存/.test(text)),
    JSON.stringify(messages),
  );
  assert.ok(
    messages.some((text) => /保存成功，但重新读取本人资料失败/.test(text)),
    JSON.stringify(messages),
  );
  // 回读失败不得被表述为保存失败。
  assert.ok(!messages.some((text) => /^联系方式保存失败|保存失败，请稍后重试$/.test(text)), JSON.stringify(messages));
  assert.equal(state.putCalls, 1);
  assert.equal(state.getCalls, 2);
});

test("双击保存只发一次 PUT", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  await drawerInput(page, "phone").fill("13900139000");
  // 同一事件循环内连点两次，验证 submitting 同步置位。
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="profile-edit-submit"]');
    button.click();
    button.click();
  });
  await eventually(() => state.putCalls >= 1);
  await page.waitForTimeout(400);
  assert.equal(state.putCalls, 1, "双击不得产生第二次提交");
  await eventually(() => state.getCalls === 2);
});

test("清空一个字段同时改另一个字段时整单不提交", async (t) => {
  const { page, state } = await fixture(t);
  await openDrawer(page);
  // 合法变化 + 被拦截的清空并存：接口无法表达清空，因此整单不发，避免只写入一半。
  await drawerInput(page, "phone").fill("");
  await drawerInput(page, "remark").fill("只提交一半是错的");
  await submitButton(page).click();
  await eventually(async () => (await fieldError(page, "phone").count()) === 1);
  await page.waitForTimeout(300);
  assert.equal(state.putCalls, 0, JSON.stringify(state.requests.filter((r) => r.method === "PUT")));
  assert.equal(await drawerInput(page, "remark").inputValue(), "只提交一半是错的");
});

test("退出登录后立即清除已渲染资料并停止请求", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirstGet: true, firstGate: gate } });
  await eventually(() => state.getCalls === 1);
  await signOut(page);
  // 退出后不得残留上一账号的姓名、手机号等个人信息。
  await eventually(async () => (await page.getByText("张同学").count()) === 0);
  await eventually(async () => (await page.getByTestId("profile-readonly").count()) === 0);
  await eventually(async () => (await page.getByTestId("profile-login-tip").count()) === 1);
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("张同学").count(), 0);
  assert.equal(await page.getByTestId("profile-editable").count(), 0);
  assert.equal(state.getCalls, 1, "退出后不得再拉取资料");
});

test("离开页面后重新进入会自己重新拉取，在途旧响应不覆盖新实例", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirstGet: true, firstGate: gate } });
  await eventually(() => state.getCalls === 1);
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    // /resources 是未接接口的占位页，用它验证卸载而不引入其它业务请求。
    await router.push("/resources");
  });
  await eventually(async () => new URL(page.url()).pathname === "/resources");
  state.freezeFirstGet = false;
  state.profile = profile({ realName: "重新进入成员", phone: "13500135000" });
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/profile");
  });
  await eventually(async () => (await page.getByText("重新进入成员").count()) === 1);
  assert.equal(state.getCalls, 2, "重新进入必须重新拉取资料");
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("profile-value-phone").innerText(), "13500135000");
  assert.equal(await page.getByText("张同学").count(), 0);
});

test("换号后旧会话的迟到响应不写回", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirstGet: true, firstGate: gate } });
  await eventually(() => state.getCalls === 1);
  // 新会话使用不同姓名，便于区分写回来源。
  state.profile = profile({ realName: "新会话成员", phone: "13600136000", remark: "新会话备注" });
  await switchAccount(page);
  await eventually(async () => (await page.getByTestId("profile-value-phone").innerText()) === "13600136000");
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("profile-value-realName").innerText(), "新会话成员");
  assert.equal(await page.getByTestId("profile-value-phone").innerText(), "13600136000");
  assert.equal(await page.getByTestId("profile-error").count(), 0);
});

test("无令牌的开发预览态渲染登录提示且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { withToken: false, previewRole: "party_member" });
  await eventually(async () => (await page.getByTestId("profile-login-tip").count()) === 1);
  assert.match(await page.getByTestId("profile-login-tip").innerText(), /个人中心需要登录/);
  assert.match(await page.getByTestId("profile-login-tip").innerText(), /不会请求真实个人资料/);
  await page.waitForTimeout(300);
  assert.equal(state.getCalls, 0, JSON.stringify(state.requests));
  assert.equal(state.putCalls, 0);
  assert.equal(await page.getByTestId("profile-readonly").count(), 0);
  assert.equal(await page.getByTestId("profile-edit-open").count(), 0);
});

test("390px 窄屏不出现整页横向溢出", async (t) => {
  const { page, state } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await eventually(async () => (await page.getByTestId("profile-readonly").count()) === 1);
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  const box = await page.getByTestId("profile-editable").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= overflow.clientWidth + 1, JSON.stringify(box));
  // 抽屉打开后也不得撑出横向滚动。
  await openDrawer(page);
  await page.waitForTimeout(400);
  const drawerOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    drawerOverflow.scrollWidth <= drawerOverflow.clientWidth + 1,
    `drawer scrollWidth=${drawerOverflow.scrollWidth} clientWidth=${drawerOverflow.clientWidth}`,
  );
  assert.equal(state.getCalls, 1);
});
