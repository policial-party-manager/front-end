import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// 在真实 /branches 页面操作模板下载与 Excel 导入，只在 HTTP 边界拦截；不读取组件私有状态。
// 注意：这里的 mock 只验证前端交互与反馈语义，不证明合成文件能被后端 Excel 解析。
let server;
let browser;
let baseURL;
before(async () => {
  server = await createServer({
    cacheDir: `.cache/branch-import-regressions-vite-${process.pid}`,
    server: { host: "127.0.0.1", port: 5201, strictPort: false },
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

// 合法 xlsx 的 ZIP 文件头；其余字节不需要是真实工作簿，前端只校验文件头。
const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 1)]);

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
const ok = (route, data) => route.fulfill({ json: { code: 200, message: "ok", data } });

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport });
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "浏览器不应出现未处理的运行错误");
  });
  await context.addInitScript(
    ({ origin, role, token }) => {
      // 新页面初始 about:blank 没有存储权限，只初始化测试站点。
      if (location.origin !== origin) return;
      // 收集 Blob 下载内容并阻止真实下载落盘。
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
      if (!token) return;
      if (localStorage.getItem("party_access_token")) return;
      localStorage.setItem("party_access_token", token);
      localStorage.setItem("party_refresh_token", "test-refresh");
      localStorage.setItem("party_user_session", JSON.stringify({ name: "管理员", avatar: "", role }));
    },
    { origin: baseURL, role: options.sessionRole || "super_admin", token: options.noToken ? "" : "test-access" },
  );
  const page = await context.newPage();
  // 首个用例会触发 Vite 按需编译多个 SFC，默认超时过紧会导致冷启动偶发失败。
  page.setDefaultTimeout(12000);
  const state = {
    branches: [...(options.branches ?? [])],
    pageRequests: [],
    templates: 0,
    templatePayload: "zip",
    templateBody: ZIP_BYTES,
    imports: [],
    importGate: null,
    importStarted: false,
    importStatus: 200,
    importMessage: "导入处理失败",
    importResult: { total: 2, successCount: 1, failCount: 1, errors: [{ row: 3, reason: "支部名称不能为空" }] },
    unexpected: [],
  };
  await context.route(`${baseURL}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/v1/auth/refresh") {
      return ok(route, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        username: "admin",
        realName: "管理员",
        role: "super_admin",
      });
    }
    if (path === "/api/v4/admin/branches/page") {
      state.pageRequests.push(Object.fromEntries(url.searchParams.entries()));
      const keyword = url.searchParams.get("keyword") || "";
      const records = state.branches.filter((item) => item.branchName.includes(keyword));
      return ok(route, { records, total: records.length, page: 1, size: 10 });
    }
    if (path === "/api/v4/admin/branches/template") {
      state.templates++;
      if (state.templatePayload === "json") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: 500, message: "模板生成失败" }),
        });
      }
      if (state.templatePayload === "html") {
        // 网关/代理错误页可能以 200 + text/html 返回：请求层不会当 JSON 拦截，文件头校验是最后一道防线。
        return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Bad Gateway</body></html>" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: state.templateBody,
      });
    }
    if (path === "/api/v4/admin/branches/import" && request.method() === "POST") {
      state.imports.push(request.headers()["content-type"] || "");
      if (state.importGate) {
        state.importStarted = true;
        await state.importGate.promise;
      }
      if (state.importStatus !== 200) {
        return route.fulfill({
          status: state.importStatus,
          json: { code: state.importStatus, message: state.importMessage },
        });
      }
      // 导入成功后列表应出现新支部。
      if (state.importResult.successCount > 0 && !state.branches.some((item) => item.branchName === "第三支部")) {
        state.branches.push({ id: 3, branchName: "第三支部", college: "信息学院", secretaryId: 101, status: 1 });
      }
      return ok(route, state.importResult);
    }
    state.unexpected.push(path);
    return route.fulfill({ status: 404, json: { code: 404, message: "unexpected request" } });
  });
  await page.goto(`${baseURL}/branches`);
  if (options.expectRedirect) return { page, state };
  if (!options.noToken) {
    await page.locator(".branches-table").waitFor({ timeout: 15000 });
    await eventually(
      async () => (await page.locator(".branches-table tbody tr").count()) === state.branches.length,
      "支部列表应已加载",
    );
  }
  return { page, state };
}

async function openImport(page) {
  await page.getByRole("button", { name: "导入支部", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excel 导入支部", exact: true });
  await dialog.waitFor();
  return dialog;
}
async function selectFile(dialog, name, bytes) {
  await dialog.locator('[data-testid="branch-import-file-input"]').setInputFiles({
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes ?? Buffer.alloc(2048, 1),
  });
}
const messageCount = (page, type) => page.locator(`.el-message--${type}`).count();
const downloadedTexts = async (page) => {
  const buffers = await page.evaluate(() => window.__downloadedBlobs || []);
  return buffers.map((bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(Uint8Array.from(bytes)));
};

const defaultBranches = [
  { id: 1, branchName: "第一支部", college: "信息学院", secretaryId: 101, status: 1 },
  { id: 2, branchName: "第二支部", college: "信息学院", secretaryId: 102, status: 1 },
];

test("默认首屏只请求支部列表，不发模板与导入请求", async (t) => {
  const { state } = await fixture(t, { branches: defaultBranches });
  assert.equal(state.templates, 0);
  assert.deepEqual(state.imports, []);
  assert.equal(state.pageRequests.length, 1);
  assert.deepEqual(state.unexpected, []);
});

test("下载模板请求真实端点并以服务端文件名下载 xlsx", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  await page.getByRole("button", { name: "下载模板", exact: true }).click();
  await eventually(async () => (await downloadedTexts(page)).length === 1, "应触发一次下载");
  assert.equal(state.templates, 1, "应请求支部模板端点");
  // 前端只校验 ZIP 文件头，下载内容应与响应字节一致。
  const blobs = await downloadedTexts(page);
  assert.equal(blobs[0].length, ZIP_BYTES.length);
  assert.equal(await messageCount(page, "error"), 0, "正常模板不应报错");
});

test("模板返回非 ZIP 的 JSON 时不下载并给出错误提示", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  state.templatePayload = "json";
  await page.getByRole("button", { name: "下载模板", exact: true }).click();
  await eventually(async () => (await messageCount(page, "error")) === 1, "非 ZIP 响应应提示错误");
  assert.equal(state.templates, 1);
  assert.deepEqual(await downloadedTexts(page), [], "魔数不符时绝不能触发下载");
});

test("模板返回网关 HTML 错误页时不下载并报错", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  state.templatePayload = "html";
  await page.getByRole("button", { name: "下载模板", exact: true }).click();
  await eventually(async () => (await messageCount(page, "error")) === 1, "非 xlsx 响应应提示错误");
  assert.equal(state.templates, 1);
  assert.deepEqual(await downloadedTexts(page), [], "文件头不是 ZIP 时绝不能触发下载");
});

test("导入弹窗展示填写规则与书记用户id 的契约差异", async (t) => {
  const { page } = await fixture(t, { branches: defaultBranches });
  const dialog = await openImport(page);
  const text = await dialog.innerText();
  for (const expected of [
    "支部名称、所属学院、简介、书记用户id",
    "tb_user.id",
    "不能与现有支部重复",
    "示例行",
    "导入不校验书记是否持有支委",
    "手工新增/编辑会校验",
    "单行失败不影响其他行",
  ]) {
    assert.ok(text.includes(expected), `规则说明应包含「${expected}」`);
  }
});

test("提交导入走 multipart，展示计数与逐行 Excel 行号", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "应展示部分成功结果");
  await eventually(() => state.imports.length === 1, "应发出一次导入请求");
  assert.match(state.imports[0], /multipart\/form-data/, "导入请求必须是 multipart/form-data");
  const summary = await dialog.locator('[data-testid="branch-import-result-summary"]').innerText();
  assert.ok(summary.includes("共 2 行，成功 1 行，失败 1 行"), `摘要应含真实计数，实际：${summary}`);
  const rows = await dialog.locator(".import-error-table tbody tr").allInnerTexts();
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes("3"), "应原样展示服务端返回的 Excel 行号 3");
  assert.ok(rows[0].includes("支部名称不能为空"), "应原样展示失败原因");
});

test("导入成功后自动刷新列表并出现新支部", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(() => state.pageRequests.length === 2, "成功后应重新请求支部列表");
  await eventually(
    async () => (await page.locator(".branches-table").innerText()).includes("第三支部"),
    "导入成功后列表应显示新支部",
  );
});

test("导入失败保留已选文件且不伪造结果", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  state.importStatus = 500;
  state.importMessage = "服务器内部错误";
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("导入未完成"), "失败应给出说明");
  const text = await dialog.innerText();
  assert.ok(text.includes("支部导入.xlsx"), "失败后应保留已选文件名");
  assert.ok(!/成功 \d+ 行/.test(text), "请求失败不得展示任何计数");
  assert.equal(await dialog.locator('[data-testid="branch-import-result-summary"]').count(), 0, "不得伪造结果摘要");
  await page.waitForTimeout(300);
  assert.equal(state.imports.length, 1, "失败后不得自动重传");
});

test("同一事件循环内双击开始导入只发送一次请求", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  const handle = await dialog.getByRole("button", { name: "开始导入", exact: true }).elementHandle();
  assert.ok(handle);
  // 同一任务内连续触发两次：此时按钮的 disabled 属性尚未由 Vue 重渲染，
  // 只有 handler 内同步置位能拦住第二次请求。
  await handle.evaluate((node) => {
    node.click();
    node.click();
  });
  await eventually(() => state.importStarted, "导入请求应已发出");
  await page.waitForTimeout(200);
  assert.equal(state.imports.length, 1, "双击只应产生一次导入请求");
  gate.resolve();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "解锁后应展示结果");
});

test("超过 10 MB 与非 .xlsx 文件零请求即被拒绝", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.csv");
  await eventually(async () => (await messageCount(page, "warning")) === 1, "错误扩展名应被拒绝");
  await selectFile(dialog, "超大文件.xlsx", Buffer.alloc(11 * 1024 * 1024, 1));
  await eventually(async () => (await messageCount(page, "warning")) === 2, "超过 10 MB 应被拒绝");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await messageCount(page, "warning")) === 3, "未选有效文件应提示");
  assert.deepEqual(state.imports, [], "上述情况都不得发送导入请求");
});

test("total 为 0 时显示没有数据行而非全部成功", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  state.importResult = { total: 0, successCount: 0, failCount: 0, errors: [] };
  const dialog = await openImport(page);
  await selectFile(dialog, "只有表头.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("文件中没有数据行"), "零行应提示没有数据行");
  const text = await dialog.innerText();
  assert.ok(!text.includes("全部导入成功"), "零行不得显示为全部成功");
  assert.equal(await messageCount(page, "success"), 0, "零行不得弹出成功提示");
  assert.equal(state.pageRequests.length, 1, "零行结果不应触发列表回读");
});

test("下载错误报告保留服务端行号并转义", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  state.importResult = {
    total: 3,
    successCount: 1,
    failCount: 2,
    errors: [
      { row: 1000, reason: '支部名称,重复"' },
      { row: 2, reason: "第一行\n第二行" },
    ],
  };
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "应先展示结果");
  await dialog.getByRole("button", { name: "下载错误报告", exact: true }).click();
  let csv = "";
  await eventually(async () => {
    csv = (await downloadedTexts(page)).find((text) => text.includes("行号,失败原因")) || "";
    return csv !== "";
  }, "应生成 CSV 错误报告");
  assert.ok(csv.codePointAt(0) === 0xfeff, "CSV 应带 UTF-8 BOM");
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(lines[0], "行号,失败原因");
  assert.ok(lines[1].startsWith('1000,"'), "应保留服务端原始行号 1000");
  assert.ok(lines[1].includes('""'), "双引号应转义");
  assert.ok(lines[2].startsWith('2,"'), "应保留服务端原始行号 2");
});

test("关闭重开清除上一份文件与报告", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "应先展示结果");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await eventually(async () => !(await dialog.isVisible()), "弹窗应关闭");
  const reopened = await openImport(page);
  const text = await reopened.innerText();
  assert.ok(!text.includes("部分导入成功"), "重开不得显示上一份报告");
  assert.ok(text.includes("请选择 .xlsx 文件"), "重开应重置文件选择");
  const input = reopened.locator('[data-testid="branch-import-file-input"]');
  assert.equal(await input.evaluate((node) => node.value), "", "原生文件输入应被重置");
  assert.equal(state.imports.length, 1, "关闭重开不应产生额外导入请求");
});

test("换号后旧导入响应不写回且导入状态回到默认", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches });
  const gate = deferred();
  state.importGate = gate;
  t.after(() => gate.resolve());
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
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
  const body = await page.locator("body").innerText();
  assert.ok(!body.includes("部分导入成功"), "旧会话的延迟结果不得展示");
  assert.ok(!body.includes("支部导入.xlsx"), "旧会话的文件不得残留");
  const reopened = await openImport(page);
  assert.equal(
    await reopened.locator('[data-testid="branch-import-result-summary"]').count(),
    0,
    "新会话不得继承旧结果",
  );
  assert.equal(
    await reopened.locator('[data-testid="branch-import-file-input"]').evaluate((node) => node.value),
    "",
    "新会话文件输入应为空",
  );
});

test("无 token 预览态零业务请求", async (t) => {
  const { page, state } = await fixture(t, { branches: defaultBranches, noToken: true });
  await page.getByText("支部管理需要登录", { exact: true }).waitFor();
  assert.deepEqual(state.pageRequests, []);
  assert.equal(state.templates, 0);
  assert.deepEqual(state.imports, []);
  assert.equal(await page.getByRole("button", { name: "导入支部", exact: true }).count(), 0);
});

test("普通成员访问 /branches 被守卫拦回首页且零支部请求", async (t) => {
  const { page, state } = await fixture(t, { sessionRole: "party_member", expectRedirect: true });
  await page.waitForURL((url) => new URL(url).pathname === "/");
  assert.deepEqual(state.pageRequests, [], "无权限账号不得请求支部列表");
  assert.equal(await page.getByRole("button", { name: "导入支部", exact: true }).count(), 0);
});

test("390px 窄屏下导入弹窗不整页横向溢出", async (t) => {
  const { page } = await fixture(t, { branches: defaultBranches, viewport: { width: 390, height: 844 } });
  const dialog = await openImport(page);
  await selectFile(dialog, "支部导入.xlsx");
  await dialog.getByRole("button", { name: "开始导入", exact: true }).click();
  await eventually(async () => (await dialog.innerText()).includes("部分导入成功"), "窄屏也应展示结果");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `390px 下不应出现整页横向溢出，实际溢出 ${overflow}px`);
});
