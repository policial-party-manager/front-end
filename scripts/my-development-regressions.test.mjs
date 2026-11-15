import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 我的培养（本人电子培养档案）浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 只请求本人端点、摘要用服务端数字、七个区块独立空态、未知枚举不兜底成成功语义、
 * 服务端文本按纯文本渲染、内部文件路径不生成链接、失败可重试且迟到响应不覆盖新数据、
 * 换号后旧会话数据被丢弃、401 刷新后恰好重放一次、无令牌预览态零请求、非本人角色被守卫拦截、窄屏无横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/my-development-${process.pid}`,
    server: { host: "127.0.0.1", port: 5198, strictPort: false },
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

/** 基本信息：字段与后端 UserVo 对齐，可空字段默认 null。 */
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
  branchName: "本科生第一党支部",
  roleId: 3,
  role: "student",
  identityId: 2,
  identityName: "积极分子",
  phone: null,
  email: null,
  contactPerson: null,
  remark: null,
  status: 1,
  createTime: "2025-09-01T08:00:00",
  lastLoginTime: null,
  ...overrides,
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

/** 允许出现的业务请求：本人档案端点、令牌刷新，以及被守卫踢回首页后首页自身的资讯接口。 */
const ALLOWED_PATHS = new Set([
  "/api/v4/cultivation-profiles/me",
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
    meCalls: 0,
    profile: profile(),
    failCalls: 0,
    meUnauthorized: 0,
    freezeFirst: false,
    firstGate: null,
    firstFail: false,
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
      search: url.search,
      authorization: req.headers().authorization,
    });
    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "student", username: "me" });
    // 本人档案端点：不接收任何查询参数，服务端按登录态决定查询对象。
    state.meCalls++;
    const call = state.meCalls;
    if (state.meUnauthorized > 0) {
      state.meUnauthorized--;
      return route.fulfill({ status: 401, json: { code: 401, message: "登录令牌已过期" } });
    }
    if (state.failCalls > 0) {
      state.failCalls--;
      return route.fulfill({ status: 500, json: { code: 500, message: "服务暂时不可用" } });
    }
    if (state.freezeFirst && call === 1) {
      // 请求到达时冻结响应体，避免解冻前对 state 的修改污染「旧会话响应」样本。
      const body = state.profile;
      const fail = state.firstFail;
      await state.firstGate.promise;
      if (fail) return route.fulfill({ status: 500, json: { code: 500, message: "服务暂时不可用" } });
      return ok(route, body);
    }
    return ok(route, state.profile);
  });
  await page.goto(`${baseURL}${options.path || "/my-development"}`);
  return { page, state, context };
}

const meRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/cultivation-profiles/me");
const section = (page, testId) => page.getByTestId(testId);

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

test("完整档案渲染：基本信息、服务端摘要与七个区块", async (t) => {
  const { page, state } = await fixture(t);
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  const heading = await page.locator(".page-heading").innerText();
  assert.match(heading, /本人档案 · 只读/);

  const basicText = await section(page, "my-dev-basic").innerText();
  assert.match(basicText, /张同学/);
  assert.match(basicText, /本科生第一党支部/);
  assert.match(basicText, /积极分子/);
  assert.match(basicText, /系统角色不代表政治身份/);

  // 摘要必须与服务端 summary 完全一致，前端不得自行统计。
  assert.match(await section(page, "my-dev-summary-thought").innerText(), /2 条/);
  assert.match(await section(page, "my-dev-summary-thought").innerText(), /其中已通过 1 条/);
  assert.match(await section(page, "my-dev-summary-sign").innerText(), /1 次/);
  // 学时以分钟为口径；不足 1 小时的样本不得出现小时换算。
  assert.match(await section(page, "my-dev-summary-study").innerText(), /90 分钟/);
  assert.match(await section(page, "my-dev-summary-study").innerText(), /约 1 小时 30 分钟/);
  assert.match(await section(page, "my-dev-summary-material").innerText(), /1 份/);
  assert.match(await section(page, "my-dev-summary-sign").innerText(), /仅签到次数/);
  // 「签到次数」不得被当成报名数或全部参与次数。
  assert.doesNotMatch(await section(page, "my-dev-summary-sign").innerText(), /\d+ 人报名|报名人数/);

  assert.match(await section(page, "my-dev-mentors").innerText(), /李老师/);
  // 缺 realName 时用 username 兜底，但绝不补造姓名。
  assert.match(await section(page, "my-dev-mentors").innerText(), /wang/);
  assert.match(await section(page, "my-dev-identity-changes").innerText(), /已生效/);
  // 首次登记 fromIdentity 为空，不能渲染成 "null → n"。
  assert.match(await section(page, "my-dev-identity-changes").innerText(), /编号不可用 → 2/);
  assert.doesNotMatch(await section(page, "my-dev-identity-changes").innerText(), /null/);
  assert.match(await section(page, "my-dev-thought-reports").innerText(), /第一季度思想汇报/);
  assert.match(await section(page, "my-dev-thought-reports").innerText(), /通过/);
  assert.match(await section(page, "my-dev-signs").innerText(), /本人签到/);
  assert.match(await section(page, "my-dev-signs").innerText(), /活动编号 9/);
  assert.match(await section(page, "my-dev-leaves").innerText(), /外出实习/);
  assert.match(await section(page, "my-dev-leaves").innerText(), /生效/);
  assert.match(await section(page, "my-dev-studies").innerText(), /课程编号 7/);
  assert.match(await section(page, "my-dev-studies").innerText(), /90 分钟/);
  assert.match(await section(page, "my-dev-studies").innerText(), /92\.5/);
  assert.match(await section(page, "my-dev-materials").innerText(), /入党申请书\.pdf/);

  // 一次加载只发一次本人档案请求。
  await page.waitForTimeout(200);
  assert.equal(state.meCalls, 1);
});

test("带 userId 或锚点访问也只请求本人端点，且不重复请求", async (t) => {
  const { page, state } = await fixture(t, { path: "/my-development?userId=999#identity" });
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  await page.waitForTimeout(200);
  const calls = meRequests(state);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, {}, "本人端点不得携带任何查询参数");
  assert.equal(calls[0].search, "");
  // 路由 query/hash 变化不应触发重新拉取。
  await page.evaluate(() => {
    history.replaceState(null, "", "/my-development?userId=1000");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(250);
  assert.equal(state.meCalls, 1);
});

test("空档案逐区空态，且摘要为 0 而不是伪造数据", async (t) => {
  const { page } = await fixture(t, {
    state: {
      profile: {
        basic: basic({ identityName: null, branchName: null, realName: null, studentId: null }),
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
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  const basicText = await section(page, "my-dev-basic").innerText();
  assert.match(basicText, /未登记政治身份/);
  assert.match(basicText, /未分配支部/);
  assert.match(basicText, /未登记姓名/);

  assert.match(await section(page, "my-dev-summary-study").innerText(), /0 分钟/);
  assert.doesNotMatch(await section(page, "my-dev-summary-study").innerText(), /NaN|未统计/);

  assert.match(await section(page, "my-dev-mentors").innerText(), /尚未设置培养联系人/);
  assert.match(await section(page, "my-dev-identity-changes").innerText(), /暂无身份变更记录/);
  assert.match(await section(page, "my-dev-thought-reports").innerText(), /暂无思想汇报记录/);
  assert.match(await section(page, "my-dev-signs").innerText(), /暂无活动签到记录/);
  assert.match(await section(page, "my-dev-leaves").innerText(), /暂无请假记录/);
  assert.match(await section(page, "my-dev-studies").innerText(), /暂无学习记录/);
  assert.match(await section(page, "my-dev-materials").innerText(), /暂无培养材料/);
});

test("摘要缺失时显示暂无统计，不用数组长度冒充服务端统计", async (t) => {
  const { page } = await fixture(t, { state: { profile: profile({ summary: null }) } });
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  const summaryText = await section(page, "my-dev-summary").innerText();
  assert.match(summaryText, /未统计/);
  assert.match(summaryText, /服务端未返回摘要/);
  assert.doesNotMatch(summaryText, /\d+ 次|\d+ 份/);
});

test("摘要字段部分缺失时显示未统计，不输出 undefined", async (t) => {
  // 服务端新增字段或旧版返回缺字段时，计数位为空而不能拼成 "undefined 条"。
  const { page } = await fixture(t, {
    state: {
      profile: profile({
        summary: { thoughtReportCount: null, thoughtReportApproved: undefined, signCount: 0, studyMinutes: null },
      }),
    },
  });
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  const summaryText = await section(page, "my-dev-summary").innerText();
  assert.doesNotMatch(summaryText, /undefined|NaN|null/);
  // 0 是合法计数，不得被当成缺失。
  assert.match(await section(page, "my-dev-summary-sign").innerText(), /0 次/);
  assert.match(await section(page, "my-dev-summary-thought").innerText(), /未统计/);
  assert.match(await section(page, "my-dev-summary-study").innerText(), /未统计/);
});

test("未知枚举显示未知状态，不落入通过或已生效", async (t) => {
  const { page } = await fixture(t, {
    state: {
      profile: profile({
        identityChanges: [
          {
            id: 6,
            userId: 12,
            fromIdentity: 2,
            toIdentity: 3,
            operatorId: 1,
            reason: "调整",
            status: 9,
            reviewerId: null,
            reviewTime: null,
            reviewRemark: null,
            createTime: "2026-07-01T09:00:00",
          },
        ],
        thoughtReports: [
          {
            id: 32,
            userId: 12,
            reviewerId: null,
            title: "第二季度思想汇报",
            content: "正文",
            file: null,
            status: 9,
            reviewRemark: null,
            submitTime: "2026-07-05T20:00:00",
            reviewTime: null,
          },
        ],
        leaves: [
          {
            id: 52,
            activityId: 11,
            userId: 12,
            reason: "事假",
            operatorId: 21,
            status: 9,
            createTime: "2026-07-02T08:00:00",
            updateTime: null,
          },
        ],
      }),
    },
  });
  await eventually(async () => (await section(page, "my-dev-identity-changes").count()) === 1);
  const identityRow = section(page, "my-dev-identity-changes").locator(".row-card").first();
  await eventually(async () => (await identityRow.innerText()).includes("未知状态（9）"));
  assert.doesNotMatch(await identityRow.innerText(), /已生效/);
  const reportRow = section(page, "my-dev-thought-reports").locator(".row-card").first();
  await eventually(async () => (await reportRow.innerText()).includes("未知状态（9）"));
  assert.doesNotMatch(await reportRow.innerText(), /通过/);
  const leaveRow = section(page, "my-dev-leaves").locator(".row-card").first();
  await eventually(async () => (await leaveRow.innerText()).includes("未知状态（9）"));
});

test("服务端 HTML 文本按纯文本渲染，不产生可执行节点", async (t) => {
  const { page } = await fixture(t, {
    state: {
      profile: profile({
        thoughtReports: [
          {
            id: 33,
            userId: 12,
            reviewerId: null,
            title: '<img src=x onerror="window.__xss=1">标题',
            content: '<img src=x onerror="window.__xss=1">测试正文',
            file: null,
            status: 1,
            reviewRemark: "<script>window.__xss=1</script>",
            submitTime: "2026-08-05T20:00:00",
            reviewTime: null,
          },
        ],
        identityChanges: [
          {
            id: 7,
            userId: 12,
            fromIdentity: 2,
            toIdentity: 3,
            operatorId: 1,
            reason: '<script>alert("x")</script>说明',
            status: 1,
            reviewerId: null,
            reviewTime: null,
            reviewRemark: null,
            createTime: "2026-08-01T09:00:00",
          },
        ],
      }),
    },
  });
  const reports = section(page, "my-dev-thought-reports");
  await eventually(async () => (await reports.innerText()).includes("测试正文"));
  const reportText = await reports.innerText();
  assert.match(reportText, /<img src=x onerror=/);
  assert.match(reportText, /<script>window\.__xss=1<\/script>/);
  // 区块内不得出现被解析出来的图片节点。
  assert.equal(await reports.locator("img").count(), 0);
  assert.match(await section(page, "my-dev-identity-changes").innerText(), /<script>alert/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
});

test("材料与证书的内部路径不渲染也不生成可点击链接", async (t) => {
  const { page } = await fixture(t, {
    state: {
      profile: profile({
        materials: [
          {
            id: 72,
            userId: 12,
            materialType: "政审材料",
            file: "file:secret/x.pdf",
            fileName: "政审材料.pdf",
            uploaderId: 21,
            remark: "内部材料",
            status: 1,
            createTime: "2026-08-12T11:20:00",
          },
        ],
        studyRecords: [
          {
            id: 62,
            userId: 12,
            courseId: 8,
            studyTime: "00:45:00",
            score: "88.50",
            url: "file:private/cert.pdf",
            remark: null,
            createTime: "2026-08-10T15:00:00",
          },
        ],
      }),
    },
  });
  await eventually(async () => (await section(page, "my-dev-materials").count()) === 1);
  const materialText = await section(page, "my-dev-materials").innerText();
  const studyText = await section(page, "my-dev-studies").innerText();
  // 规格只允许展示材料类型、文件名、时间与备注，内部存储路径不得下发到页面。
  assert.doesNotMatch(materialText, /file:secret/);
  assert.doesNotMatch(studyText, /file:private/);
  assert.doesNotMatch(materialText, /file:/);
  assert.doesNotMatch(studyText, /file:/);
  assert.match(materialText, /政审材料\.pdf/);
  assert.match(materialText, /政审材料/);
  // 成绩是字符串小数，必须原样展示，不能出现精度丢失或 NaN。
  assert.match(studyText, /88\.50/);
  assert.match(studyText, /45 分钟/);
  assert.equal(await page.locator('a[href*="file:"]').count(), 0);
  assert.equal(await section(page, "my-dev-materials").locator("a").count(), 0);
  assert.equal(await section(page, "my-dev-studies").locator("a").count(), 0);
});

test("首次加载失败显示错误与重试，重试成功后渲染数据", async (t) => {
  const { page, state } = await fixture(t, { state: { failCalls: 1 } });
  await eventually(async () => (await section(page, "my-dev-error").count()) === 1);
  const errorText = await section(page, "my-dev-error").innerText();
  assert.match(errorText, /培养档案暂时无法加载/);
  assert.match(errorText, /服务暂时不可用/);
  assert.equal(await section(page, "my-dev-summary").count(), 0);

  await section(page, "my-dev-retry").click();
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  assert.equal(state.meCalls, 2);
  assert.equal(await section(page, "my-dev-error").count(), 0);
  assert.match(await section(page, "my-dev-basic").innerText(), /张同学/);
});

test("换号后旧会话的迟到失败响应不覆盖新会话数据", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, {
    state: { freezeFirst: true, firstGate: gate, firstFail: false },
  });
  await eventually(() => state.meCalls === 1);
  // 新会话使用不同姓名，便于区分写回来源。
  state.profile = profile({ basic: basic({ realName: "新会话成员", studentId: "2023019999" }) });
  state.firstFail = true;
  await switchAccount(page);
  await eventually(async () => (await section(page, "my-dev-basic").count()) === 1);
  assert.match(await section(page, "my-dev-basic").innerText(), /新会话成员/);
  gate.resolve();
  await page.waitForTimeout(300);
  // 旧响应已过期：既不改写数据，也不把页面推进错误态。
  assert.match(await section(page, "my-dev-basic").innerText(), /新会话成员/);
  assert.equal(await section(page, "my-dev-error").count(), 0);
});

test("换号后旧会话的迟到成功响应不写回旧档案", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirst: true, firstGate: gate } });
  await eventually(() => state.meCalls === 1);
  state.profile = profile({ basic: basic({ realName: "第二个会话", studentId: "2023018888" }) });
  await switchAccount(page);
  await eventually(async () => (await section(page, "my-dev-basic").innerText()).includes("第二个会话"));
  gate.resolve();
  await page.waitForTimeout(300);
  const basicText = await section(page, "my-dev-basic").innerText();
  assert.match(basicText, /第二个会话/);
  assert.doesNotMatch(basicText, /张同学/);
});

test("退出登录后立即清除已渲染档案并停止请求", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirst: true, firstGate: gate } });
  await eventually(() => state.meCalls === 1);
  await signOut(page);
  // 退出后页面上不得残留上一账号的姓名、支部等个人信息，并转为未登录提示。
  await eventually(async () => (await page.getByText("张同学").count()) === 0);
  await eventually(async () => (await section(page, "my-dev-basic").count()) === 0);
  await eventually(async () => (await page.locator(".el-alert").first().innerText()).includes("我的培养需要登录"));
  // 解冻在途响应：页面已无登录令牌，不得再渲染任何档案区块。
  gate.resolve();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("张同学").count(), 0);
  assert.equal(await section(page, "my-dev-summary").count(), 0);
  assert.equal(await section(page, "my-dev-basic").count(), 0);
  assert.equal(state.meCalls, 1, "退出后不得再拉取档案");
});

test("离开页面后重新进入会自己重新拉取，不依赖旧实例的在途响应", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { freezeFirst: true, firstGate: gate } });
  await eventually(() => state.meCalls === 1);
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    // /resources 是未接接口的占位页，用它可以验证卸载而不引入其它业务请求。
    await router.push("/resources");
  });
  await eventually(async () => new URL(page.url()).pathname === "/resources");
  // 卸载后回到本页：新实例必须自己再请求一次，而不是等上一个实例的响应。
  state.freezeFirst = false;
  state.profile = profile({ basic: basic({ realName: "重新进入成员", studentId: "2023017777" }) });
  await page.evaluate(async () => {
    const { default: router } = await import("/src/router/index.ts");
    await router.push("/my-development");
  });
  await eventually(async () => (await page.getByText("重新进入成员").count()) === 1);
  assert.equal(state.meCalls, 2, "重新进入必须重新拉取本人档案");
  // 解冻上一个实例的响应：新版不得渲染旧数据（teardown 另断言零 pageerror）。
  gate.resolve();
  await page.waitForTimeout(300);
  assert.match(await section(page, "my-dev-basic").innerText(), /重新进入成员/);
  assert.equal(await page.getByText("张同学").count(), 0);
});

test("401 触发刷新后恰好重放一次本人档案请求", async (t) => {
  const { page, state } = await fixture(t, { state: { meUnauthorized: 1 } });
  await eventually(async () => (await section(page, "my-dev-summary").count()) === 1);
  const calls = meRequests(state);
  assert.equal(calls.length, 2);
  assert.equal(state.requests.filter((r) => r.path === "/api/v1/auth/refresh").length, 1);
  assert.equal(calls[0].authorization, "Bearer test-access");
  assert.equal(calls[1].authorization, "Bearer new-access");
  // 正常刷新不改页面身份，不得把页面推进无权限或错误态。
  assert.equal(await page.getByText("当前身份无权查看我的培养").count(), 0);
  assert.equal(await section(page, "my-dev-error").count(), 0);
});

test("无令牌的开发预览态显示需要登录且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { withToken: false, previewRole: "party_member" });
  await eventually(async () => (await page.locator(".el-alert").count()) > 0);
  assert.match(await page.locator(".el-alert").first().innerText(), /我的培养需要登录/);
  assert.match(await page.locator(".el-alert").first().innerText(), /不会请求真实培养档案/);
  await page.waitForTimeout(300);
  assert.equal(state.meCalls, 0, JSON.stringify(state.requests));
  assert.equal(await section(page, "my-dev-summary").count(), 0);
});

test("非本人角色直访被路由守卫拦回首页且不请求档案", async (t) => {
  const { page, state } = await fixture(t, { role: "super_admin" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  assert.match(await page.locator(".el-message").first().innerText(), /当前身份无权访问该页面/);
  await page.waitForTimeout(200);
  assert.equal(state.meCalls, 0, JSON.stringify(state.requests));
  assert.equal(await section(page, "my-dev-basic").count(), 0);
});

test("390px 窄屏不出现整页横向溢出，关键区块仍可读", async (t) => {
  const { page, state } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await eventually(async () => (await section(page, "my-dev-materials").count()) === 1);
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  const box = await section(page, "my-dev-summary").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= overflow.clientWidth + 1, JSON.stringify(box));
  assert.equal(state.meCalls, 1);
});

test("分页只切本地数据，不额外请求档案", async (t) => {
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
  const { page, state } = await fixture(t, { state: { profile: profile({ signRecords: many }) } });
  const signs = section(page, "my-dev-signs");
  await eventually(async () => (await signs.locator(".row-card").count()) === 5);
  assert.match(await signs.innerText(), /本地分页/);
  await signs.locator(".el-pager li").nth(1).click();
  await eventually(async () => (await signs.locator(".row-card").count()) === 5);
  assert.match(await signs.locator(".row-card").first().innerText(), /活动编号 205/);
  await page.waitForTimeout(200);
  assert.equal(state.meCalls, 1, "切页不得重复请求服务端");
});
