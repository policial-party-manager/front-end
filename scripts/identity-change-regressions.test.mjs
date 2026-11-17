import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 政治身份变更（发起 + 超管审批）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 身份字典分页拉全并按 level 排序、发起请求体精确为 `{ userId, toIdentity, reason }`（无 `fromIdentity`）、
 * 原因超 500 字前端拦截且零请求、二次确认展示「当前身份 → 目标身份」（未登记不显示 null）、
 * 服务端 400 原文（含「该用户已有待审批的身份变更单」）可见且不误报成功、
 * 发起成功后不刷新档案也不本地改写身份名、双击只提交一次、
 * 审批页默认 `status=1`、切「已生效」精确发送 `status=2`、`total` 取服务端值、
 * 审批后重拉当前页并保持筛选与页码、已处理单按钮禁用、
 * 超管可见通过/驳回而支委不可见、支委视图不发送 `status`/`userId`、
 * 越权读单原样显示「变更单不存在」、未知状态显示「未知状态（x）」、
 * 换号/退出/离页后迟到响应不写回、无令牌预览零业务请求、普通成员被守卫拦截、
 * 身份变更生效后前端角色与导航不变、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/identity-change-${process.pid}`,
    server: { host: "127.0.0.1", port: 5202, strictPort: false },
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
const fail = (route, status, message) => route.fulfill({ status, json: { code: status, message } });
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

/** 管理侧档案 `basic` 走 `buildVos`：只写 `branchId`/`identityId`，`identityName` 恒为 null。 */
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

const profile = (overrides = {}) => ({
  basic: basic(),
  mentors: [],
  identityChanges: [],
  thoughtReports: [],
  signRecords: [],
  leaves: [],
  studyRecords: [],
  materials: [],
  summary: { thoughtReportCount: 0, thoughtReportApproved: 0, signCount: 0, studyMinutes: 0, materialCount: 0 },
  ...overrides,
});

/** 身份字典默认样本：id 顺序与 level 顺序故意不同，便于验证「按 level 排序」。 */
const IDENTITIES = [
  { id: 6, identityName: "中共正式党员", level: 6 },
  { id: 2, identityName: "入党积极分子", level: 2 },
  { id: 3, identityName: "发展对象", level: 3 },
];

/** 变更单样本；`statusName` 仅供参考，展示层一律用前端独立映射。 */
const change = (id, overrides = {}) => ({
  id,
  userId: 12,
  userName: "张同学",
  fromIdentity: null,
  fromIdentityName: null,
  toIdentity: 2,
  toIdentityName: "入党积极分子",
  operatorId: 2,
  operatorName: "李支委",
  reason: "支部大会讨论通过",
  status: 1,
  statusName: "待审批",
  reviewerId: null,
  reviewerName: null,
  reviewTime: null,
  reviewRemark: null,
  createTime: "2026-11-01T09:00:00",
  ...overrides,
});

const PROFILE_ENTRY = /^\/api\/v4\/cultivation-profiles\/(\d+|me)$/;
const CHANGE_ENTRY = /^\/api\/v4\/identity-changes\/(\d+)$/;
const REVIEW_ENTRY = /^\/api\/v4\/identity-changes\/(\d+)\/review$/;

/** 允许出现的业务请求；白名单外的请求一律 abort 并计入 unexpected。 */
const ALLOWED_PATHS = new Set([
  "/api/v4/members/page",
  "/api/v2/content/identities/page",
  "/api/v4/identity-changes",
  "/api/v4/identity-changes/managed/page",
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
    /** 身份字典：默认可一页拉完；分页用例单独放大。 */
    identities: IDENTITIES,
    identitiesTotal: IDENTITIES.length,
    identitiesFail: false,
    identityCalls: 0,
    /** 冻结第 n 次字典响应的闸门，用于验证迟到响应。 */
    identityGates: {},
    /** 档案。 */
    profileById: {},
    defaultProfile: profile(),
    profileCalls: 0,
    profileError: null,
    /** 变更单列表。 */
    changes: [change(1)],
    changesTotal: 1,
    changesFail: false,
    changesError: null,
    changeCalls: 0,
    /** 冻结第 n 次列表响应的闸门，用于验证迟到响应。 */
    changeGates: {},
    /** 发起请求。 */
    applyCalls: [],
    applyError: null,
    /** 审批请求。 */
    reviewCalls: [],
    reviewError: null,
    /** 详情请求。 */
    detailError: null,
    ...options.state,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const isProfile = PROFILE_ENTRY.test(path);
    const isChange = CHANGE_ENTRY.test(path);
    const isReview = REVIEW_ENTRY.test(path);
    if (!ALLOWED_PATHS.has(path) && !isProfile && !isChange && !isReview) {
      unexpected.push(`${method} ${path}`);
      return route.abort();
    }
    const entry = { path, method, params: Object.fromEntries(url.searchParams), search: url.search };
    state.requests.push(entry);

    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "super_admin", username: "me" });
    if (path === "/api/v4/members/page") return ok(route, { records: [], total: 0 });

    if (path === "/api/v2/content/identities/page") {
      if (state.identitiesFail) return fail(route, 500, "身份字典暂时不可用");
      const pageNo = Number(url.searchParams.get("page") || 1);
      const size = Number(url.searchParams.get("size") || 10);
      state.identityCalls++;
      const gate = state.identityGates[state.identityCalls];
      const records = state.identities.slice((pageNo - 1) * size, pageNo * size);
      if (gate) await gate.promise;
      return ok(route, { records, total: state.identitiesTotal });
    }

    if (isProfile) {
      state.profileCalls++;
      if (state.profileError) return fail(route, state.profileError.status, state.profileError.message);
      const userId = path.split("/").at(-1);
      return ok(route, state.profileById[userId] ?? state.defaultProfile);
    }

    // 发起：只接受 POST 到集合地址。
    if (path === "/api/v4/identity-changes" && method === "POST") {
      state.applyCalls.push({ body: req.postDataJSON(), search: url.search, path });
      if (state.applyError) return fail(route, 400, state.applyError);
      return ok(route, change(99, { toIdentityName: "入党积极分子" }));
    }

    if (path === "/api/v4/identity-changes/managed/page") {
      const call = ++state.changeCalls;
      if (state.changesFail) return fail(route, 500, "变更单服务暂时不可用");
      if (state.changesError) return fail(route, state.changesError.status, state.changesError.message);
      // 先取快照再等闸门：迟到的响应必须是「当时」的数据，之后改 state 不能污染它，
      // 否则序号类用例会因为响应内容自动变新而假绿。
      const records = state.changes;
      const total = state.changesTotal;
      const gate = state.changeGates[call];
      if (gate) await gate.promise;
      return ok(route, { records, total });
    }

    if (isReview && method === "POST") {
      const id = Number(path.split("/").at(-2));
      state.reviewCalls.push({ id, body: req.postDataJSON() });
      if (state.reviewError) return fail(route, 400, state.reviewError);
      return ok(route, change(id, { status: 2 }));
    }

    if (isChange && method === "GET") {
      if (state.detailError) return fail(route, 400, state.detailError);
      const id = Number(path.split("/").at(-1));
      return ok(route, state.changes.find((row) => row.id === id) ?? change(id));
    }

    unexpected.push(`${method} ${path}`);
    return route.abort();
  });
  await page.goto(`${baseURL}${options.path || "/development/member/12"}`);
  return { page, state, context };
}

const section = (page, testId) => page.getByTestId(testId);
const applyRequests = (state) =>
  state.requests.filter((r) => r.path === "/api/v4/identity-changes" && r.method === "POST");
const reviewRequests = (state) => state.requests.filter((r) => REVIEW_ENTRY.test(r.path));
const listRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/identity-changes/managed/page");
const detailRequests = (state) => state.requests.filter((r) => CHANGE_ENTRY.test(r.path));
const identityRequests = (state) => state.requests.filter((r) => r.path === "/api/v2/content/identities/page");

async function waitProfile(page) {
  await eventually(async () => (await section(page, "dev-profile-basic").count()) === 1);
}

/** 打开发起弹窗并等字典就绪。 */
async function openDialog(page) {
  await waitProfile(page);
  await section(page, "identity-change-open").click();
  await eventually(async () => (await section(page, "identity-change-form").count()) === 1);
  await eventually(async () => (await section(page, "identity-change-target").locator("input").isDisabled()) === false);
}

/** 选目标身份：下拉项按 level 排序，这里按名称定位，避免依赖顺序。 */
async function pickIdentity(page, name) {
  await section(page, "identity-change-target").click();
  const option = page.locator(".el-select-dropdown__item", { hasText: name }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

async function waitMessageBox(page) {
  await eventually(async () => (await page.locator(".el-message-box").count()) > 0);
  return page.locator(".el-message-box");
}

/**
 * 双击同一个按钮：先摘掉 `disabled`（Element Plus 会把 loading/disabled 落到 DOM 上，
 * 光靠它无法证明代码层防重），再在同一事件循环内派发两次 click。
 * 这样第二次点击真的会进入处理函数，只有同步置位才能挡住它。
 */
async function doubleClickTestId(page, testId) {
  await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`);
    assertButtonClickable(button);
    button.click();
    button.click();
    function assertButtonClickable(element) {
      if (!element) throw new Error(`找不到按钮 ${id}`);
      element.removeAttribute("disabled");
      element.classList.remove("is-disabled");
    }
  }, testId);
}

async function waitRows(page) {
  await eventually(async () => (await section(page, "identity-review-table").count()) === 1);
}

async function waitReviewPage(page) {
  await eventually(async () => (await section(page, "identity-review").count()) === 1);
  await waitRows(page);
}

async function switchAccount(page, role = "super_admin") {
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

/** 读取 Pinia store 的当前角色与导航项，用于验证「身份变更不联动登录角色」。 */
async function readStore(page) {
  return page.evaluate(async () => {
    const app = document.querySelector("#app").__vue_app__;
    const pinia = app.config.globalProperties.$pinia;
    const { useAppStore } = await import("/src/stores/app.ts");
    const store = useAppStore(pinia);
    return {
      role: store.currentRole,
      nav: store.navItems.map((item) => item.label),
    };
  });
}

// ============================ 发起（档案页） ============================

test("身份字典分页拉全并按 level 排序，不硬编码身份名", async (t) => {
  // 250 条字典：level 与 id 反向，排序是否生效可直接观察。
  const many = Array.from({ length: 250 }, (_, index) => ({
    id: index + 1,
    identityName: `身份${String(index + 1).padStart(3, "0")}`,
    level: 250 - index,
  }));
  const { page, state } = await fixture(t, { state: { identities: many, identitiesTotal: 250 } });
  await openDialog(page);
  const calls = identityRequests(state);
  // 100 条一页：250 条必须翻满 3 页才算拉全。
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.params.page),
    ["1", "2", "3"],
  );
  for (const call of calls) assert.equal(call.params.size, "100");
  await section(page, "identity-change-target").click();
  const options = page.locator(".el-select-dropdown__item");
  await eventually(async () => (await options.count()) === 250);
  // level 升序：level=1 的那条是最后一条被拉到的「身份250」。
  assert.match(await options.first().innerText(), /身份250/);
  assert.match(await options.last().innerText(), /身份001/);
  await page.keyboard.press("Escape");
});

test("身份字典加载失败时禁用提交且不给本地兜底列表，可重试", async (t) => {
  const { page, state } = await fixture(t, { state: { identitiesFail: true } });
  await waitProfile(page);
  await section(page, "identity-change-open").click();
  await eventually(async () => (await section(page, "identity-change-dictionary-error").count()) === 1);
  assert.match(await section(page, "identity-change-dictionary-error").innerText(), /身份字典加载失败/);
  assert.match(await section(page, "identity-change-dictionary-error").innerText(), /不使用本地兜底身份列表/);
  // 失败时提交按钮必须不可用；也不能出现任何硬编码身份名。
  assert.equal(await section(page, "identity-change-submit").isDisabled(), true);
  const dialogText = await page.locator(".el-dialog").first().innerText();
  for (const name of ["积极分子", "发展对象", "预备党员", "正式党员", "入党申请人"])
    assert.doesNotMatch(dialogText, new RegExp(name), `不得出现硬编码身份名 ${name}`);
  // 重试按钮会重新拉字典。
  state.identitiesFail = false;
  await section(page, "identity-change-dictionary-retry").click();
  await eventually(async () => (await section(page, "identity-change-target").locator("input").isDisabled()) === false);
  assert.equal(await section(page, "identity-change-submit").isDisabled(), false);
});

test("发起请求体精确为 userId/toIdentity/reason，不含 fromIdentity", async (t) => {
  const { page, state } = await fixture(t);
  await openDialog(page);
  await pickIdentity(page, "入党积极分子");
  await section(page, "identity-change-reason").fill("支部大会讨论通过");
  await section(page, "identity-change-submit").click();
  const box = await waitMessageBox(page);
  await box.locator(".el-button--primary").click();
  await eventually(() => state.applyCalls.length === 1);
  const body = state.applyCalls[0].body;
  assert.deepEqual(Object.keys(body).sort(), ["reason", "toIdentity", "userId"]);
  assert.equal(body.userId, 12);
  assert.equal(body.toIdentity, 2);
  assert.equal(body.reason, "支部大会讨论通过");
  // fromIdentity 由服务端取当前身份快照，前端自发等于伪造快照。
  assert.equal("fromIdentity" in body, false);
  assert.equal(state.applyCalls[0].search, "", "发起请求不得带查询参数");
  await eventually(async () => (await page.locator(".el-message--success").count()) > 0);
  assert.match(await page.locator(".el-message--success").first().innerText(), /变更单已提交，等待超级管理员审批/);
});

test("变更原因超 500 字前端拦截并定位字段，零请求", async (t) => {
  const { page, state } = await fixture(t);
  await openDialog(page);
  await pickIdentity(page, "入党积极分子");
  // 绕过 maxlength（粘贴/脚本可以做到），验证提交层而不是 DOM 层拦截。
  await page.evaluate(() => {
    // el-input 会把透传 attrs 落到内部 textarea 上，这里直接摘掉 maxlength 模拟粘贴绕过。
    const field = document.querySelector('[data-testid="identity-change-reason"]');
    const textarea = field?.tagName === "TEXTAREA" ? field : field?.querySelector("textarea");
    textarea?.removeAttribute("maxlength");
  });
  await section(page, "identity-change-reason").fill("长".repeat(501));
  await section(page, "identity-change-submit").click();
  await eventually(async () => (await page.locator(".el-form-item__error").count()) > 0);
  assert.match(await page.locator(".el-form-item__error").first().innerText(), /不能超过 500 字/);
  await page.waitForTimeout(300);
  assert.equal(state.applyCalls.length, 0, "超长原因不得发出请求");
  assert.equal(await page.locator(".el-message-box").count(), 0, "未通过校验不得进入二次确认");
});

test("二次确认展示当前身份与目标身份，未登记时显示「未登记」而不是 null", async (t) => {
  const { page } = await fixture(t);
  await openDialog(page);
  // 档案 identityName 为 null、identityId=2：当前身份用字典映射，不能显示 null。
  await pickIdentity(page, "发展对象");
  await section(page, "identity-change-submit").click();
  let box = await waitMessageBox(page);
  let text = await box.locator(".el-message-box__message").innerText();
  assert.match(text, /当前身份：入党积极分子/);
  assert.match(text, /目标身份：发展对象/);
  assert.match(text, /成员：张同学/);
  assert.doesNotMatch(text, /\bnull\b|undefined/);
  await box.locator(".el-message-box__btns button").first().click();

  // 未登记档案：identityId=null 时必须写「未登记」。
  const second = await fixture(t, { state: { defaultProfile: profile({ basic: basic({ identityId: null }) }) } });
  await openDialog(second.page);
  await pickIdentity(second.page, "发展对象");
  await section(second.page, "identity-change-submit").click();
  box = await waitMessageBox(second.page);
  text = await box.locator(".el-message-box__message").innerText();
  assert.match(text, /当前身份：未登记/);
  assert.doesNotMatch(text, /当前身份：null|当前身份：身份/);
});

test("重复待审批时服务端 400 原文可见，且不出现成功提示", async (t) => {
  const { page, state } = await fixture(t, { state: { applyError: "该用户已有待审批的身份变更单" } });
  await openDialog(page);
  await pickIdentity(page, "入党积极分子");
  await section(page, "identity-change-reason").fill("再次发起");
  await section(page, "identity-change-submit").click();
  const box = await waitMessageBox(page);
  await box.locator(".el-button--primary").click();
  await eventually(async () => (await section(page, "identity-change-submit-error").count()) === 1);
  assert.match(await section(page, "identity-change-submit-error").innerText(), /该用户已有待审批的身份变更单/);
  assert.equal(await page.locator(".el-message--success").count(), 0, "失败不得出现成功提示");
  // 失败后保留已填内容，不静默清空。
  assert.equal(await section(page, "identity-change-reason").inputValue(), "再次发起");
  // 前端不预判「已有待审批单」：选项与提交按钮在服务端拒绝前都是可用的。
  assert.equal(state.applyCalls.length, 1);
});

test("发起成功后不刷新档案、不本地改写身份名", async (t) => {
  const { page, state } = await fixture(t);
  await openDialog(page);
  await pickIdentity(page, "入党积极分子");
  await section(page, "identity-change-submit").click();
  const box = await waitMessageBox(page);
  await box.locator(".el-button--primary").click();
  await eventually(() => state.applyCalls.length === 1);
  await eventually(async () => (await page.locator(".el-message--success").count()) > 0);
  await page.waitForTimeout(400);
  // 变更单尚未审批，档案身份仍是原值，且不得因此额外请求档案（避免隐性第二次请求）。
  assert.equal(state.profileCalls, 1, "发起成功不得触发第二次档案请求");
  const basicText = await section(page, "dev-profile-basic").innerText();
  assert.match(basicText, /未登记政治身份/);
  assert.match(await page.locator(".el-message--info").last().innerText(), /审批通过后请重新读取档案/);
});

test("双击发起只提交一次：只弹一个二次确认框、只发一次请求", async (t) => {
  const { page, state } = await fixture(t);
  await openDialog(page);
  await pickIdentity(page, "入党积极分子");
  // 同一事件循环内连点两次；摘掉 disabled 后只剩代码层的同步置位。
  await doubleClickTestId(page, "identity-change-submit");
  // 同步置位的可观察后果：第二次点击不能叠出第二个二次确认框。
  await waitMessageBox(page);
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".el-message-box").count(), 1, "双击不得叠出两个二次确认框");
  await page.locator(".el-message-box").locator(".el-button--primary").click();
  await eventually(() => state.applyCalls.length >= 1);
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".el-message-box").count(), 0, "确认后不得再弹出第二个确认框");
  assert.equal(state.applyCalls.length, 1, "双击只应产生一次发起请求");
});

test("换号后旧会话的迟到字典响应不写回", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { identityGates: { 1: gate } } });
  await waitProfile(page);
  await section(page, "identity-change-open").click();
  await eventually(() => identityRequests(state).length === 1);
  // 换号会关闭发起弹窗（旧会话的表单与字典结果都不能留给新会话）。
  await switchAccount(page, "super_admin");
  await eventually(async () => (await section(page, "identity-change-form").count()) === 0);
  // 新会话的字典与旧会话完全不同。
  state.identities = [{ id: 9, identityName: "新会话身份", level: 1 }];
  state.identitiesTotal = 1;
  await section(page, "identity-change-open").click();
  await eventually(() => identityRequests(state).length === 2);
  await eventually(async () => (await section(page, "identity-change-target").locator("input").isDisabled()) === false);
  // 解冻旧会话的字典响应：不得覆盖新会话的下拉项。
  gate.resolve();
  await page.waitForTimeout(300);
  await section(page, "identity-change-target").click();
  const options = page.locator(".el-select-dropdown__item");
  await eventually(async () => (await options.count()) === 1);
  assert.match(await options.first().innerText(), /新会话身份/);
  assert.doesNotMatch(await page.locator(".el-select-dropdown").innerText(), /入党积极分子/);
});

// ============================ 审批页 ============================

test("审批页默认 status=1，切「已生效」精确发送 status=2，total 取服务端值", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes", state: { changesTotal: 37 } });
  await waitReviewPage(page);
  const calls = listRequests(state);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, { page: "1", size: "10", status: "1" });
  // total 取服务端值，不用当前页行数推断。
  await eventually(async () => (await page.locator(".el-pagination__total").innerText()).includes("37"));
  await section(page, "identity-review-status").getByText("已生效", { exact: true }).click();
  await eventually(() => listRequests(state).length === 2);
  const second = listRequests(state).at(-1);
  assert.deepEqual(second.params, { page: "1", size: "10", status: "2" });
  assert.equal("userId" in second.params, false);
});

test("按成员编号精确过滤；非法编号不发请求并说明不支持姓名搜索", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  // 不支持姓名模糊搜索：界面必须写明。
  assert.match(await section(page, "identity-review-admin-hint").innerText(), /不支持按姓名模糊搜索/);
  await section(page, "identity-review-user").fill("张三");
  await section(page, "identity-review-search").click();
  await eventually(async () => (await page.locator(".el-message").count()) > 0);
  assert.match(await page.locator(".el-message").first().innerText(), /成员编号必须是正整数/);
  await page.waitForTimeout(300);
  assert.equal(listRequests(state).length, 1, "非法编号不得发请求");
  await section(page, "identity-review-user").fill("12");
  await section(page, "identity-review-search").click();
  await eventually(() => listRequests(state).length === 2);
  assert.deepEqual(listRequests(state).at(-1).params, { page: "1", size: "10", status: "1", userId: "12" });
});

test("快速切换筛选时，旧筛选的迟到响应不覆盖新结果", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, {
    path: "/development/identity-changes",
    // 旧筛选（待审批）的响应样本与「已生效」样本可区分。
    state: { changeGates: { 1: gate }, changes: [change(1, { userName: "待审批旧成员" })] },
  });
  await eventually(() => listRequests(state).length === 1);
  // 切到「已生效」：这次响应不被冻结，先返回并渲染。
  state.changes = [change(2, { userName: "已生效的成员", status: 2 })];
  await section(page, "identity-review-status").getByText("已生效", { exact: true }).click();
  await eventually(() => listRequests(state).length === 2);
  await eventually(async () => (await section(page, "identity-review-table").innerText()).includes("已生效的成员"));
  // 解冻「待审批」的旧响应：会话没变、只看请求序号能否挡住它。
  gate.resolve();
  await page.waitForTimeout(400);
  const text = await section(page, "identity-review-table").innerText();
  assert.match(text, /已生效的成员/);
  assert.doesNotMatch(text, /待审批旧成员/, "旧筛选的迟到响应不得覆盖当前筛选结果");
});

test("审批通过后重拉当前页，筛选与页码保持不变", async (t) => {
  const { page, state } = await fixture(t, {
    path: "/development/identity-changes",
    state: { changesTotal: 25 },
  });
  await waitReviewPage(page);
  // 翻到第 2 页，再在第 2 页上审批：重拉必须还带 page=2&status=1。
  await page.locator(".el-pager li").nth(1).click();
  await eventually(() => listRequests(state).length === 2);
  assert.equal(listRequests(state).at(-1).params.page, "2");
  // 审批后的服务端响应换成可区分的数据，证明列表来自重新请求。
  state.changes = [change(7, { userName: "重拉后的成员", status: 1 })];
  await section(page, "identity-review-pass-1").click();
  await section(page, "identity-review-confirm-1").click();
  await eventually(() => reviewRequests(state).length === 1);
  await eventually(() => listRequests(state).length === 3);
  const refresh = listRequests(state).at(-1);
  assert.deepEqual(refresh.params, { page: "2", size: "10", status: "1" });
  await eventually(async () => (await section(page, "identity-review-table").innerText()).includes("重拉后的成员"));
  // 审批请求体只有 pass/remark，不带任何身份或角色字段。
  assert.deepEqual(Object.keys(state.reviewCalls[0].body).sort(), ["pass", "remark"]);
  assert.equal(state.reviewCalls[0].body.pass, true);
});

test("审批驳回发送 pass=false，提示中不宣称身份已变更", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  await section(page, "identity-review-reject-1").click();
  await section(page, "identity-review-remark-1").fill("材料不足");
  await section(page, "identity-review-confirm-1").click();
  await eventually(() => reviewRequests(state).length === 1);
  assert.equal(state.reviewCalls[0].body.pass, false);
  assert.equal(state.reviewCalls[0].body.remark, "材料不足");
  await eventually(async () => (await page.locator(".el-message--success").count()) > 0);
  const success = await page.locator(".el-message--success").first().innerText();
  assert.match(success, /已驳回/);
  assert.match(success, /身份保持不变/);
  assert.doesNotMatch(success, /已生效|身份已更新/);
});

test("已处理单的通过/驳回按钮禁用，服务端「已处理」原文可展示", async (t) => {
  const { page, state } = await fixture(t, {
    path: "/development/identity-changes",
    state: {
      changes: [change(1, { status: 2 }), change(2, { status: 3 }), change(3, { status: 9 })],
      changesTotal: 3,
    },
  });
  await waitReviewPage(page);
  for (const id of [1, 2, 3]) {
    assert.equal(await section(page, `identity-review-pass-${id}`).isDisabled(), true, `单据 ${id} 不可再审批`);
    assert.equal(await section(page, `identity-review-reject-${id}`).isDisabled(), true, `单据 ${id} 不可再驳回`);
  }
  // 未知状态不兜底成已生效。
  const unknownRow = await section(page, "identity-review-row-3").innerText();
  assert.match(unknownRow, /未知状态（9）/);
  assert.doesNotMatch(unknownRow, /已生效/);

  // 服务端「已处理」原文：待审批行在提交时被服务端判定已处理。
  const second = await fixture(t, {
    path: "/development/identity-changes",
    state: { reviewError: "该变更单已处理，不能重复审批" },
  });
  await waitReviewPage(second.page);
  await section(second.page, "identity-review-pass-1").click();
  await section(second.page, "identity-review-confirm-1").click();
  await eventually(async () => (await section(second.page, "identity-review-review-error").count()) === 1);
  assert.match(await section(second.page, "identity-review-review-error").innerText(), /该变更单已处理，不能重复审批/);
  assert.equal(await second.page.locator(".el-message--success").count(), 0);
});

test("超管可见通过/驳回，支委不可见且不发 status/userId", async (t) => {
  const admin = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(admin.page);
  assert.equal(await section(admin.page, "identity-review-pass-1").count(), 1);
  assert.equal(await section(admin.page, "identity-review-reject-1").count(), 1);
  assert.match(await admin.page.locator(".page-heading").innerText(), /超级管理员 · 可审批/);
  assert.equal(await section(admin.page, "identity-review-status").count(), 1);

  const branch = await fixture(t, {
    role: "party_secretary",
    path: "/development/identity-changes",
    state: { changes: [change(1)], changesTotal: 1 },
  });
  await waitReviewPage(branch.page);
  // 审批端点 hasRole('SUPER_ADMIN')：支委不渲染按钮，而不是渲染后必然 403。
  assert.equal(await section(branch.page, "identity-review-pass-1").count(), 0);
  assert.equal(await section(branch.page, "identity-review-reject-1").count(), 0);
  assert.equal(await section(branch.page, "identity-review-status").count(), 0);
  assert.equal(await section(branch.page, "identity-review-user").count(), 0);
  assert.match(await section(branch.page, "identity-review-branch-hint").innerText(), /不支持按状态或成员筛选/);
  assert.match(await branch.page.locator(".page-heading").innerText(), /本支部只读/);
  // 后端 pageForBranch 丢弃这两个参数，发送了只会误导用户。
  const calls = listRequests(branch.state);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, { page: "1", size: "10" });
  assert.equal("status" in calls[0].params, false);
  assert.equal("userId" in calls[0].params, false);
});

test("越权读单原样显示「变更单不存在」，不出现「无权限」", async (t) => {
  const { page, state } = await fixture(t, {
    role: "party_secretary",
    path: "/development/identity-changes",
    state: { detailError: "变更单不存在" },
  });
  await waitReviewPage(page);
  await section(page, "identity-review-detail-1").click();
  await eventually(async () => (await section(page, "identity-review-detail-error").count()) === 1);
  const text = await section(page, "identity-review-detail-error").innerText();
  assert.match(text, /变更单不存在/);
  assert.doesNotMatch(text, /无权限|403|找不到页面/);
  assert.equal(detailRequests(state).length, 1);
  assert.equal(detailRequests(state)[0].path, "/api/v4/identity-changes/1");
});

test("变更单详情展示服务端字段，未审批时显示尚未审批", async (t) => {
  const { page } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  await section(page, "identity-review-detail-1").click();
  await eventually(async () => (await section(page, "identity-review-detail-body").count()) === 1);
  const text = await section(page, "identity-review-detail-body").innerText();
  assert.match(text, /张同学/);
  // fromIdentity 为空 = 首次登记，显示「未登记」而不是 null。
  assert.match(text, /未登记/);
  assert.match(text, /入党积极分子/);
  assert.match(text, /李支委/);
  assert.match(text, /尚未审批/);
  assert.doesNotMatch(text, /\bnull\b|undefined/);
});

test("双击审批只发一次请求", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  await section(page, "identity-review-pass-1").click();
  await eventually(async () => (await section(page, "identity-review-confirm-1").count()) === 1);
  // 摘掉 disabled 后双击：只有同步置位能保证只发一次。
  await doubleClickTestId(page, "identity-review-confirm-1");
  await eventually(() => reviewRequests(state).length >= 1);
  await page.waitForTimeout(600);
  assert.equal(reviewRequests(state).length, 1, "双击只应产生一次审批请求");
});

test("审批页失败可重试，且不把失败当空态", async (t) => {
  const { page, state } = await fixture(t, {
    path: "/development/identity-changes",
    state: { changesError: { status: 400, message: "您未管理任何支部（不是任何支部的秘书）" } },
  });
  await eventually(async () => (await section(page, "identity-review-error").count()) === 1);
  const text = await section(page, "identity-review-error").innerText();
  assert.match(text, /变更单暂时无法加载/);
  assert.match(text, /您未管理任何支部（不是任何支部的秘书）/);
  assert.equal(await section(page, "identity-review-empty").count(), 0, "失败不能显示空态");
  state.changesError = null;
  state.changes = [change(1)];
  await section(page, "identity-review-retry").click();
  await waitRows(page);
  assert.equal(listRequests(state).length, 2);
  assert.equal(await section(page, "identity-review-error").count(), 0);
});

test("空列表走空态而不是错误态", async (t) => {
  const { page } = await fixture(t, {
    path: "/development/identity-changes",
    state: { changes: [], changesTotal: 0 },
  });
  await eventually(async () => (await section(page, "identity-review-empty").count()) === 1);
  assert.match(await section(page, "identity-review-empty").innerText(), /暂无符合条件的身份变更单/);
  assert.equal(await section(page, "identity-review-error").count(), 0);
});

test("换号后旧会话的迟到列表响应不写回", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, {
    path: "/development/identity-changes",
    state: { changeGates: { 1: gate } },
  });
  await eventually(() => listRequests(state).length === 1);
  state.changes = [change(9, { userName: "新会话变更单", operatorName: "新会话发起人" })];
  state.changesTotal = 1;
  await switchAccount(page, "super_admin");
  await waitRows(page);
  await eventually(async () => (await section(page, "identity-review-table").innerText()).includes("新会话变更单"));
  gate.resolve();
  await page.waitForTimeout(300);
  const text = await section(page, "identity-review-table").innerText();
  assert.match(text, /新会话变更单/);
  assert.doesNotMatch(text, /李支委/);
  // 换号后筛选回到默认待审批。
  assert.equal(listRequests(state).at(-1).params.status, "1");
});

test("退出登录后清除已渲染变更单并停止请求", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  const calls = listRequests(state).length;
  await signOut(page);
  await eventually(async () => (await section(page, "identity-review-table").count()) === 0);
  await eventually(async () => (await page.locator(".el-alert").first().innerText()).includes("需要登录"));
  await page.waitForTimeout(300);
  assert.equal(listRequests(state).length, calls, "退出后不得再请求变更单");
});

test("普通成员直访审批页被守卫拦回首页且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member", path: "/development/identity-changes" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  await page.waitForTimeout(300);
  assert.deepEqual(
    state.requests.filter((r) => r.path !== "/api/v2/content/news/page" && r.path !== "/api/v2/content/notices/page"),
    [],
  );
  assert.equal(await section(page, "identity-review").count(), 0);
});

test("无令牌的开发预览态：审批页与档案页均零业务请求", async (t) => {
  for (const path of ["/development/identity-changes", "/development/member/12"]) {
    const { page, state } = await fixture(t, { withToken: false, previewRole: "super_admin", path });
    await eventually(async () => (await page.locator(".el-alert").count()) > 0);
    assert.match(await page.locator(".el-alert").first().innerText(), /需要登录/);
    await page.waitForTimeout(300);
    assert.deepEqual(state.requests, [], `${path} 不得发出任何业务请求`);
    assert.equal(await section(page, "identity-review-table").count(), 0);
    assert.equal(await section(page, "identity-change-open").count(), 0);
  }
});

test("身份变更生效后前端角色与导航项不变", async (t) => {
  const { page, state } = await fixture(t, { path: "/development/identity-changes" });
  await waitReviewPage(page);
  const before = await readStore(page);
  assert.equal(before.role, "super_admin");
  const navCount = await page.locator(".side-link").count();
  await section(page, "identity-review-pass-1").click();
  await section(page, "identity-review-confirm-1").click();
  await eventually(() => reviewRequests(state).length === 1);
  await eventually(async () => (await page.locator(".el-message--success").count()) > 0);
  await page.waitForTimeout(300);
  const after = await readStore(page);
  // 红线：生效只写 tb_user_detail.identity_id，不改 role_id、菜单与权限矩阵。
  assert.equal(after.role, before.role, "身份变更不得联动登录角色");
  assert.deepEqual(after.nav, before.nav, "身份变更不得改动导航项");
  assert.equal(await page.locator(".side-link").count(), navCount);
});

test("列表页页头链接进入审批页，且不新增顶级导航", async (t) => {
  const { page } = await fixture(t, { path: "/development", state: { changes: [change(1)] } });
  await eventually(async () => (await section(page, "dev-list").count()) === 1);
  // 导航不得因审批页而膨胀。
  const navText = (await page.locator(".side-nav").innerText()).replace(/\s+/g, " ");
  assert.doesNotMatch(navText, /身份变更审批/);
  await section(page, "dev-list-identity-review-link").click();
  await waitReviewPage(page);
  assert.equal(new URL(page.url()).pathname, "/development/identity-changes");
});

test("390px 窄屏下审批页与发起弹窗都不出现整页横向溢出", async (t) => {
  const review = await fixture(t, {
    path: "/development/identity-changes",
    viewport: { width: 390, height: 844 },
    state: { changes: [change(1, { reason: "很长的原因".repeat(20) })] },
  });
  await waitReviewPage(review.page);
  const first = await review.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    first.scrollWidth <= first.clientWidth + 1,
    `审批页 scrollWidth=${first.scrollWidth} clientWidth=${first.clientWidth}`,
  );

  const member = await fixture(t, {
    path: "/development/member/12",
    viewport: { width: 390, height: 844 },
  });
  await waitProfile(member.page);
  await section(member.page, "identity-change-open").click();
  await eventually(async () => (await section(member.page, "identity-change-form").count()) === 1);
  const second = await member.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    second.scrollWidth <= second.clientWidth + 1,
    `发起弹窗 scrollWidth=${second.scrollWidth} clientWidth=${second.clientWidth}`,
  );
  const box = await section(member.page, "identity-change-target").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= second.clientWidth + 1, JSON.stringify(box));
});
