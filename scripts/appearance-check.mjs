import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { browserContext, panelFor, command } from "./browser-helpers.mjs";

// Reproduction of the reported profile layout, with the site's observed card/button rules.
const html = `<!doctype html><html lang="zh-CN" data-color-scheme-dark-mode-theme="dark" data-dark-mode-theme="dark"><head><meta charset="utf-8"><title>饼友页面集成验证</title><style>
:root { --bg:#f4f6f8;--panel:#fff;--line:#dde2e8;--text:#263445;--text-muted:#657588;--brand:#586779;--inverse-text:#f1f5f9;--radius-sm:4px;--font-size-md:14px; }
html[data-color-scheme-dark-mode-theme=dark]{--bg:#0f121a;--panel:#171b27;--line:#262b3b;--text:#e2e5ed;--text-muted:#9399ab}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui}a{color:inherit;text-decoration:none}button{font:inherit;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:6px 10px}header{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:var(--panel);border-bottom:1px solid var(--line)}header strong{font-size:18px}header nav{display:flex;align-items:center;gap:16px;color:var(--text-muted)}main{margin:14px;padding:24px;display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:28px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}.tabs{display:flex;gap:6px;margin-bottom:14px}.tabs a{padding:4px 10px;background:var(--bg);border:1px solid var(--line);border-radius:3px}.post-list{list-style:none;padding:0;margin:0}.post-item{padding:18px 0;border-bottom:1px solid var(--line)}.post-title{font-size:16px}.post-meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-muted);margin-top:10px}.user-card{border:1px solid var(--line);border-radius:4px}.user-wrap{padding:14px}.user-header-info{display:flex;gap:10px;align-items:center}.avatar{width:44px;height:44px;border-radius:50%;background:#586779;display:grid;place-items:center;color:#fff}.user-name{font-size:18px;font-weight:600}.user-rank{font-size:12px;color:var(--text-muted);margin-top:7px}.user-links{display:grid;grid-template-columns:1fr 1fr;font-size:12px;margin-top:16px}.user-links a{display:flex;align-items:center;gap:5px;min-height:26px;color:var(--text-muted);white-space:nowrap}.btn-post{display:block;margin:0 14px 14px;padding:8px;border-radius:var(--radius-sm);background:var(--brand);color:var(--inverse-text);text-align:center;font-size:var(--font-size-md);font-weight:500}.block{display:block;width:calc(100% - 28px);height:37px;margin:0 14px 14px;padding:7px 8px;color:var(--text-muted)}.foot{margin-top:12px;text-align:center;color:var(--text-muted);font-size:12px}
@media(max-width:780px){main{grid-template-columns:minmax(0,1fr) 220px;padding:16px;gap:20px}header nav a{display:none}}
</style></head><body><header><strong>LINUX SB · 烧饼社区</strong><nav aria-label="自定义顶部导航"><a href="/leaderboard">用户榜单</a><a href="/login">登录</a></nav></header><main><section><div class="tabs"><a href="/user/900001?tab=topics">主题</a><a href="/user/900001?tab=replies">回帖</a><a href="/user/900001?tab=favorites">收藏</a></div><ul class="post-list">${["怎样才能让这个小工具更顺手", "一起排查 Docker 网络问题", "今天发现了一个有趣的开源项目"].map((title, i) => `<li class="post-item"><a class="post-title" href="/topic/${i + 1}">${title}</a><div class="post-meta"><span><a href="/user/900001">云杉</a></span><span data-performance-time="1793934059">4小时前</span><span>技术交流</span></div></li>`).join("")}</ul></section><aside><div class="card sidebar-card user-card"><div class="user-wrap"><div class="user-header"><div class="user-header-info"><a href="/user/900001"><span class="avatar"><img alt="" hidden>云</span></a><div><a class="user-name" href="/user/900001">云杉</a><div class="user-rank">社区成员 · 积分 2317</div></div></div></div><div class="user-links"><a href="/user/900001?tab=topics">TA的主题</a><a href="/user/900001?tab=replies">TA的回帖</a><a href="/user/900001?tab=favorites">TA的收藏</a></div></div><a class="btn-post notify-link" href="/notify/900001">私信TA</a><button class="block">屏蔽TA</button></div><p class="foot">个人主页</p></aside></main></body></html>`;
const context = await browserContext("appearance");
const report = [];
await mkdir(".qa/evidence", { recursive: true });
try {
  await context.route("https://linux.sb/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  const { panel } = await panelFor(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.goto("https://linux.sb/user/900001?tab=topics");
  const action = page.locator("#sb-friends-profile-action");
  await action.waitFor();
  async function measure(label) {
    const dimensions = await page.evaluate(() => {
      const box = (selector) => {
        const e = document.querySelector(selector);
        const r = e.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          x: r.x,
          fontSize: getComputedStyle(e).fontSize,
        };
      };
      return {
        friend: box("#sb-friends-profile-action"),
        message: box(".btn-post"),
        block: box(".block"),
      };
    });
    assert.equal(dimensions.friend.width, dimensions.block.width);
    assert.equal(dimensions.friend.height, dimensions.block.height);
    assert.equal(dimensions.friend.x, dimensions.block.x);
    assert.equal(dimensions.friend.width, dimensions.message.width);
    assert.equal(dimensions.friend.height, dimensions.message.height);
    report.push({ label, dimensions });
  }
  await measure("before-add");
  await action.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".sb-friend-mark").length === 4,
  );
  await command(panel, "patch", {
    id: "900001",
    patch: { note: "一起讨论过插件开发", groups: ["技术交流"], pinned: false },
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".sb-friend-mark")?.getAttribute("title") ===
      "一起讨论过插件开发",
  );
  const markers = await page.locator(".sb-friend-mark").evaluateAll((nodes) =>
    nodes.map((n) => ({
      text: n.textContent,
      previous: n.previousElementSibling.textContent,
      href: n.previousElementSibling.getAttribute("href"),
      background: getComputedStyle(n).backgroundColor,
      border: getComputedStyle(n).borderWidth,
      padding: getComputedStyle(n).padding,
    })),
  );
  assert.equal(markers.length, 4);
  assert.ok(
    markers.every(
      (m) =>
        m.text === "饼友" &&
        m.previous === "云杉" &&
        !m.href.includes("?") &&
        m.border === "0px" &&
        m.padding === "0px",
    ),
  );
  assert.equal(
    await page
      .locator(
        ".tabs .sb-friend-mark,.user-links .sb-friend-mark,nav .sb-friend-mark",
      )
      .count(),
    0,
  );
  await measure("after-add");
  await page.screenshot({ path: ".qa/evidence/0.1.1-profile-dark.png" });
  await page.evaluate(() => {
    document.documentElement.setAttribute(
      "data-color-scheme-dark-mode-theme",
      "light",
    );
    document.documentElement.setAttribute("data-dark-mode-theme", "light");
  });
  await page.screenshot({ path: ".qa/evidence/0.1.1-profile-light.png" });
  await page.setViewportSize({ width: 760, height: 650 });
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector("#sb-friends-profile-action")
          .getBoundingClientRect().width -
          document.querySelector(".block").getBoundingClientRect().width,
      ) < 1,
  );
  await measure("resized");
  await panel.setViewportSize({ width: 400, height: 820 });
  await panel.screenshot({ path: ".qa/evidence/0.1.1-panel-light.png" });
  await panel.emulateMedia({ colorScheme: "dark" });
  await panel.screenshot({ path: ".qa/evidence/0.1.1-panel-dark.png" });
  await page.getByText("回帖", { exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".sb-friend-mark").length === 4,
  );
  assert.equal(await page.locator("#sb-friends-profile-action").count(), 1);
  await writeFile(
    ".qa/evidence/0.1.1-appearance.json",
    JSON.stringify(
      {
        passed: true,
        source: "local reproduction using observed site DOM and button CSS",
        markers,
        report,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, markers: markers.length, report }, null, 2),
  );
} finally {
  await context.close();
}
