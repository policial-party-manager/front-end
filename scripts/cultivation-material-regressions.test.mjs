import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

/**
 * 培养联系人指派/移除 + 培养材料上传/登记/软删除 浏览器回归。
 *
 * 全部业务请求由本脚本拦截，不访问真实后端。锁定以下行为：
 * 档案页只请求一次 `/v4/cultivation-profiles/{userId}`（03/09 区块数据来自该响应，不额外请求列表端点）、
 * 指派候选来自真实分页接口而非手输编号、指派请求体精确为 `{ mentorId }`、
 * 三类服务端 400（超 2 名 / 非党员 / 不能指定本人）原文可见且不误报成功、
 * 指派成功后重新读取档案而不本地改写、移除走 `DELETE .../mentors/{mentorId}` 且确认文案说明当前关系语义、
 * 上传必须显式携带 `category=material`、上传失败零登记请求、登记失败保留 `file:` 路径且不重复上传、
 * 白名单外扩展名与超 10 MB 零业务请求并给字段级提示、材料类型下拉固定五项固定顺序、
 * 登记请求体含 `materialType`/`file`(`file:` 前缀)/`fileName`/`remark`、
 * 删除材料走软删除确认、服务端「材料不存在」原文可见、
 * 双击指派/上传/删除只发一次请求、页面不渲染 `file:` 路径也不生成下载控件、
 * 换号后旧响应不写回、普通成员被守卫拦截、无令牌预览零业务请求、390px 无整页横向溢出。
 */

let server, browser, baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/cultivation-material-${process.pid}`,
    server: { host: "127.0.0.1", port: 5203, strictPort: false },
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

/** 管理侧档案 `basic` 走 `buildVos`：只写 `branchId`/`identityId`，名称字段恒为 null。 */
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

const mentor = (mentorId, overrides = {}) => ({
  mentorId,
  realName: `联系人${mentorId}`,
  username: `m${mentorId}`,
  ...overrides,
});

const material = (id, overrides = {}) => ({
  id,
  userId: 12,
  materialType: "入党申请书",
  file: "file:material/2026/11/abc.pdf",
  fileName: "入党申请书.pdf",
  uploaderId: 21,
  remark: null,
  status: 1,
  createTime: "2026-06-12T11:20:00",
  ...overrides,
});

const profile = (overrides = {}) => ({
  basic: basic(),
  mentors: [mentor(21)],
  identityChanges: [],
  thoughtReports: [],
  signRecords: [],
  leaves: [],
  studyRecords: [],
  materials: [material(71)],
  summary: { thoughtReportCount: 0, thoughtReportApproved: 0, signCount: 0, studyMinutes: 0, materialCount: 1 },
  ...overrides,
});

/** 候选成员：分页接口返回 `UserVo`，`identityId` 可能为 null（尚未登记政治身份）。 */
const candidate = (id, overrides = {}) => ({
  ...basic(),
  id,
  username: `202301020${id}`,
  realName: `候选${id}`,
  studentId: `202301020${id}`,
  ...overrides,
});

const CANDIDATES = [candidate(31), candidate(32, { realName: "候选乙" }), candidate(33, { identityId: null })];

const PROFILE_ENTRY = /^\/api\/v4\/cultivation-profiles\/\d+$/;
const MENTORS_ENTRY = /^\/api\/v4\/members\/(\d+)\/mentors$/;
const MENTOR_ENTRY = /^\/api\/v4\/members\/(\d+)\/mentors\/(\d+)$/;
const MATERIALS_ENTRY = /^\/api\/v4\/members\/(\d+)\/materials$/;
const MATERIAL_ENTRY = /^\/api\/v4\/members\/(\d+)\/materials\/(\d+)$/;

/** 允许出现的业务请求；白名单外的请求一律 abort 并计入 unexpected。 */
const ALLOWED_PATHS = new Set([
  "/api/v4/members/page",
  "/api/v4/uploads",
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
    /** 档案响应；键为成员编号，缺省回退到 `defaultProfile`。 */
    profiles: {},
    defaultProfile: profile(),
    profileCalls: 0,
    profileGates: {},
    /** 指派候选分页。 */
    candidates: CANDIDATES,
    candidateFail: false,
    /** 指派/移除。 */
    assignCalls: [],
    assignError: null,
    removeMentorCalls: [],
    removeMentorError: null,
    /** 上传与登记。 */
    uploadCalls: [],
    uploadError: null,
    registerCalls: [],
    registerError: null,
    removeMaterialCalls: [],
    removeMaterialError: null,
    assignGate: null,
    ...options.state,
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const entry = { path, method, params: Object.fromEntries(url.searchParams), search: url.search };
    const allowed =
      ALLOWED_PATHS.has(path) ||
      PROFILE_ENTRY.test(path) ||
      MENTORS_ENTRY.test(path) ||
      MENTOR_ENTRY.test(path) ||
      MATERIALS_ENTRY.test(path) ||
      MATERIAL_ENTRY.test(path);
    if (!allowed) {
      unexpected.push(`${method} ${path}`);
      return route.abort();
    }
    state.requests.push(entry);

    if (path === "/api/v2/content/news/page" || path === "/api/v2/content/notices/page")
      return ok(route, { records: [], total: 0 });
    if (path === "/api/v1/auth/refresh")
      return ok(route, { accessToken: "new-access", refreshToken: "new-refresh", role: "super_admin", username: "me" });

    if (path === "/api/v4/members/page") {
      if (state.candidateFail) return fail(route, 500, "成员服务暂时不可用");
      const records = state.candidates;
      return ok(route, { records, total: records.length });
    }

    if (PROFILE_ENTRY.test(path)) {
      state.profileCalls++;
      const userId = path.split("/").at(-1);
      // 先取快照再等闸门：迟到响应必须是「当时」的数据。
      const body = state.profiles[userId] ?? state.defaultProfile;
      const gate = state.profileGates[state.profileCalls];
      if (gate) await gate.promise;
      return ok(route, body);
    }

    if (MENTORS_ENTRY.test(path) && method === "POST") {
      state.assignCalls.push({ path, body: req.postDataJSON(), search: url.search });
      if (state.assignGate) await state.assignGate.promise;
      if (state.assignError) return fail(route, 400, state.assignError);
      return ok(route, null);
    }

    if (MENTOR_ENTRY.test(path) && method === "DELETE") {
      state.removeMentorCalls.push({ path });
      if (state.removeMentorError) return fail(route, 400, state.removeMentorError);
      return ok(route, null);
    }

    if (path === "/api/v4/uploads" && method === "POST") {
      state.uploadCalls.push({ path, method, body: req.postData() ?? "" });
      if (state.uploadError) return fail(route, 400, state.uploadError);
      return ok(route, {
        url: "file:material/2026/11/uploaded.pdf",
        originalName: "申请书.pdf",
        size: 2048,
      });
    }

    if (MATERIALS_ENTRY.test(path) && method === "POST") {
      state.registerCalls.push({ path, body: req.postDataJSON(), search: url.search });
      if (state.registerError) return fail(route, 400, state.registerError);
      return ok(route, 99);
    }

    if (MATERIAL_ENTRY.test(path) && method === "DELETE") {
      state.removeMaterialCalls.push({ path });
      if (state.removeMaterialError) return fail(route, 400, state.removeMaterialError);
      return ok(route, null);
    }

    unexpected.push(`${method} ${path}`);
    return route.abort();
  });
  await page.goto(`${baseURL}${options.path || "/development/member/12"}`);
  return { page, state, context };
}

const section = (page, testId) => page.getByTestId(testId);
const assigns = (state) => state.requests.filter((r) => MENTORS_ENTRY.test(r.path) && r.method === "POST");
const mentorDeletes = (state) => state.requests.filter((r) => MENTOR_ENTRY.test(r.path) && r.method === "DELETE");
const uploads = (state) => state.uploadCalls;
const registers = (state) => state.registerCalls;
const materialDeletes = (state) => state.requests.filter((r) => MATERIAL_ENTRY.test(r.path) && r.method === "DELETE");
const candidateRequests = (state) => state.requests.filter((r) => r.path === "/api/v4/members/page");

async function waitProfile(page) {
  await eventually(async () => (await section(page, "dev-profile-mentors").count()) === 1);
}

/** 打开指派弹窗并等候选就绪。 */
async function openMentorDialog(page) {
  await waitProfile(page);
  await section(page, "mentor-assign-open").click();
  await eventually(async () => (await section(page, "mentor-assign-select").count()) === 1);
  await eventually(async () => (await section(page, "mentor-assign-select").locator("input").isDisabled()) === false);
}

/** 选候选成员：候选来自分页接口，这里点下拉项而不是输入编号。 */
async function pickCandidate(page, name) {
  await section(page, "mentor-assign-select").click();
  const option = page.locator(".el-select-dropdown__item", { hasText: name }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

async function waitMessageBox(page) {
  await eventually(async () => (await page.locator(".el-message-box").count()) > 0);
  return page.locator(".el-message-box");
}

/** 打开发材料弹窗。 */
async function openMaterialDialog(page) {
  await waitProfile(page);
  await section(page, "material-upload-open").click();
  await eventually(async () => (await section(page, "material-upload-file").count()) === 1);
}

async function selectMaterialType(page, name) {
  await section(page, "material-upload-type").click();
  const option = page.locator(".el-select-dropdown__item", { hasText: name }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
}

async function chooseMaterialFile(page, name, buffer) {
  await section(page, "material-upload-file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: buffer ?? Buffer.from("%PDF-1.4\n测试材料内容\n%%EOF"),
  });
}

/**
 * 双击同一个按钮：先摘掉 `disabled`（Element Plus 会把 loading/disabled 落到 DOM 上，
 * 光靠它无法证明代码层防重），再在同一事件循环内派发两次 click。
 */
async function doubleClickTestId(page, testId) {
  await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`);
    if (!button) throw new Error(`找不到按钮 ${id}`);
    button.removeAttribute("disabled");
    button.classList.remove("is-disabled");
    button.click();
    button.click();
  }, testId);
}

async function switchAccount(page, role = "super_admin") {
  const backendRole = role === "party_secretary" ? "branch_admin" : role;
  await page.evaluate(async (nextRole) => {
    const s = await import("/src/utils/session.ts");
    s.applySession({ accessToken: "other", refreshToken: "other-refresh", role: nextRole, username: "other" });
  }, backendRole);
}

// ============================ 读路径 ============================

test("档案页只请求一次档案，03/09 数据来自该响应而非列表端点", async (t) => {
  const { page, state } = await fixture(t);
  await waitProfile(page);
  assert.equal(state.profileCalls, 1);
  assert.deepEqual(
    state.requests.filter((r) => PROFILE_ENTRY.test(r.path)).map((r) => r.search),
    [""],
  );
  // 联系人与材料只来自聚合档案，不额外请求 `GET /mentors`、`GET /materials`。
  assert.equal(assigns(state).length, 0);
  assert.equal(registers(state).length, 0);
  assert.equal(await page.getByTestId("dev-profile-mentors").locator(".row-card").count(), 1);
  assert.match(await section(page, "dev-profile-mentors").innerText(), /联系人21/);
  assert.match(await section(page, "dev-profile-mentors").innerText(), /当前生效关系，不是历史快照/);
  assert.match(await section(page, "dev-profile-materials").innerText(), /入党申请书\.pdf/);
});

// ============================ 指派 ============================

test("指派候选来自真实分页接口，不支持手输成员编号", async (t) => {
  const { page, state } = await fixture(t);
  await openMentorDialog(page);
  const calls = candidateRequests(state);
  assert.equal(calls.length, 1);
  // 首屏不传关键词，只传分页与启用状态；范围由服务端裁决。
  assert.deepEqual(calls[0].params, { page: "1", size: "20", status: "1" });
  for (const key of ["branchId", "userId", "scope"]) assert.equal(key in calls[0].params, false);
  await section(page, "mentor-assign-select").click();
  const options = page.locator(".el-select-dropdown__item");
  await eventually(async () => (await options.count()) === CANDIDATES.length);
  assert.match(await options.first().innerText(), /候选31/);
  // 弹窗里没有「成员编号」输入框：只能从真实候选里选。
  assert.equal(await page.locator('.el-dialog input[placeholder*="编号"]').count(), 0);
});

test("指派请求体精确为 mentorId，路径含当前成员编号", async (t) => {
  const { page, state } = await fixture(t);
  await openMentorDialog(page);
  await pickCandidate(page, "候选乙");
  await section(page, "mentor-assign-submit").click();
  await eventually(() => state.assignCalls.length === 1);
  const call = state.assignCalls[0];
  assert.equal(call.path, "/api/v4/members/12/mentors");
  assert.deepEqual(call.body, { mentorId: 32 });
  assert.equal(call.search, "", "指派请求不得带查询参数");
});

test("「每位成员最多设置 2 名培养联系人」原文可见且不误报成功", async (t) => {
  const { page, state } = await fixture(t, {
    state: {
      defaultProfile: profile({ mentors: [mentor(21), mentor(22)] }),
      assignError: "每位成员最多设置 2 名培养联系人",
    },
  });
  await openMentorDialog(page);
  // 已满 2 名时给出上限说明，但仍允许提交（由服务端裁决）。
  assert.match(await section(page, "mentor-assign-full").innerText(), /每位成员最多设置 2 名培养联系人/);
  await pickCandidate(page, "候选乙");
  await section(page, "mentor-assign-submit").click();
  await eventually(async () => (await section(page, "mentor-assign-submit-error").count()) === 1);
  assert.match(await section(page, "mentor-assign-submit-error").innerText(), /每位成员最多设置 2 名培养联系人/);
  assert.equal(await page.locator(".el-message--success").count(), 0);
  // 失败保留已选成员，便于换成其他人后重试。
  assert.match(await section(page, "mentor-assign-selected").innerText(), /候选乙/);
  assert.equal(state.profileCalls, 1, "失败不得重新拉取档案");
});

test("「培养联系人须为党员（预备党员或正式党员）」原文可见", async (t) => {
  const { page } = await fixture(t, {
    state: { assignError: "培养联系人须为党员（预备党员或正式党员）" },
  });
  await openMentorDialog(page);
  await pickCandidate(page, "候选乙");
  await section(page, "mentor-assign-submit").click();
  await eventually(async () => (await section(page, "mentor-assign-submit-error").count()) === 1);
  assert.match(
    await section(page, "mentor-assign-submit-error").innerText(),
    /培养联系人须为党员（预备党员或正式党员）/,
  );
  assert.equal(await page.locator(".el-message--success").count(), 0);
});

test("「不能指定本人为培养联系人」原文可见", async (t) => {
  const { page } = await fixture(t, {
    state: { assignError: "不能指定本人为培养联系人" },
  });
  await openMentorDialog(page);
  await pickCandidate(page, "候选乙");
  await section(page, "mentor-assign-submit").click();
  await eventually(async () => (await section(page, "mentor-assign-submit-error").count()) === 1);
  assert.match(await section(page, "mentor-assign-submit-error").innerText(), /不能指定本人为培养联系人/);
  assert.equal(await page.locator(".el-message--success").count(), 0);
});

test("指派成功后重新请求档案，列表以服务端数据为准（不做本地改写）", async (t) => {
  const { page, state } = await fixture(t);
  await openMentorDialog(page);
  await pickCandidate(page, "候选乙");
  // 服务端的「下一次」档案才是新关系；本地不改写，只看它。
  state.defaultProfile = profile({ mentors: [mentor(21), mentor(32, { realName: "候选乙" })] });
  await section(page, "mentor-assign-submit").click();
  await eventually(() => state.profileCalls === 2);
  await eventually(async () => (await section(page, "dev-profile-mentors").innerText()).includes("候选乙"));
  assert.equal(state.profileCalls, 2);
  assert.equal(await section(page, "dev-profile-mentors").locator(".row-card").count(), 2);
  assert.equal(await section(page, "mentor-assign-select").count(), 0, "成功后弹窗关闭");
});

test("移除联系人：确认文案说明当前关系语义，走 DELETE .../mentors/{mentorId}", async (t) => {
  const { page, state } = await fixture(t);
  await waitProfile(page);
  await section(page, "mentor-remove-21").click();
  const box = await waitMessageBox(page);
  const text = await box.locator(".el-message-box__message").innerText();
  assert.match(text, /历史思想汇报的所属联系人随之变化/);
  await box.locator(".el-button--primary").click();
  await eventually(() => mentorDeletes(state).length === 1);
  assert.equal(mentorDeletes(state)[0].path, "/api/v4/members/12/mentors/21");
  await eventually(() => state.profileCalls === 2);
});

test("「培养联系人不存在」原文可见", async (t) => {
  const { page, state } = await fixture(t, { state: { removeMentorError: "培养联系人不存在" } });
  await waitProfile(page);
  await section(page, "mentor-remove-21").click();
  const box = await waitMessageBox(page);
  await box.locator(".el-button--primary").click();
  await eventually(async () => (await page.locator(".el-message--error").count()) > 0);
  const texts = await page.locator(".el-message--error").allInnerTexts();
  assert.ok(
    texts.some((item) => item.includes("培养联系人不存在")),
    texts.join(" | "),
  );
  assert.equal(state.profileCalls, 1, "失败不得重新拉取档案");
});

// ============================ 上传与登记 ============================

test("上传请求为 POST /v4/uploads 且必须携带 category=material", async (t) => {
  const { page, state } = await fixture(t);
  await openMaterialDialog(page);
  await selectMaterialType(page, "入党申请书");
  await chooseMaterialFile(page, "申请书.pdf");
  await section(page, "material-upload-submit").click();
  await eventually(() => uploads(state).length === 1);
  const call = uploads(state)[0];
  assert.equal(call.method, "POST");
  // multipart 文本部分：漏传 category 后端会静默落到 thought 目录，因此这里必须精确断言。
  assert.match(call.body, /name="file"/);
  assert.match(call.body, /name="category"[\s\S]{0,8}material/);
});

test("上传失败时零登记请求（第一步失败短路）", async (t) => {
  const { page, state } = await fixture(t, { state: { uploadError: "附件保存失败，请重试" } });
  await openMaterialDialog(page);
  await selectMaterialType(page, "思想汇报");
  await chooseMaterialFile(page, "汇报.pdf");
  await section(page, "material-upload-submit").click();
  await eventually(async () => (await section(page, "material-upload-error").count()) === 1);
  assert.match(await section(page, "material-upload-error").innerText(), /附件保存失败/);
  assert.equal(uploads(state).length, 1);
  assert.equal(registers(state).length, 0, "上传失败绝不能调登记接口");
  assert.equal(await page.locator(".el-message--success").count(), 0);
});

test("登记失败保留 file: 路径并提示重试登记，且不重复上传", async (t) => {
  const { page, state } = await fixture(t, { state: { registerError: "材料类型不合法" } });
  await openMaterialDialog(page);
  await selectMaterialType(page, "政审材料");
  await chooseMaterialFile(page, "政审.pdf");
  await section(page, "material-upload-submit").click();
  await eventually(async () => (await section(page, "material-register-error").count()) === 1);
  const errorText = await section(page, "material-register-error").innerText();
  assert.match(errorText, /文件已上传但登记失败/);
  assert.match(errorText, /不会重复上传/);
  assert.equal(await page.locator(".el-message--success").count(), 0);
  // 已上传标记仍在：路径被保留，没有静默丢弃。
  assert.equal(await section(page, "material-upload-uploaded").count(), 1);

  // 重试只重发登记：uploads 计数保持 1。
  state.registerError = null;
  await section(page, "material-upload-submit").click();
  await eventually(() => registers(state).length === 2);
  assert.equal(uploads(state).length, 1, "重试登记不得重新上传");
  await eventually(() => state.profileCalls === 2);
});

test("登记请求体含 materialType/file(file: 前缀)/fileName/remark", async (t) => {
  const { page, state } = await fixture(t);
  await openMaterialDialog(page);
  await selectMaterialType(page, "培训证书");
  await chooseMaterialFile(page, "证书.pdf");
  await section(page, "material-upload-remark").fill("党课结业证书");
  await section(page, "material-upload-submit").click();
  await eventually(() => registers(state).length === 1);
  const call = registers(state)[0];
  assert.equal(call.path, "/api/v4/members/12/materials");
  assert.deepEqual(call.body, {
    materialType: "培训证书",
    file: "file:material/2026/11/uploaded.pdf",
    fileName: "证书.pdf",
    remark: "党课结业证书",
  });
  assert.ok(call.body.file.startsWith("file:"), "file 必须是服务端返回的 file: 路径");
  assert.equal(call.search, "");
});

test("白名单外扩展名与超 10 MB 零业务请求并给字段级提示", async (t) => {
  const { page, state } = await fixture(t);
  await openMaterialDialog(page);
  await selectMaterialType(page, "其他");
  // 非白名单扩展名
  await chooseMaterialFile(page, "说明.txt", Buffer.from("纯文本"));
  await eventually(async () => (await page.locator(".el-form-item__error").count()) > 0);
  assert.match(await page.locator(".el-form-item__error").first().innerText(), /仅支持/);
  // 超过 10 MB
  await chooseMaterialFile(page, "大文件.pdf", Buffer.alloc(10 * 1024 * 1024 + 1024, 1));
  await eventually(async () => (await page.locator(".el-form-item__error").count()) > 0);
  assert.match(await page.locator(".el-form-item__error").first().innerText(), /10 MB/);
  // 文件被清空后提交按钮不可用，进一步保证零请求。
  assert.equal(await section(page, "material-upload-submit").isDisabled(), true);
  await page.waitForTimeout(300);
  assert.equal(uploads(state).length, 0, "预检失败不得上传");
  assert.equal(registers(state).length, 0, "预检失败不得登记");
});

test("材料类型下拉固定五项与固定顺序，不依赖后端文案", async (t) => {
  const { page } = await fixture(t);
  await openMaterialDialog(page);
  await section(page, "material-upload-type").click();
  const options = page.locator(".el-select-dropdown__item");
  await eventually(async () => (await options.count()) === 5);
  assert.deepEqual(await options.allInnerTexts(), ["入党申请书", "思想汇报", "政审材料", "培训证书", "其他"]);
  // 不能自由输入新的类型。
  assert.equal(await page.locator('[data-testid="material-upload-type"] input[allow-create]').count(), 0);
});

// ============================ 删除材料 ============================

test("删除材料走软删除确认并调用 DELETE .../materials/{id}", async (t) => {
  const { page, state } = await fixture(t);
  await waitProfile(page);
  await section(page, "material-remove-71").click();
  const box = await waitMessageBox(page);
  const text = await box.locator(".el-message-box__message").innerText();
  assert.match(text, /不再出现在列表中/);
  assert.match(text, /软删除/);
  assert.match(text, /记录与文件都保留/);
  await box.locator(".el-button--primary").click();
  await eventually(() => materialDeletes(state).length === 1);
  assert.equal(materialDeletes(state)[0].path, "/api/v4/members/12/materials/71");
  await eventually(() => state.profileCalls === 2);
});

test("「材料不存在」原文可见", async (t) => {
  const { page, state } = await fixture(t, { state: { removeMaterialError: "材料不存在" } });
  await waitProfile(page);
  await section(page, "material-remove-71").click();
  const box = await waitMessageBox(page);
  await box.locator(".el-button--primary").click();
  await eventually(async () => (await page.locator(".el-message--error").count()) > 0);
  const texts = await page.locator(".el-message--error").allInnerTexts();
  assert.ok(
    texts.some((item) => item.includes("材料不存在")),
    texts.join(" | "),
  );
  assert.equal(state.profileCalls, 1);
});

// ============================ 防重复 ============================

test("双击指派只发一次请求", async (t) => {
  const { page, state } = await fixture(t);
  await openMentorDialog(page);
  await pickCandidate(page, "候选乙");
  await doubleClickTestId(page, "mentor-assign-submit");
  await eventually(() => state.assignCalls.length >= 1);
  await page.waitForTimeout(300);
  assert.equal(state.assignCalls.length, 1);
});

test("双击上传并登记只发一次上传与一次登记", async (t) => {
  const { page, state } = await fixture(t);
  await openMaterialDialog(page);
  await selectMaterialType(page, "思想汇报");
  await chooseMaterialFile(page, "汇报.pdf");
  await doubleClickTestId(page, "material-upload-submit");
  await eventually(() => registers(state).length >= 1);
  await page.waitForTimeout(300);
  assert.equal(uploads(state).length, 1);
  assert.equal(registers(state).length, 1);
});

test("双击删除按钮只弹一个确认框、只发一次 DELETE", async (t) => {
  const { page, state } = await fixture(t);
  await waitProfile(page);
  await doubleClickTestId(page, "mentor-remove-21");
  await eventually(async () => (await page.locator(".el-message-box").count()) > 0);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".el-message-box").count(), 1, "只能弹出一个确认框");
  const box = await page.locator(".el-message-box").first();
  await box.locator(".el-button--primary").click();
  await eventually(() => mentorDeletes(state).length >= 1);
  await page.waitForTimeout(300);
  assert.equal(mentorDeletes(state).length, 1);
});

// ============================ 边界与防线 ============================

test("页面不渲染 file: 路径、不生成下载或预览控件，说明文字保留", async (t) => {
  const { page } = await fixture(t, {
    state: { defaultProfile: profile({ materials: [material(71, { file: "file:material/2026/11/secret.pdf" })] }) },
  });
  await waitProfile(page);
  const text = await section(page, "dev-profile-materials").innerText();
  assert.match(text, /不提供下载或预览/);
  assert.doesNotMatch(text, /file:/);
  assert.doesNotMatch(text, /secret\.pdf/);
  assert.equal(await section(page, "dev-profile-materials").locator("a").count(), 0);
  assert.equal(await page.locator('a[href*="file:"]').count(), 0);
  assert.equal(await page.locator("[download]").count(), 0);
});

test("更换账号后旧会话的迟到档案响应不写回", async (t) => {
  const gate = delay();
  const { page, state } = await fixture(t, { state: { profileGates: { 1: gate } } });
  await eventually(() => state.profileCalls === 1);
  state.defaultProfile = profile({ mentors: [mentor(21, { realName: "新会话联系人" })] });
  await switchAccount(page, "super_admin");
  await eventually(async () => (await section(page, "dev-profile-mentors").innerText()).includes("新会话联系人"));
  gate.resolve();
  await page.waitForTimeout(300);
  const text = await section(page, "dev-profile-mentors").innerText();
  assert.match(text, /新会话联系人/);
});

test("普通成员直访被守卫拦回首页且零业务请求", async (t) => {
  const { page, state } = await fixture(t, { role: "party_member" });
  await eventually(async () => new URL(page.url()).pathname === "/");
  await page.waitForTimeout(300);
  assert.deepEqual(
    state.requests.filter((r) => !r.path.startsWith("/api/v2/content/")),
    [],
  );
  assert.equal(await section(page, "dev-profile-mentors").count(), 0);
});

test("无令牌的开发预览态零业务请求，两个写入口都不渲染", async (t) => {
  const { page, state } = await fixture(t, { withToken: false, previewRole: "super_admin" });
  await eventually(async () => (await page.locator(".el-alert").count()) > 0);
  assert.match(await page.locator(".el-alert").first().innerText(), /需要登录/);
  await page.waitForTimeout(300);
  assert.deepEqual(state.requests, []);
  assert.equal(await section(page, "mentor-assign-open").count(), 0);
  assert.equal(await section(page, "material-upload-open").count(), 0);
});

test("390px 窄屏不出现整页横向溢出，两个写入口仍可用", async (t) => {
  const { page } = await fixture(t, { viewport: { width: 390, height: 844 } });
  await waitProfile(page);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  );
  assert.equal(await section(page, "mentor-assign-open").count(), 1);
  assert.equal(await section(page, "material-upload-open").count(), 1);
  await openMentorDialog(page);
  const dialogOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(dialogOverflow.scrollWidth <= dialogOverflow.clientWidth + 1);
});
