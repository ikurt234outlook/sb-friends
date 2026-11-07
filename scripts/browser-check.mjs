import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  browserContext,
  panelFor,
  command,
  waitJob,
} from "./browser-helpers.mjs";

const live = process.argv.includes("--live");
const profile = resolve(
  `.qa/profiles/${live ? "live" : "fixtures"}-${Date.now()}`,
);
let context = await browserContext("check", { live, profile });
const evidence = [];
const requests = [];
const errors = [];
await mkdir(".qa/evidence", { recursive: true });
function record(name, details = {}) {
  evidence.push({ name, ...details });
  console.log("PASS", name, JSON.stringify(details));
}
let mode = "ok";
const names = { 900001: "云杉", 900002: "橘子汽水", 900003: "山海之间" };
function fixture(id, kind = "topics", page = 1) {
  const name = names[id] || "空白用户";
  const stamp = Math.floor(Date.now() / 1000) - 600;
  const reply = kind === "replies";
  const row = Object.hasOwn(names, id)
    ? `<li class="post-item"><a class="post-title" href="/topic/${page}42${reply ? `?replyid=${page}99` : ""}">${reply ? "和大家一起排查 Docker 网络问题" : "做一个用起来顺手的小工具"}</a>${reply ? '<div class="profile-reply-excerpt">可以先检查端口映射，再看容器的网络配置。每次只改一个变量，问题就容易定位了。</div>' : ""}<div class="post-meta"><span><a href="/user/${reply ? "700001" : id}">${reply ? "主题作者" : name}</a></span><span data-performance-time="${stamp}">10分钟前</span><span class="post-forum-meta"><a href="/forum/4">技术交流</a></span><span><svg><path d="M21 15a4 4 0 0 1-4 4"></path></svg>5</span><span>776</span></div></li>`
    : "";
  return `<!doctype html><html lang="zh-CN"><head><title>${name} - 烧饼社区</title><style>body{font:16px system-ui;padding:30px;background:#faf8f4}.user-header{padding:20px}a{margin:8px}.post-item{margin:20px 0}</style></head><body><nav aria-label="自定义顶部导航"><a href="/login">登录</a></nav><main><div class="user-header"><a class="user-name" href="/user/${id}">${name}</a></div><ul class="post-list">${row}</ul>${!row ? "<p>暂无回帖</p>" : ""}${page === 1 ? `<a href="/user/${id}?tab=${kind}&p=2">下一页</a>` : ""}</main></body></html>`;
}
async function mockRoutes(ctx) {
  await ctx.route("https://linux.sb/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const id = url.pathname.match(/^\/user\/(\d+)$/)?.[1];
    if (!id)
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: fixture("900001"),
      });
    if (mode === "delay" && route.request().resourceType() === "fetch")
      await new Promise((r) => setTimeout(r, 4000));
    if (mode === "429" && route.request().resourceType() === "fetch")
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "60" },
        body: "Too many requests",
      });
    if (mode === "reply-error" && url.searchParams.get("tab") === "replies")
      return route.fulfill({ status: 500, body: "test failure" });
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: fixture(
        id,
        url.searchParams.get("tab") || "topics",
        Number(url.searchParams.get("p") || 1),
      ),
    });
  });
}
try {
  if (!live) await mockRoutes(context);
  let { panel, worker, id: extensionId } = await panelFor(context);
  await assert.rejects(
    command(panel, "lookup", { input: "1" }),
    /先打开烧饼站/,
  );
  record("no-site-tab-guidance");
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.screenshot({
    path: `.qa/evidence/${live ? "live" : "fixture"}-empty.png`,
  });
  const ids = live ? ["1", "31718", "21415"] : Object.keys(names);
  const site = await context.newPage();
  await site.goto(`https://linux.sb/user/${ids[0]}?tab=topics`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await site.getByRole("button", { name: "＋ 加入饼友", exact: true }).click();
  await panel.locator(".friend").first().waitFor();
  assert.equal(Object.keys((await command(panel, "get")).friends).length, 1);
  record("page-add");
  for (const userId of ids.slice(1)) {
    await panel.getByRole("button", { name: "添加", exact: true }).click();
    await panel
      .getByPlaceholder("例如 1 或 https://linux.sb/user/1")
      .fill(`https://linux.sb/user/${userId}`);
    await panel.getByRole("button", { name: "预览资料", exact: true }).click();
    await panel
      .getByRole("button", { name: "确认加入", exact: true })
      .click({ timeout: 30000 });
    await panel.locator("dialog").waitFor({ state: "detached" });
  }
  let state = await command(panel, "get");
  assert.equal(Object.keys(state.friends).length, 3);
  record("uid-preview-add-three");
  const firstName = state.friends[ids[0]].displayName;
  await panel
    .getByRole("button", { name: `编辑 ${firstName}`, exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "备注" })
    .fill("一起排查过 Docker 网络问题，分享很实用。");
  await panel.getByPlaceholder("技术交流，项目合作").fill("技术交流，项目合作");
  await panel.getByRole("button", { name: "保存备注" }).click();
  await panel.locator("dialog").waitFor({ state: "detached" });
  await panel
    .getByRole("button", { name: `置顶 ${firstName}`, exact: true })
    .click();
  await panel.reload();
  await panel
    .getByRole("button", { name: `取消置顶 ${firstName}`, exact: true })
    .waitFor();
  state = await command(panel, "get");
  assert.equal(state.friends[ids[0]].groups.length, 2);
  assert.match(state.friends[ids[0]].note, /Docker/);
  await site.locator(".sb-friend-mark").first().waitFor();
  assert.match(
    await site.locator(".sb-friend-mark").first().getAttribute("title"),
    /Docker/,
  );
  record("notes-groups-pin-persistence-page-mark");
  await panel.getByRole("button", { name: "刷新", exact: true }).click();
  state = await waitJob(panel);
  assert.equal(state.job.status, "success", state.job.error);
  const counts = {};
  for (const userId of ids) {
    assert.ok(state.activities[userId].some((a) => a.kind === "topic"));
    assert.ok(state.activities[userId].some((a) => a.kind === "reply"));
    assert.ok(state.activities[userId].every((a) => a.actorUserId === userId));
    counts[userId] = state.activities[userId].length;
  }
  record("real-extension-topic-reply-refresh", counts);
  await panel.getByRole("button", { name: /^动态 / }).click();
  await panel.locator(".activity").first().waitFor();
  await panel.getByLabel("筛选类型").selectOption("reply");
  assert.ok((await panel.locator(".activity").count()) > 0);
  await panel.getByLabel("筛选用户").selectOption(ids[0]);
  await panel.getByLabel("筛选类型").selectOption("");
  for (const width of [360, 480]) {
    await panel.setViewportSize({ width, height: 820 });
    assert.ok(
      await panel.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "horizontal overflow",
    );
    await panel.screenshot({
      path: `.qa/evidence/${live ? "live" : "fixture"}-feed-${width}.png`,
    });
  }
  await panel.emulateMedia({ colorScheme: "dark" });
  await panel.screenshot({
    path: `.qa/evidence/${live ? "live" : "fixture"}-dark.png`,
  });
  await panel.emulateMedia({ colorScheme: "light" });
  record("filters-narrow-dark-layout");
  await panel.getByRole("button", { name: "设置与备份" }).click();
  const downloadPromise = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "导出备份" }).click();
  const download = await downloadPromise;
  const backupPath = resolve(
    `.qa/evidence/${live ? "live" : "fixture"}-backup.json`,
  );
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  assert.equal(backup.friends.length, 3);
  assert.equal(backup.activities, undefined);
  await panel.locator("input[type=file]").setInputFiles(backupPath);
  await panel.getByRole("button", { name: "确认导入" }).click();
  await panel.locator("dialog").waitFor({ state: "detached" });
  record("backup-export-import-conflict-default");
  if (!live) {
    // All error scenarios use local fixture responses in this isolated test profile.
    await command(panel, "clear-cache");
    mode = "reply-error";
    await command(panel, "refresh", { ids: [ids[0]] });
    state = await waitJob(panel);
    assert.equal(state.job.status, "partial");
    assert.equal(state.activities[ids[0]][0].kind, "topic");
    record("partial-error-retains-topic");
    mode = "ok";
    await command(panel, "refresh", { ids: [ids[0]] });
    state = await waitJob(panel);
    assert.equal(state.job.status, "success");
    await command(panel, "more", { id: ids[0], kind: "reply" });
    state = await waitJob(panel);
    assert.ok(state.activities[ids[0]].some((a) => a.replyId === "299"));
    record("pagination-deduplicated");
    const cacheCount = state.activities[ids[0]].length;
    mode = "delay";
    await command(panel, "more", { id: ids[0], kind: "topic" });
    await command(panel, "stop");
    state = await waitJob(panel);
    assert.equal(state.job.status, "cancelled");
    assert.equal(state.activities[ids[0]].length, cacheCount);
    record("cancel-retains-cache");
    mode = "429";
    await command(panel, "more", { id: ids[0], kind: "topic" });
    state = await waitJob(panel);
    assert.equal(state.job.status, "error");
    assert.ok(state.cooldownUntil > Date.now());
    assert.equal(state.activities[ids[0]].length, cacheCount);
    const requestCount = requests.length;
    await command(panel, "refresh", { ids: [ids[2]] });
    state = await waitJob(panel);
    assert.equal(requests.length, requestCount);
    record("429-cooldown-prevents-repeat");
    await command(panel, "remove", { id: ids[1] });
    state = await command(panel, "get");
    assert.equal(state.friends[ids[1]], undefined);
    await command(panel, "import", { backup, overwrite: false });
    state = await command(panel, "get");
    assert.ok(state.friends[ids[1]]);
    record("remove-and-restore");
  } else {
    // Compare topic timestamps and markers against a real topic detail page.
    const topic = state.activities[ids[0]].find((a) => a.kind === "topic");
    const detail = await context.newPage();
    await detail.goto(topic.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await detail.locator(".sb-friend-mark").first().waitFor();
    const detailTime = await detail
      .locator(".topic-post-list .post-time")
      .first()
      .textContent();
    assert.ok(detailTime?.trim(), "topic detail time missing");
    record("topic-detail-marker-and-time-text", {
      listTime: topic.sourceTimeText,
      detailTime,
      exactTimestampVerified: false,
    });
    await detail.close();
    // Save a small public HTML sample for parser regression tests; no cookies or full browsing logs.
    const sample = await site.locator("main").evaluate((main) => {
      const header = main.querySelector(".user-header")?.outerHTML || "";
      const rows = [...main.querySelectorAll("li.post-item")]
        .slice(0, 2)
        .map((e) => e.outerHTML)
        .join("");
      return `<main>${header}<ul class="post-list">${rows}</ul></main>`;
    });
    await writeFile(".qa/evidence/live-public-sample.html", sample);
  }
  state = await command(panel, "get");
  await writeFile(
    `.qa/evidence/${live ? "live" : "fixture"}-report.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: context.browser()?.version(),
        evidence,
        errors,
        job: state.job,
        scopeCount: Object.keys(state.scopes).length,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  record("no-ui-runtime-errors");
  // Restart the browser with the same isolated profile to verify durable configuration.
  await context.close();
  context = await browserContext("restart", { live, profile });
  ({ panel } = await panelFor(context));
  state = await command(panel, "get");
  assert.equal(Object.keys(state.friends).length, 3);
  assert.match(state.friends[ids[0]].note, /Docker/);
  record("browser-restart-persistence");
  await writeFile(
    `.qa/evidence/${live ? "live" : "fixture"}-report.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: context.browser()?.version(),
        evidence,
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    `.qa/evidence/${live ? "live" : "fixture"}-failure.json`,
    JSON.stringify({ evidence, error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await context.close();
}
