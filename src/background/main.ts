import { createStore } from "./store";
import {
  type Kind,
  type ActivityPage,
  type Reply,
  SiteError,
  SITE,
} from "../shared/types";
import { uid } from "../shared/urls";
import {
  addFriend,
  friendPatch,
  normalizeProfile,
  removeFriend,
  mergePage,
  parseBackup,
  importBackup,
} from "../domain/state";

const store = createStore(chrome.storage.local);
const ready = store.update((s) =>
  s.job?.status === "running"
    ? {
        ...s,
        job: {
          ...s.job,
          status: "cancelled",
          error: "刷新已中断，请重新点击刷新。",
        },
      }
    : s,
);
let active: { id: string; cancelled: boolean; tabId?: number } | undefined;
let requestChain: Promise<unknown> = Promise.resolve();
let lastStart = 0;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function siteRequest(
  id: string,
  kind: Kind,
  page: number,
  run?: NonNullable<typeof active>,
  profileOnly = false,
): Promise<ActivityPage> {
  const request = requestChain.then(async () => {
    await delay(Math.max(0, lastStart + 2000 - Date.now()));
    if (run?.cancelled) throw new SiteError("cancelled", "已停止刷新。");
    const state = await store.read();
    if ((state.cooldownUntil ?? 0) > Date.now())
      throw new SiteError(
        "rate-limit",
        `站点请求冷却中，请在 ${new Date(state.cooldownUntil!).toLocaleTimeString("zh-CN")} 后重试。`,
        state.cooldownUntil,
      );
    const tabs = await chrome.tabs.query({ url: `${SITE}/*` });
    const tab = tabs.sort((a, b) => Number(b.active) - Number(a.active))[0];
    if (!tab?.id) throw new SiteError("no-tab", "请先打开烧饼站，再点击刷新。");
    if (run) run.tabId = tab.id;
    lastStart = Date.now();
    let response: Reply<ActivityPage>;
    const requestId = run?.id ?? crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, {
          channel: "sb-page",
          type: "fetch",
          id: uid(id),
          kind,
          page,
          requestId,
          profileOnly,
        }) as Promise<Reply<ActivityPage>>,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void chrome.tabs
              .sendMessage(tab.id!, {
                channel: "sb-page",
                type: "cancel",
                requestId,
              })
              .catch(() => {});
            reject(
              new SiteError(
                "timeout",
                "页面读取超时，请检查烧饼站连接后重试。",
              ),
            );
          }, 25000);
        }),
      ]);
    } catch (error) {
      if (error instanceof SiteError) throw error;
      throw new SiteError(
        "connection",
        "无法连接烧饼站页面，请刷新该网页后重试。",
      );
    } finally {
      clearTimeout(timer);
    }
    if (run?.cancelled) throw new SiteError("cancelled", "已停止刷新。");
    if (!response?.ok) {
      const failure = response as Extract<Reply<never>, { ok: false }>;
      if (failure?.retryAt)
        await store.update((s) => ({ ...s, cooldownUntil: failure.retryAt }));
      throw new SiteError(
        failure?.code ?? "network",
        failure?.error ?? "页面未返回数据，请刷新烧饼站网页后重试。",
        failure?.retryAt,
      );
    }
    return response.data;
  });
  requestChain = request.catch(() => {});
  return request;
}

async function startRefresh(
  ids: string[],
  more?: { kind: Kind; page: number },
) {
  if (active) return;
  const run = {
    id: crypto.randomUUID(),
    cancelled: false,
    tabId: undefined as number | undefined,
  };
  active = run;
  try {
    const state = await store.read();
    const targets = ids.filter((id) => !!state.friends[id]);
    if (!targets.length) throw new Error("请先添加饼友。");
    const steps = targets.flatMap((id) =>
      (more ? [more.kind] : (["topic", "reply"] as Kind[])).map((kind) => ({
        id,
        kind,
        page: more?.page ?? 1,
        generation: state.friends[id].addedAt,
      })),
    );
    await store.update((s) => ({
      ...s,
      job: {
        id: run.id,
        status: "running",
        total: steps.length,
        done: 0,
        label: "准备刷新",
        startedAt: new Date().toISOString(),
      },
    }));
    void (async () => {
      let completed = 0;
      try {
        for (const step of steps) {
          if (run.cancelled) break;
          const current = await store.read();
          const friend = current.friends[step.id];
          if (!friend || friend.addedAt !== step.generation) continue;
          await store.update((s) => ({
            ...s,
            job: {
              ...s.job!,
              label: `${friend.displayName} · ${step.kind === "topic" ? "主题" : "回帖"}`,
            },
          }));
          const scope = current.scopes[`${step.id}:${step.kind}`];
          // Cached results are only reused after checking the viewer via a light page handshake.
          const tabs = await chrome.tabs.query({ url: `${SITE}/*` });
          let viewer: string | undefined;
          try {
            viewer = tabs[0]?.id
              ? (
                  await chrome.tabs.sendMessage(tabs[0].id, {
                    channel: "sb-page",
                    type: "viewer",
                  })
                )?.viewerKey
              : undefined;
          } catch {
            /* The request below reports connection problems. */
          }
          const fresh =
            !more &&
            !scope?.error &&
            viewer &&
            viewer !== "unknown" &&
            viewer === scope?.viewerKey &&
            Date.now() - Date.parse(scope?.latestPageAt ?? "") < 300000;
          if (!fresh) {
            try {
              const result = await siteRequest(
                step.id,
                step.kind,
                step.page,
                run,
              );
              if (run.cancelled) break;
              await store.update((s) =>
                run.cancelled
                  ? s
                  : mergePage(
                      s,
                      step.id,
                      step.kind,
                      result,
                      step.generation,
                      undefined,
                      step.page,
                    ),
              );
            } catch (error) {
              if (!run.cancelled)
                await store.update((s) => ({
                  ...s,
                  scopes: s.friends[step.id]
                    ? {
                        ...s.scopes,
                        [`${step.id}:${step.kind}`]: {
                          ...s.scopes[`${step.id}:${step.kind}`],
                          error:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        },
                      }
                    : s.scopes,
                }));
              throw error;
            }
          }
          completed++;
          await store.update((s) => ({
            ...s,
            job: { ...s.job!, done: completed },
          }));
        }
        await store.update((s) => ({
          ...s,
          job: {
            ...s.job!,
            status: run.cancelled ? "cancelled" : "success",
            label: run.cancelled ? "已停止，已完成的数据已保留" : "刷新完成",
          },
        }));
      } catch (error) {
        await store.update((s) => ({
          ...s,
          job: {
            ...s.job!,
            status: run.cancelled
              ? "cancelled"
              : completed
                ? "partial"
                : "error",
            error: run.cancelled
              ? undefined
              : error instanceof Error
                ? error.message
                : String(error),
            label: run.cancelled ? "已停止" : "刷新未全部完成",
          },
        }));
      } finally {
        if (active === run) active = undefined;
      }
    })();
  } catch (error) {
    if (active === run) active = undefined;
    throw error;
  }
}

async function dispatch(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  await ready;
  const fromSite = !!sender.url?.startsWith(`${SITE}/`);
  if (fromSite && !["get", "add", "open"].includes(String(message.type)))
    throw new Error("页面不能执行此操作。");
  switch (message.type) {
    case "get":
      return store.read();
    case "lookup":
      return (
        await siteRequest(uid(message.input), "topic", 1, undefined, true)
      ).profile;
    case "add":
      return store.update((s) =>
        addFriend(s, normalizeProfile(message.profile)),
      );
    case "patch": {
      const id = uid(message.id),
        patch = friendPatch(message.patch);
      return store.update((s) => {
        if (!s.friends[id]) throw new Error("这位饼友已移除。");
        return {
          ...s,
          friends: {
            ...s.friends,
            [id]: {
              ...s.friends[id],
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });
    }
    case "remove":
      return store.update((s) => removeFriend(s, uid(message.id)));
    case "refresh": {
      const s = await store.read();
      const ids = Array.isArray(message.ids)
        ? message.ids.map(uid)
        : Object.keys(s.friends);
      await startRefresh(ids);
      return null;
    }
    case "more": {
      const id = uid(message.id),
        kind = message.kind as Kind;
      if (kind !== "topic" && kind !== "reply")
        throw new Error("无效动态类型。");
      const page = (await store.read()).scopes[`${id}:${kind}`]?.nextPage;
      if (!page) throw new Error("没有更多分页。");
      await startRefresh([id], { kind, page });
      return null;
    }
    case "stop": {
      if (active) {
        active.cancelled = true;
        if (active.tabId)
          void chrome.tabs
            .sendMessage(active.tabId, {
              channel: "sb-page",
              type: "cancel",
              requestId: active.id,
            })
            .catch(() => {});
      }
      return null;
    }
    case "import": {
      const backup = parseBackup(message.backup);
      return store.update((s) =>
        importBackup(s, backup, message.overwrite === true),
      );
    }
    case "clear-cache": {
      if (active) throw new Error("请先停止刷新，待任务结束后清理缓存。");
      return store.update((s) => ({
        ...s,
        activities: {},
        scopes: {},
        job: undefined,
      }));
    }
    case "open":
      return null; // Open is handled synchronously below to preserve the user gesture.
    default:
      throw new Error("不支持的操作。");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !message ||
    message.channel !== "sb-app" ||
    sender.id !== chrome.runtime.id
  )
    return;
  const ownPage = sender.url?.startsWith(chrome.runtime.getURL(""));
  if (!ownPage && (sender.frameId !== 0 || !sender.url?.startsWith(`${SITE}/`)))
    return;
  if (message.type === "open" && sender.tab?.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(
      () => sendResponse({ ok: true, data: null }),
      () => {
        void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
        sendResponse({ ok: true, data: null });
      },
    );
    return true;
  }
  void dispatch(message, sender).then(
    (data) => sendResponse({ ok: true, data }),
    (error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof SiteError ? error.code : undefined,
      }),
  );
  return true;
});
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
