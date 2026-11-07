import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
export function browserPath() {
  if (process.env.SB_TEST_BROWSER) return process.env.SB_TEST_BROWSER;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache = join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (existsSync(cache))
    for (const name of readdirSync(cache)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .reverse()) {
      const candidate = join(cache, name, "chrome-win64", "chrome.exe");
      if (existsSync(candidate)) return candidate;
    }
  throw new Error(
    "请运行 npx playwright install chromium 或设置 SB_TEST_BROWSER。",
  );
}
export async function browserContext(name, { live = false, profile } = {}) {
  return chromium.launchPersistentContext(
    profile || resolve(`.qa/profiles/${name}-${Date.now()}`),
    {
      executablePath: browserPath(),
      headless: true,
      viewport: { width: 400, height: 820 },
      args: [
        `--disable-extensions-except=${resolve("dist")}`,
        `--load-extension=${resolve("dist")}`,
      ],
      ...(live && process.env.SB_TEST_PROXY
        ? { proxy: { server: process.env.SB_TEST_PROXY } }
        : {}),
    },
  );
}
export async function panelFor(context) {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = worker.url().split("/")[2];
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/index.html`);
  await panel.getByRole("heading", { name: "我的饼友" }).waitFor();
  return { worker, panel, id };
}
export async function command(panel, type, fields = {}) {
  const reply = await panel.evaluate(
    (message) => chrome.runtime.sendMessage(message),
    { channel: "sb-app", type, ...fields },
  );
  if (!reply?.ok) throw new Error(reply?.error || `No response for ${type}`);
  return reply.data;
}
export async function waitJob(panel) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const state = await command(panel, "get");
    if (state.job && state.job.status !== "running") return state;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("刷新等待超过 60 秒。");
}
