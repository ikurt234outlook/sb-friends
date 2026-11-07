import { browserContext, panelFor, command } from "./browser-helpers.mjs";
import { readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const folders = (await readdir(".qa/profiles"))
  .filter((n) => n.startsWith("live-"))
  .sort();
const context = await browserContext("time", {
  live: true,
  profile: resolve(".qa/profiles", folders.at(-1)),
});
try {
  const { panel } = await panelFor(context);
  const state = await command(panel, "get");
  const topic = state.activities["1"].find((a) => a.kind === "topic");
  const page = await context.newPage();
  await page.goto(topic.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const data = await page.evaluate(() => ({
    title: document.title,
    times: [
      ...document.querySelectorAll("time,[datetime],[data-performance-time]"),
    ]
      .map((e) => e.outerHTML)
      .slice(0, 12),
    html: document.querySelector("main")?.outerHTML.slice(0, 22000),
  }));
  console.log(JSON.stringify({ topic, data }, null, 2));
  await writeFile(
    ".qa/evidence/time-inspection.json",
    JSON.stringify({ topic, data }, null, 2),
  );
} finally {
  await context.close();
}
