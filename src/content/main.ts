import { type State, type Kind, STORAGE_KEY, SiteError } from "../shared/types";
import { uid } from "../shared/urls";
import { parseProfile, currentViewer } from "../site/sb/parser";
import { fetchPage } from "../site/sb/request";
import { isNicknameLink, placeProfileAction } from "./pageIntegration";
import { pageStyles } from "./pageStyles";

const controllers = new Map<string, AbortController>();
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || m?.channel !== "sb-page") return;
  if (m.type === "viewer") {
    reply({ viewerKey: currentViewer(document) });
    return;
  }
  if (m.type === "cancel") {
    controllers.get(m.requestId)?.abort();
    reply({ ok: true });
    return;
  }
  if (m.type !== "fetch") return;
  const controller = new AbortController();
  controllers.set(m.requestId, controller);
  const timer = setTimeout(() => controller.abort(), 20000);
  void (async () => {
    if (m.kind !== "topic" && m.kind !== "reply")
      throw new Error("无效动态类型。");
    return fetchPage(
      uid(m.id),
      m.kind as Kind,
      m.page,
      controller.signal,
      m.profileOnly === true,
    );
  })()
    .then(
      (data) => reply({ ok: true, data }),
      (error) =>
        reply({
          ok: false,
          error:
            error?.name === "AbortError"
              ? "读取已停止或超时，请稍后重试。"
              : error instanceof Error
                ? error.message
                : "页面请求失败。",
          code: error instanceof SiteError ? error.code : "network",
          retryAt: error instanceof SiteError ? error.retryAt : undefined,
        }),
    )
    .finally(() => {
      clearTimeout(timer);
      controllers.delete(m.requestId);
    });
  return true;
});

let state: State | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(render, 180);
});
function observe() {
  observer.observe(document.body, { childList: true, subtree: true });
}
window.addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(render, 180);
});
async function command(type: string, data: Record<string, unknown> = {}) {
  return chrome.runtime.sendMessage({ channel: "sb-app", type, ...data });
}
function open() {
  void command("open");
}
function render() {
  if (!state || !document.body) return;
  observer.disconnect();
  try {
    if (!document.getElementById("sb-friends-style")) {
      const style = document.createElement("style");
      style.id = "sb-friends-style";
      style.textContent = pageStyles;
      document.head.append(style);
    }
    let launcher = document.getElementById("sb-friends-launcher");
    if (!launcher) {
      launcher = document.createElement("button");
      launcher.id = "sb-friends-launcher";
      launcher.className = "sb-friends-action";
      launcher.textContent = "饼友";
      launcher.setAttribute("aria-label", "打开饼友");
      launcher.addEventListener("click", open);
      const nav = document.querySelector('nav[aria-label="自定义顶部导航"]');
      if (nav) nav.append(launcher);
      else {
        launcher.classList.add("sb-floating");
        document.body.append(launcher);
      }
    }
    document.querySelectorAll(".sb-friend-mark").forEach((e) => e.remove());
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/user/"]',
    )) {
      if (!isNicknameLink(link)) continue;
      let id: string;
      try {
        id = uid(link.href);
      } catch {
        continue;
      }
      const friend = state.friends[id];
      if (!friend) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sb-friend-mark";
      button.textContent = "饼友";
      button.title = friend.note || "打开饼友";
      button.setAttribute(
        "aria-label",
        `${friend.displayName} · 饼友${friend.note ? `：${friend.note}` : ""}`,
      );
      button.addEventListener("click", open);
      link.after(button);
    }
    const match = location.pathname.match(/^\/user\/(\d+)\/?$/);
    let existing = document.getElementById("sb-friends-profile-action");
    if (!match) {
      existing?.remove();
      return;
    }
    let profile;
    try {
      profile = parseProfile(document, match[1]);
    } catch {
      existing?.remove();
      return;
    }
    if (existing && existing.dataset.uid !== profile.userId) {
      existing.remove();
      existing = null;
    }
    if (!existing) {
      const button = document.createElement("button");
      button.id = "sb-friends-profile-action";
      button.className = "sb-friends-action";
      button.type = "button";
      button.dataset.uid = profile.userId;
      button.addEventListener("click", async () => {
        if (state?.friends[profile.userId]) {
          open();
          return;
        }
        button.disabled = true;
        try {
          const response = await command("add", { profile });
          if (!response.ok) throw new Error(response.error);
          state = response.data;
          render();
        } catch (error) {
          button.textContent =
            error instanceof Error ? error.message : "添加失败，请刷新页面重试";
        } finally {
          button.disabled = false;
        }
      });
      placeProfileAction(button, document);
    }
    const action = document.getElementById(
      "sb-friends-profile-action",
    ) as HTMLButtonElement | null;
    if (action) {
      placeProfileAction(action, document);
      action.textContent = state.friends[profile.userId]
        ? "已加入饼友 · 查看"
        : "＋ 加入饼友";
    }
  } finally {
    observe();
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    state = changes[STORAGE_KEY].newValue;
    render();
  }
});
void command("get")
  .then((response) => {
    if (response.ok) {
      state = response.data;
      render();
    }
  })
  .catch(() => {});
