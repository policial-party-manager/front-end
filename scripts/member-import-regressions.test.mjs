import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// 在真实 /members 页面操作导入弹窗，只在 HTTP 边界做拦截；不读取组件私有状态。
// 注意：这里的接口 mock 只验证前端交互与反馈语义，不证明合成文件能被后端 Excel 解析。
let server;
let browser;
let baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/member-import-regressions-vite-${process.pid}`,
    server: { host: "127.0.0.1", port: 5185, strictPort: false },
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
const member = (id, name) => ({
  id,
  username: `user${id}`,
  realName: name,
  studentId: `2023${id}`,
  gender: null,
  college: null,
  grade: null,
  major: null,
  className: null,
  branchId: null,
  branchName: null,
  roleId: 7,
  role: "student",
  phone: null,
  email: null,
  contactPerson: null,
  remark: null,
  status: 1,
  createTime: null,
  lastLoginTime: null,
});
const ok = (route, data) => route.fulfill({ json: { code: 200, message: "ok", data } });

async function fixture(t, options = {}) {
  const context = await browser.newContext();
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "浏览器不应出现未处理的运行错误");
  });
  await context.addInitScript(
    ({ origin, role }) => {
      // 新页面初始 about:blank 没有存储权限，只初始化测试站点。
      if (location.origin !== origin) return;
      // 记录 CSV 等 Blob 下载内容（原始字节），并阻止真实下载落盘。
      const blobs = (window.__downloadedBlobs = window.__downloadedBlobs || []);
      const nativeCreate = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (value) => {
        if (value instanceof Blob) {
          void value.arrayBuffer().then((buffer) => blobs.push(Array.from(new Uint8Array(buffer))));
        }
        return nativeCreate(value);
      };
      const nativeClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function click() {
        if (this.hasAttribute("download")) return;
        return nativeClick.call(this);
      };
      if (localStorage.getItem("party_access_token")) return;
      localStorage.setItem("party_access_token", "test-access");
      localStorage.setItem("party_refresh_token", "test-refresh");
      localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role }));
    },
    { origin: baseURL, role: options.sessionRole || "super_admin" },
  );
  const page = await context.newPage();
  // 首个用例会触发 Vite 按需编译多个 SFC，默认超时过紧会导致冷启动偶发失败。
  page.setDefaultTimeout(12000);
  const state = {
    branches: options.branches ?? [
      { id: 1, branchName: "信息工程学院第一党支部" },
      { id: 2, branchName: "信息工程学院第二党支部" },
    ],
    branchFailures: options.branchFailures ?? 0,
    // 只挂起第一次支部选项请求，用于验证关闭重开后的旧响应隔离。
    branchGate: null,
    branchGateUsed: false,
    branchGatePayload: [{ id: 9, branchName: "关闭前的旧支部" }],
    branchStarted: false,
    pageFail: false,
    pageRequests: [],
    imports: [],
    importGate: null,
    importStarted: false,
    importAborts: 0,
    importStatus: 0,
    importMessage: "导入处理失败",
    importResult: { total: 2, successCount: 2, failCount: 0, errors: [] },
    refreshes: 0,
    listMembers: Array.from({ length: 3 }, (_, index) => member(101 + index, `成员${index + 1}`)),
    writes: [],
    unexpected: [],
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const url = new URL(request.url());
    if (path === "/api/v1/auth/refresh") {
      state.refreshes++;
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        username: "admin",
        realName: "管理员",
        role: "super_admin",
      });
    }
    if (path === "/api/v4/admin/branches/options") {
      if (state.branchGate && !state.branchGateUsed) {
        state.branchGateUsed = true;
        state.branchStarted = true;
        await state.branchGate.promise;
        return ok(route, state.branchGatePayload);
      }
      if (state.branchFailures > 0) {
        state.branchFailures--;
        return route.fulfill({ status: 500, json: { code: 500, message: "支部选项暂时不可用" } });
      }
      return ok(route, state.branches);
    }
    if (path === "/api/v4/admin/roles") return ok(route, [{ id: 7, roleCode: "student" }]);
    if (path === "/api/v4/admin/users/page") {
      state.pageRequests.push(Object.fromEntries(url.searchParams.entries()));
      if (state.pageFail) return route.fulfill({ status: 500, json: { code: 500, message: "成员列表加载失败" } });
      return ok(route, { records: state.listMembers, total: state.listMembers.length });
    }
    if (path === "/api/v4/admin/users/template") {
      return route.fulfill({ status: 200, contentType: "application/vnd.ms-excel", body: "template" });
    }
    if (path === "/api/v4/admin/users/import" && request.method() === "POST") {
      state.imports.push(request.postData() || "");
      if (state.importGate) {
        state.importStarted = true;
        await state.importGate.promise;
      }
      if (state.importAborts > 0) {
        state.importAborts--;
        return route.abort("failed");
      }
      if (state.importStatus === 401 && request.headers().authorization === "Bearer test-access") {
        return route.fulfill({ status: 401, json: { code: 401, message: "expired" } });
      }
      if (state.importStatus === 403) {
        return route.fulfill({ status: 403, json: { code: 403, message: "没有导入权限" } });
      }
      if (state.importStatus === 400) {
        return route.fulfill({ status: 400, json: { code: 400, message: state.importMessage } });
      }
      if (state.importStatus === 500) {
        return route.fulfill({ status: 500, json: { code: 500, message: "服务器内部错误" } });
      }
      return ok(route, state.importResult);
    }
    if (request.method() !== "GET") {
      state.writes.push({ path, body: request.postData() });
      return ok(route, null);
    }
    state.unexpected.push(path);
    return route.fulfill({ status: 404, json: { code: 404, message: "unexpected request" } });
  });
  await page.goto(`${baseURL}/members`);
  if (options.expectRedirect) return { page, state };
  await page.locator(".members-table").waitFor({ timeout: 15000 });
  await eventually(async () => (await page.locator(".members-table tbody tr").count()) === 3, "成员列表应已加载");
  return { page, state };
}

async function openImport(page) {
  await page.getByRole("button", { name: "Excel 导入", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excel 导入成员", exact: true });
  await dialog.waitFor();
  return dialog;
}
async function selectFile(dialog, name, bytes) {
  await dialog.locator('[data-testid="import-file-input"]').setInputFiles({
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes ?? Buffer.alloc(2048, 1),
  });
}
const messageCount = (page, type) => page.locator(`.el-message--${type}`).count();

test("导入弹窗展示填写规则与真实正常支部全名", async (t) => {
  const { page } = await fixture(t);
  const dialog = await openImport(page);
  // 首次加载时 Vite 需按需编译 SFC，支部选项可能晚于默认 6s 就绪，这里显式放宽等待。
  const list = dialog.locator('[data-testid="import-branch-list"]');
  await eventually(async () => (await list.count()) === 1, "支部核对列表应已渲染");
  const branchText = await list.innerText();
  assert.ok(branchText.includes("信息工程学院第一党支部"), "应展示完整支部名称而非截断");
  assert.ok(branchText.includes("信息工程学院第二党支部"));
  const text = await dialog.innerText();
  for (const expected of [
    "请先在",
    "支部管理",
    "正常支部",
    "首尾空格",
    "所属支部可以留空",
    "示例行",
    "不会覆盖已有成员",
    "部分成功后重新上传整个文件",
  ]) {
    assert.ok(text.includes(expected), `规则说明应包含「${expected}」`);
  }
  assert.ok(text.includes("共 2 个正常支部"), "应显示支部选项数量");
});

test("规则中的支部管理链接可用键盘聚焦并可跳转", async (t) => {
  const { page } = await fixture(t);
  const dialog = await openImport(page);
  const link = dialog.getByRole("button", { name: "支部管理", exact: true });
  await link.waitFor();
  await link.focus();
  assert.equal(await link.evaluate((node) => node === document.activeElement), true, "支部管理入口应可键盘聚焦");
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => new URL(url).pathname === "/branches");
  assert.equal(await page.locator(".branches-table").count(), 1);
});

test("支部选项加载失败提示无法核对并可刷新重试", async (t) => {
  const { page, state } = await fixture(t);
  state.branchFailures = 1;
  const dialog = await openImport(page);
  await eventually(async () => (await dialog.innerText()).includes("暂时无法核对支部名称"), "选项失败应提示无法核对");
  const failed = await dialog.innerText();
  assert.ok(!failed.includes("系统中暂无正常状态的支部"), "加载失败不得显示为没有支部");
  await dialog.getByRole("button", { name: "刷新", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("信息工程学院第一党支部"), "重试后应展示真实支部");
  await eventually(
    async () => !(await dialog.innerText()).includes("暂时无法核对支部名称"),
    "重试成功后应清除失败提示",
  );
  assert.equal(state.branchFailures, 0);
});

test("支部为空时说明可留空导入，且不会额外禁止提交", async (t) => {
  const { page, state } = await fixture(t, { branches: [] });
  const dialog = await openImport(page);
  await eventually(async () => (await dialog.innerText()).includes("系统中暂无正常状态的支部"), "空支部应有明确空状态");
  const text = await dialog.innerText();
  assert.ok(text.includes("所属支部留空"), "空支部应说明可留空导入");
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(() => state.imports.length === 1, "未分配支部的文件仍应允许提交");
});

test("未选文件、扩展名错误、空文件或超过 10 MB 均不发送导入请求", async (t) => {
  const { page, state } = await fixture(t);
  const dialog = await openImport(page);
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await messageCount(page, "warning")) === 1, "未选文件应给出提示");

  await selectFile(dialog, "成员导入.csv");
  await eventually(async () => (await messageCount(page, "warning")) === 2, "错误扩展名应被拒绝");
  assert.ok((await dialog.innerText()).includes("请选择 .xlsx 文件"), "拒绝后应清空无效选择");

  await selectFile(dialog, "空文件.xlsx", Buffer.alloc(0));
  await eventually(async () => (await messageCount(page, "warning")) === 3, "空文件应被拒绝");

  await selectFile(dialog, "超大文件.xlsx", Buffer.alloc(11 * 1024 * 1024, 1));
  await eventually(async () => (await messageCount(page, "warning")) === 4, "超过 10 MB 应被拒绝");

  assert.equal(state.imports.length, 0, "上述情况都不得发送 POST 导入请求");
});

test("全部失败给出失败反馈，不出现成功提示且保留原始行号", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = {
    total: 100,
    successCount: 0,
    failCount: 100,
    errors: [
      { row: 2, reason: "所属支部不存在（请先维护支部）" },
      { row: 101, reason: "学号已存在" },
    ],
  };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入失败"), "全部失败应有失败结论");
  assert.equal(await messageCount(page, "success"), 0, "全部失败不得弹出成功提示");
  assert.equal(await messageCount(page, "error"), 1, "全部失败应给出错误级别的反馈");
  const summary = await dialog.locator('[data-testid="import-result-summary"]').innerText();
  assert.ok(summary.includes("共 100 行，成功 0 行，失败 100 行"));
  const rows = await dialog.locator(".import-error-table tbody tr").allInnerTexts();
  assert.ok(rows[0].includes("2"), "应保留服务端返回的 Excel 行号 2");
  assert.ok(rows[1].includes("101"), "应保留服务端返回的 Excel 行号 101，不能按数组下标重新编号");
  assert.equal(state.pageRequests.length, 1, "全部失败不需要回读成员列表");
});

test("全成功提示成功并回读第一页成员列表", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = { total: 2, successCount: 2, failCount: 0, errors: [] };
  await page.locator(".filters input").first().fill("成员");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await eventually(() => state.pageRequests.at(-1)?.keyword === "成员", "筛选应生效");
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "全成功应有成功结论");
  assert.equal(await messageCount(page, "success"), 1);
  await eventually(() => state.pageRequests.at(-1)?.page === "1", "成功后应回到第一页回读列表");
  assert.equal(state.pageRequests.at(-1)?.keyword, "成员", "回读应保留已应用的筛选条件");
});

test("部分成功给出警告并说明成功行已写入", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = {
    total: 3,
    successCount: 2,
    failCount: 1,
    errors: [{ row: 4, reason: "手机号已存在" }],
  };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "部分成功应有警告结论");
  assert.equal(await messageCount(page, "success"), 0, "部分成功不得只提示成功");
  assert.equal(await messageCount(page, "warning"), 1);
  const text = await dialog.innerText();
  assert.ok(text.includes("已成功的成员已写入服务端"));
  assert.ok(text.includes("下载错误报告"));
});

test("文件中没有数据行时给出信息提示且不清零列表", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = { total: 0, successCount: 0, failCount: 0, errors: [] };
  const dialog = await openImport(page);
  await selectFile(dialog, "空数据.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("文件中没有可导入的数据行"), "零行应有信息提示");
  assert.equal(await messageCount(page, "info"), 1);
  assert.equal(state.pageRequests.length, 1, "零行结果不应触发列表回读");
});

test("提交失败不伪造计数、保留文件且不自动重试", async (t) => {
  const { page, state } = await fixture(t);
  state.importAborts = 1;
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("导入请求失败"), "网络失败应说明未获得结果");
  const text = await dialog.innerText();
  assert.ok(!/成功 \d+ 行/.test(text), "请求失败不得展示任何成功计数");
  assert.ok(text.includes("已保留所选文件"), "失败后应保留文件便于重试");
  assert.ok(text.includes("成员导入.xlsx"), "应保留已选文件名");
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0, "失败不得生成结果摘要");
  await page.waitForTimeout(300);
  assert.equal(state.imports.length, 1, "失败后不得自动重传");
});

test("服务端 4xx 明确拒绝时转达原因，不声称结果未知", async (t) => {
  const { page, state } = await fixture(t);
  // 真实后端对「只有表头」「表头与模板不一致」统一返回 HTTP 400 + 业务原因。
  state.importStatus = 400;
  state.importMessage = "Excel 中没有可导入的数据行（数据从第 2 行开始）";
  const dialog = await openImport(page);
  await selectFile(dialog, "只有表头.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("导入未执行"), "确定性拒绝应说明未执行");
  const text = await dialog.innerText();
  assert.ok(text.includes("Excel 中没有可导入的数据行"), "应原样转达服务端业务原因");
  assert.ok(!text.includes("尚未确认处理结果"), "确定性拒绝不得说成结果未知");
  assert.ok(!text.includes("已保留所选文件"), "确定性拒绝不需要按网络失败引导重试");
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0, "不得伪造计数");
  assert.equal(await messageCount(page, "success"), 0);
  assert.equal(state.imports.length, 1);
});

test("403 拒绝时按未执行处理且不显示成功", async (t) => {
  const { page, state } = await fixture(t);
  state.importStatus = 403;
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("导入未执行"), "403 应说明未执行");
  assert.equal(await messageCount(page, "success"), 0);
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0);
  assert.equal(state.imports.length, 1);
});

test("5xx 服务端故障按结果未知处理，不声称未写入", async (t) => {
  const { page, state } = await fixture(t);
  state.importStatus = 500;
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("导入请求失败"), "5xx 应按请求失败处理");
  const text = await dialog.innerText();
  assert.ok(!text.includes("导入未执行"), "5xx 不得断言服务端没有写入");
  assert.ok(text.includes("已保留所选文件"));
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0);
});

test("双击开始导入只发送一次逻辑请求", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  const button = dialog.getByRole("button", { name: "开始导入", exact: true });
  await button.click();
  await button.click({ force: true }).catch(() => undefined);
  await eventually(() => state.importStarted, "导入请求应已发出");
  await page.waitForTimeout(200);
  assert.equal(state.imports.length, 1, "双击只应产生一次导入请求");
  const submit = dialog.getByRole("button", { name: "开始导入", exact: true });
  assert.equal(await submit.isDisabled(), true, "导入中应禁用提交按钮");
  gate.resolve();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "解锁后应展示结果");
});

test("导入中阻止关闭弹窗，服务端响应前不展示结果", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(() => state.importStarted, "导入请求应已发出");
  assert.equal(await dialog.locator(".el-dialog__headerbtn").count(), 0, "导入中不提供关闭按钮");
  assert.equal(await dialog.getByRole("button", { name: "关闭", exact: true }).isDisabled(), true);
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0, "服务端未响应前不得展示结果");
  const waiting = dialog.locator('[data-testid="import-waiting"]');
  await waiting.waitFor();
  assert.ok((await waiting.innerText()).includes("服务端尚未返回处理结果"), "导入中应说明结果尚未返回");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await dialog.isVisible(), true, "导入中按 Escape 不得关闭弹窗");
  gate.resolve();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "响应后应展示结果");
  assert.equal(await waiting.count(), 0, "结果返回后应移除等待提示");
});

test("上传阶段结束前不展示任何结果结论", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(() => state.importStarted, "导入请求应已发出");
  // 只能断言真实可观测的约定：服务端未响应期间，既没有结果摘要，也没有成功/警告/错误消息，
  // 提交按钮保持禁用。上传进度条本身由浏览器事件驱动，拦截环境下不推进，不在此伪造。
  assert.equal(
    await dialog.locator('[data-testid="import-result-summary"]').count(),
    0,
    "服务端未响应时不得展示成功或失败结论",
  );
  assert.equal(await page.locator(".el-message--success").count(), 0, "未确认结果前不得提示成功");
  assert.equal(await page.locator(".el-message--warning").count(), 0, "未确认结果前不得提示部分成功");
  assert.equal(await dialog.getByRole("button", { name: "开始导入", exact: true }).isDisabled(), true);
  gate.resolve();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "响应后才展示结果");
});

test("成员列表回读失败时保留导入报告", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = { total: 2, successCount: 2, failCount: 0, errors: [] };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  state.pageFail = true;
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("成员列表回读失败"), "回读失败应有独立提示");
  const text = await dialog.innerText();
  assert.ok(text.includes("全部导入成功"), "回读失败不得把导入结果改成失败");
  assert.ok(text.includes("导入结果仍然有效"));
  assert.ok(text.includes("共 2 行，成功 2 行，失败 0 行"));
});

test("更换文件与关闭重开会清除上一份报告", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = {
    total: 1,
    successCount: 0,
    failCount: 1,
    errors: [{ row: 2, reason: "学号已存在" }],
  };
  const dialog = await openImport(page);
  await selectFile(dialog, "第一份.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入失败"), "第一份应有结果");
  await selectFile(dialog, "第二份.xlsx");
  await eventually(async () => (await dialog.innerText()).includes("第二份.xlsx"), "应显示新文件名");
  assert.equal(await dialog.locator('[data-testid="import-result-summary"]').count(), 0, "换文件应清除旧报告");
  assert.equal(await dialog.locator(".import-error-table").count(), 0, "换文件应清除旧错误表");

  state.importResult = { total: 1, successCount: 1, failCount: 0, errors: [] };
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "第二份应成功");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await eventually(async () => !(await dialog.isVisible()), "弹窗应关闭");
  await page.waitForTimeout(400);
  const reopened = await openImport(page);
  const text = await reopened.innerText();
  assert.ok(!text.includes("全部导入成功"), "重开不得显示上一份报告");
  assert.ok(text.includes("请选择 .xlsx 文件"), "重开应重置文件选择");
  const input = reopened.locator('[data-testid="import-file-input"]');
  assert.equal(await input.evaluate((node) => node.value), "", "原生文件输入应被重置，允许再次选择同名文件");
  assert.equal(state.imports.length, 2, "关闭重开不应产生额外导入请求");
});

test("下载错误报告保留服务端行号并正确转义", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = {
    total: 3,
    successCount: 1,
    failCount: 2,
    errors: [
      { row: 1000, reason: '学号,手机号"冲突"' },
      { row: 2, reason: "第一行\n第二行" },
    ],
  };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "应展示部分成功结果");
  await dialog.getByRole("button", { name: "下载错误报告", exact: true }).click();
  let csv = "";
  await eventually(async () => {
    const buffers = await page.evaluate(() => window.__downloadedBlobs || []);
    for (const bytes of buffers) {
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(Uint8Array.from(bytes));
      if (text.includes("行号,失败原因")) csv = text;
    }
    return csv !== "";
  }, "应生成 CSV 错误报告");
  assert.ok(csv.codePointAt(0) === 0xfeff, "CSV 应带 UTF-8 BOM");
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lines[0], "行号,失败原因");
  assert.ok(lines[1].startsWith('1000,"'), "应保留服务端原始行号 1000");
  assert.ok(lines[1].includes('""冲突""'), "双引号应转义为两个双引号");
  assert.ok(lines[2].startsWith('2,"'), "应保留服务端原始行号 2");
  assert.ok(!/\n/.test(lines[2].replace(/\r/, "")), "错误原因内的换行应被替换，不破坏 CSV 行结构");
});

test("同角色换号后关闭导入并隔离旧结果", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(() => state.importStarted, "旧会话导入应在途");
  await page.evaluate(async () => {
    (await import("/src/utils/session.ts")).applySession({
      accessToken: "another-access",
      refreshToken: "another-refresh",
      role: "super_admin",
      realName: "管理员",
    });
  });
  await eventually(async () => !(await dialog.isVisible()), "换号应关闭旧导入弹窗");
  gate.resolve();
  await page.waitForTimeout(500);
  const text = await page.locator("body").innerText();
  assert.ok(!text.includes("全部导入成功"), "旧会话的延迟结果不得展示");
  assert.ok(!text.includes("成员导入.xlsx"), "旧会话的文件不得残留");
  const reopened = await openImport(page);
  assert.equal(await reopened.locator('[data-testid="import-result-summary"]').count(), 0, "新会话不得继承旧结果");
});

test("退出登录后清除导入弹窗与旧报告", async (t) => {
  const { page, state } = await fixture(t);
  state.importResult = { total: 1, successCount: 1, failCount: 0, errors: [] };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "应先展示导入结果");
  await page.evaluate(async () => {
    (await import("/src/utils/session.ts")).clearSession();
  });
  await page.getByText("成员管理需要登录", { exact: true }).waitFor();
  const importDialog = page.getByRole("dialog", { name: "Excel 导入成员", exact: true });
  await eventually(
    async () => !(await importDialog.isVisible().catch(() => false)),
    "退出后不得保留上一个会话的导入弹窗",
  );
  assert.equal(
    await page.getByRole("button", { name: "Excel 导入", exact: true }).count(),
    0,
    "退出后不得继续发起导入",
  );
});

test("正常 401 刷新后保留文件并只展示一次导入结果", async (t) => {
  const { page, state } = await fixture(t);
  state.importStatus = 401;
  state.importResult = { total: 1, successCount: 1, failCount: 0, errors: [] };
  const dialog = await openImport(page);
  await selectFile(dialog, "成员导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("全部导入成功"), "刷新后应展示导入结果");
  assert.equal(state.refreshes, 1, "应通过请求层完成一次令牌刷新");
  assert.equal(state.imports.length, 2, "401 后只允许请求层重放同一次导入");
  assert.ok((await dialog.innerText()).includes("成员导入.xlsx"), "刷新后应保留所选文件");
  assert.equal(await messageCount(page, "error"), 0, "401 刷新重放不应给用户错误提示");
});

test("另一会话的延迟支部响应在关闭重开后不得回写", async (t) => {
  const { page, state } = await fixture(t);
  const gate = deferred();
  state.branchGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await eventually(() => state.branchStarted, "支部选项请求应在途");
  await dialog.locator(".el-dialog__headerbtn").click();
  await eventually(async () => !(await dialog.isVisible()), "弹窗应关闭");
  const reopened = await openImport(page);
  await eventually(async () => (await reopened.innerText()).includes("共 2 个正常支部"), "重开后应展示本次查询结果");
  gate.resolve();
  await eventually(async () => !(await reopened.innerText()).includes("关闭前的旧支部"), "旧响应不得回写新会话");
  assert.ok((await reopened.innerText()).includes("共 2 个正常支部"));
  assert.equal(await messageCount(page, "error"), 0, "旧请求不应产生错误提示");
});

test("重置筛选只清空查询条件，不发送删除或撤销请求", async (t) => {
  const { page, state } = await fixture(t);
  await page.locator(".filters input").first().fill("成员");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await eventually(() => state.pageRequests.at(-1)?.keyword === "成员", "筛选应生效");
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await eventually(() => state.pageRequests.at(-1)?.keyword === undefined, "重置后应重新查询全部成员");
  assert.equal(await page.locator(".filters input").first().inputValue(), "");
  assert.deepEqual(state.writes, [], "重置筛选不得发送任何写请求");
  assert.deepEqual(state.unexpected, [], "不应出现未预期的接口请求");
});

test("非超级管理员无法进入成员管理发起导入", async (t) => {
  const { page, state } = await fixture(t, { sessionRole: "party_member", expectRedirect: true });
  await page.waitForURL((url) => new URL(url).pathname === "/");
  assert.equal(await page.getByRole("button", { name: "Excel 导入", exact: true }).count(), 0);
  assert.equal(await page.locator(".members-table").count(), 0);
  assert.deepEqual(state.imports, [], "无权限账号不得发起导入");
});
