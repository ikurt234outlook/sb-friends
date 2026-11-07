import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { atom, useAtom } from "jotai";
import {
  Users,
  MessageSquare,
  Plus,
  Search,
  RefreshCw,
  Settings,
  ArrowUpRight,
  X,
  Pin,
  Pencil,
  Download,
  Upload,
  Trash2,
  Check,
  Square,
  Cookie,
  ArrowLeft,
} from "lucide-react";
import {
  type State,
  type Profile,
  type Friend,
  type Backup,
  type Reply,
  STORAGE_KEY,
  SITE,
  emptyState,
} from "../shared/types";
import { parseBackup, backupOf } from "../domain/state";
import { friendNoteLength } from "../domain/friendNote";
import "./style.css";

const stateAtom = atom<State>(emptyState());
const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
async function call<T = unknown>(
  type: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  if (!isExtension) throw new Error("请在浏览器中加载 dist 扩展后使用。");
  const response: Reply<T> = await chrome.runtime.sendMessage({
    channel: "sb-app",
    type,
    ...fields,
  });
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
function when(value?: string) {
  if (!value) return "时间未知";
  const age = Math.max(0, Date.now() - Date.parse(value));
  if (age < 60000) return "刚刚";
  if (age < 3600000) return `${Math.floor(age / 60000)} 分钟前`;
  if (age < 86400000) return `${Math.floor(age / 3600000)} 小时前`;
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
function Avatar({ friend }: { friend: Profile }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [friend.avatarUrl]);
  return (
    <span className="avatar">
      {friend.avatarUrl && !failed ? (
        <img
          src={friend.avatarUrl}
          referrerPolicy="no-referrer"
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        friend.displayName.slice(0, 1)
      )}
    </span>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header className="dialog-head">
        <h2>{title}</h2>
        <button aria-label="关闭" className="icon" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function App() {
  const [state, setState] = useAtom(stateAtom);
  const [tab, setTab] = useState<"friends" | "feed" | "settings">(
    location.hash === "#settings" ? "settings" : "friends",
  );
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState(""),
    [person, setPerson] = useState(""),
    [kind, setKind] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false),
    [input, setInput] = useState(""),
    [preview, setPreview] = useState<Profile>();
  const [editing, setEditing] = useState<Friend>(),
    [note, setNote] = useState(""),
    [groupsText, setGroupsText] = useState("");
  const [deleting, setDeleting] = useState<Friend>(),
    [backup, setBackup] = useState<Backup>(),
    [overwrite, setOverwrite] = useState(false);
  const [limit, setLimit] = useState(40);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef({ friends: 0, feed: 0, settings: 0 });
  const running = state.job?.status === "running";
  useEffect(() => {
    if (!isExtension) {
      setLoaded(true);
      return;
    }
    void call<State>("get")
      .then((s) => {
        setState(s);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEY])
        setState(changes[STORAGE_KEY].newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = positions.current[tab];
  }, [tab]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function switchTab(next: typeof tab) {
    if (scrollRef.current) positions.current[tab] = scrollRef.current.scrollTop;
    setTab(next);
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const all = Object.values(state.friends);
  const groups = [...new Set(all.flatMap((f) => f.groups))].sort();
  const matches = (f: Friend) =>
    (!group || f.groups.includes(group)) &&
    (!search ||
      `${f.displayName} ${f.note} ${f.userId}`
        .toLowerCase()
        .includes(search.toLowerCase()));
  const latestTime = (id: string) =>
    Math.max(
      0,
      ...(state.activities[id] ?? []).map(
        (a) => Date.parse(a.occurredAt ?? "") || 0,
      ),
    );
  const friends = all
    .filter(matches)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        latestTime(b.userId) - latestTime(a.userId) ||
        a.displayName.localeCompare(b.displayName, "zh-CN"),
    );
  const activities = Object.values(state.activities)
    .flat()
    .filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!person || a.actorUserId === person) &&
        !!state.friends[a.actorUserId] &&
        matches(state.friends[a.actorUserId]),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.occurredAt ?? "") || 0) -
          (Date.parse(a.occurredAt ?? "") || 0) || a.id.localeCompare(b.id),
    );
  const conflicts =
    backup?.friends.filter((f) => state.friends[f.userId]).length ?? 0;
  function edit(friend: Friend) {
    setEditing(friend);
    setNote(friend.note);
    setGroupsText(friend.groups.join("，"));
    setError("");
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(backupOf(state), null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = href;
    link.download = `饼友备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setNotice("已导出名单、备注和分组");
  }
  const errorBox = error && (
    <div className="alert" role="alert">
      {error}
      <button
        className="icon"
        aria-label="关闭提示"
        onClick={() => setError("")}
      >
        <X size={15} />
      </button>
    </div>
  );
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          <div>
            <h1>
              饼友<span>LINUX SB</span>
            </h1>
            <p>熟悉的人，值得再见。</p>
          </div>
        </div>
        <button
          className={`icon ${tab === "settings" ? "active" : ""}`}
          aria-label="设置与备份"
          onClick={() => switchTab(tab === "settings" ? "friends" : "settings")}
        >
          <Settings size={20} />
        </button>
      </header>
      {!isExtension && (
        <div className="alert">界面预览 · 请加载 dist 扩展使用完整功能</div>
      )}
      {tab !== "settings" && (
        <nav className="tabs" aria-label="主要视图">
          <button
            className={tab === "friends" ? "selected" : ""}
            onClick={() => switchTab("friends")}
          >
            <Users size={17} />
            饼友 <span>{all.length}</span>
          </button>
          <button
            className={tab === "feed" ? "selected" : ""}
            onClick={() => switchTab("feed")}
          >
            <MessageSquare size={17} />
            动态 <span>{Object.values(state.activities).flat().length}</span>
          </button>
        </nav>
      )}
      {!(adding || editing || deleting || backup) && errorBox}
      {notice && (
        <div role="status" className="toast">
          <Check size={15} />
          {notice}
        </div>
      )}
      <div className="scroll" ref={scrollRef}>
        {tab !== "settings" ? (
          <>
            <section className="section-heading">
              <div>
                <span className="eyebrow">
                  {tab === "friends" ? "MY PEOPLE" : "RECENT UPDATES"}
                </span>
                <h2>{tab === "friends" ? "我的饼友" : "饼友近况"}</h2>
              </div>
              {tab === "friends" && (
                <button
                  className="primary small"
                  onClick={() => {
                    setAdding(true);
                    setInput("");
                    setPreview(undefined);
                    setError("");
                  }}
                >
                  <Plus size={16} />
                  添加
                </button>
              )}
            </section>
            {all.length > 0 && (
              <div className="filters">
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="搜索饼友"
                    placeholder="搜索昵称、备注或 UID"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setLimit(40);
                    }}
                  />
                </label>
                <div className="filter-row">
                  <select
                    aria-label="筛选分组"
                    value={group}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setLimit(40);
                    }}
                  >
                    <option value="">全部分组</option>
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                  {tab === "feed" && (
                    <>
                      <select
                        aria-label="筛选用户"
                        value={person}
                        onChange={(e) => {
                          setPerson(e.target.value);
                          setLimit(40);
                        }}
                      >
                        <option value="">全部饼友</option>
                        {all.map((f) => (
                          <option key={f.userId} value={f.userId}>
                            {f.displayName}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="筛选类型"
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value);
                          setLimit(40);
                        }}
                      >
                        <option value="">全部类型</option>
                        <option value="topic">主题</option>
                        <option value="reply">回帖</option>
                      </select>
                    </>
                  )}
                </div>
              </div>
            )}
            {!loaded ? (
              <div className="empty">
                <p>正在读取本地名单…</p>
              </div>
            ) : !all.length ? (
              <div className="empty">
                <div className="empty-art">
                  <Cookie size={44} strokeWidth={1.3} />
                  <span>＋</span>
                </div>
                <h3>把想再遇见的人留在这里</h3>
                <p>
                  从烧饼站个人主页加入饼友，
                  <br />
                  或粘贴主页链接，记下你们的交集。
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setAdding(true);
                    setPreview(undefined);
                    setInput("");
                  }}
                >
                  添加第一位饼友
                  <Plus size={16} />
                </button>
                <a href={SITE} target="_blank" rel="noreferrer">
                  去烧饼站逛逛 <ArrowUpRight size={14} />
                </a>
              </div>
            ) : tab === "friends" ? (
              <div className="friend-list">
                {friends.map((f) => {
                  const last = (state.activities[f.userId] ?? []).find(
                    (a) => a.occurredAt,
                  );
                  const scopeError =
                    state.scopes[`${f.userId}:topic`]?.error ||
                    state.scopes[`${f.userId}:reply`]?.error;
                  return (
                    <article className="friend" key={f.userId}>
                      <div className="friend-line">
                        <Avatar friend={f} />
                        <div className="identity">
                          <a
                            href={`${SITE}/user/${f.userId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {f.displayName}
                            <ArrowUpRight size={12} />
                          </a>
                          <span>UID {f.userId}</span>
                        </div>
                        <button
                          className={`icon pin ${f.pinned ? "on" : ""}`}
                          aria-label={`${f.pinned ? "取消置顶" : "置顶"} ${f.displayName}`}
                          onClick={() =>
                            action(async () => {
                              await call("patch", {
                                id: f.userId,
                                patch: {
                                  note: f.note,
                                  groups: f.groups,
                                  pinned: !f.pinned,
                                },
                              });
                            })
                          }
                        >
                          <Pin size={16} />
                        </button>
                        <button
                          className="icon"
                          aria-label={`编辑 ${f.displayName}`}
                          onClick={() => edit(f)}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                      <button
                        className={`note ${f.note ? "" : "muted"}`}
                        onClick={() => edit(f)}
                      >
                        {f.note || "记一笔：你们是怎么认识的？"}
                      </button>
                      {!!f.groups.length && (
                        <div className="tags">
                          {f.groups.map((g) => (
                            <span key={g}>{g}</span>
                          ))}
                        </div>
                      )}
                      <div className="friend-footer">
                        <button
                          onClick={() => {
                            setPerson(f.userId);
                            switchTab("feed");
                          }}
                        >
                          查看动态 <ArrowUpRight size={12} />
                        </button>
                        <span>
                          {scopeError
                            ? "部分内容未更新"
                            : last
                              ? `最近动态 ${when(last.occurredAt)}`
                              : "尚未刷新"}
                        </span>
                        <button
                          className="icon"
                          disabled={running}
                          aria-label={`刷新 ${f.displayName}`}
                          onClick={() =>
                            action(async () => {
                              await call("refresh", { ids: [f.userId] });
                            })
                          }
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!friends.length && (
                  <div className="empty">
                    <h3>没有找到匹配的饼友</h3>
                    <p>试试其他昵称、备注或分组。</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="activity-list">
                {activities.slice(0, limit).map((a) => {
                  const f = state.friends[a.actorUserId];
                  return (
                    <article
                      className="activity"
                      key={`${a.actorUserId}:${a.id}`}
                    >
                      <Avatar friend={f} />
                      <div className="activity-body">
                        <div className="activity-meta">
                          <strong>{f.displayName}</strong>
                          <time
                            title={`原站列表时间${a.occurredAt ? `：${a.occurredAt}` : ""}`}
                          >
                            原站 ·{" "}
                            {a.occurredAt
                              ? when(a.occurredAt)
                              : (a.sourceTimeText ?? "时间未知")}
                          </time>
                        </div>
                        <div className="activity-kind">
                          {a.kind === "topic" ? "发布主题" : "回复主题"}
                          {a.isNew && <span className="new">新发现</span>}
                        </div>
                        <a
                          className="topic-title"
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.title}
                          <ArrowUpRight size={13} />
                        </a>
                        {a.excerpt && <p className="excerpt">{a.excerpt}</p>}
                        <div className="activity-bottom">
                          <span>{a.forumName ?? "烧饼社区"}</span>
                          <span>
                            {a.topicReplyCount !== undefined
                              ? `${a.topicReplyCount} 条主题回复`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!activities.length && (
                  <div className="empty compact">
                    <MessageSquare size={36} strokeWidth={1.2} />
                    <h3>
                      {Object.keys(state.scopes).length
                        ? "还没有匹配的动态"
                        : "看看饼友最近聊了什么"}
                    </h3>
                    <p>
                      点击下方刷新，读取最近一页
                      <br />
                      公开主题和回帖摘要。
                    </p>
                  </div>
                )}
                {activities.length > limit && (
                  <button
                    className="load-more"
                    onClick={() => setLimit((n) => n + 40)}
                  >
                    再显示 40 条缓存动态
                  </button>
                )}
                {person && (
                  <div className="more-pages">
                    {(["topic", "reply"] as const).map(
                      (k) =>
                        state.scopes[`${person}:${k}`]?.nextPage && (
                          <button
                            key={k}
                            disabled={running}
                            onClick={() =>
                              action(async () => {
                                await call("more", { id: person, kind: k });
                              })
                            }
                          >
                            读取更早{k === "topic" ? "主题" : "回帖"}
                          </button>
                        ),
                    )}
                  </div>
                )}
                <p className="list-caption">
                  展示已读取的公开动态 · 最近 30 天
                </p>
              </div>
            )}
          </>
        ) : (
          <section className="settings">
            <button className="back" onClick={() => switchTab("friends")}>
              <ArrowLeft size={14} />
              返回饼友
            </button>
            <span className="eyebrow">KEEP IT YOURS</span>
            <h2>设置与备份</h2>
            <p className="intro">名单留在本机，随时可以带走。</p>
            <div className="settings-section">
              <h3>配置备份</h3>
              <p>包含饼友、备注、分组和置顶。动态缓存不随备份导出。</p>
              <div className="button-row">
                <button onClick={exportData}>
                  <Download size={16} />
                  导出备份
                </button>
                <button onClick={() => fileRef.current?.click()}>
                  <Upload size={16} />
                  导入备份
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void action(async () => {
                      if (file.size > 1000000)
                        throw new Error("备份文件不能超过 1MB。");
                      setBackup(parseBackup(JSON.parse(await file.text())));
                      setOverwrite(false);
                    });
                }}
              />
            </div>
            <div className="settings-section">
              <h3>动态缓存</h3>
              <p>
                每人最多 100 条，全局最多 2000 条，保留最近 30
                天。清理后可手动重新获取，名单和备注保留。
              </p>
              <button
                disabled={running || busy}
                onClick={() =>
                  action(async () => {
                    await call("clear-cache");
                    setNotice("动态缓存已清理");
                  })
                }
              >
                <Trash2 size={16} />
                清理动态缓存
              </button>
            </div>
            <div className="settings-section">
              <h3>页面连接</h3>
              <p>
                刷新时需要保留一个烧饼站标签页。遇到验证或登录提示，请在原站完成后再刷新。
              </p>
              <a
                className="button"
                href={SITE}
                target="_blank"
                rel="noreferrer"
              >
                打开烧饼站
                <ArrowUpRight size={16} />
              </a>
            </div>
            <footer className="about">
              <img src="./icon.svg" alt="" />
              <div>
                饼友 <span>0.1.1</span>
                <p>本地名单 · 手动刷新 · 无云端同步</p>
              </div>
            </footer>
          </section>
        )}
      </div>
      {tab !== "settings" && (
        <footer className="statusbar">
          <div className="status-copy">
            <span className={`dot ${running ? "working" : ""}`} />
            <div>
              <strong>
                {running
                  ? `${state.job!.done} / ${state.job!.total} 项 · ${state.job!.label}`
                  : state.job?.status === "partial"
                    ? "部分更新"
                    : state.job?.status === "error"
                      ? "刷新失败"
                      : state.job?.status === "cancelled"
                        ? "已停止刷新"
                        : state.job
                          ? "刷新完成"
                          : "本地名单已就绪"}
              </strong>
              <small>
                {state.job?.error ??
                  (running
                    ? "串行读取中，可随时停止"
                    : state.job
                      ? `${when(state.job.startedAt)} · 5 分钟内复用缓存`
                      : "手动更新主题与回帖")}
              </small>
            </div>
          </div>
          {running ? (
            <button
              onClick={() =>
                action(async () => {
                  await call("stop");
                })
              }
            >
              <Square size={14} />
              停止
            </button>
          ) : (
            <button
              className="primary"
              disabled={!all.length || busy}
              onClick={() =>
                action(async () => {
                  await call(
                    "refresh",
                    person && tab === "feed" ? { ids: [person] } : {},
                  );
                })
              }
            >
              <RefreshCw size={15} />
              刷新
            </button>
          )}
        </footer>
      )}
      {adding && (
        <Modal title="添加一位饼友" close={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                if (preview) {
                  await call("add", { profile: preview });
                  setAdding(false);
                  setNotice("已加入饼友");
                } else setPreview(await call<Profile>("lookup", { input }));
              });
            }}
          >
            <label>
              烧饼站 UID 或主页链接
              <input
                autoFocus
                placeholder="例如 1 或 https://linux.sb/user/1"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setPreview(undefined);
                }}
              />
            </label>
            {preview && (
              <div className="profile-preview">
                <Avatar friend={preview} />
                <div>
                  <strong>{preview.displayName}</strong>
                  <p>
                    UID {preview.userId}
                    {state.friends[preview.userId] ? " · 已在名单" : ""}
                  </p>
                </div>
                <Check size={18} />
              </div>
            )}
            {errorBox}
            <p className="hint">先打开一个烧饼站页面，便可预览用户资料。</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setAdding(false)}>
                取消
              </button>
              <button className="primary" disabled={busy || !input.trim()}>
                {busy ? "读取中…" : preview ? "确认加入" : "预览资料"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`记住 ${editing.displayName}`}
          close={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await call("patch", {
                  id: editing.userId,
                  patch: {
                    note,
                    groups: groupsText.split(/[,，]/),
                    pinned: state.friends[editing.userId]?.pinned ?? false,
                  },
                });
                setEditing(undefined);
                setNotice("备注已保存");
              });
            }}
          >
            <label>
              备注
              <textarea
                autoFocus
                rows={3}
                placeholder="比如：一起排查过 Docker 网络问题"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <span className="counter">{friendNoteLength(note)} / 80</span>
            </label>
            <label>
              分组
              <input
                placeholder="技术交流，项目合作"
                value={groupsText}
                onChange={(e) => setGroupsText(e.target.value)}
              />
            </label>
            <p className="hint">用逗号分隔，最多 10 个分组。</p>
            {errorBox}
            <div className="dialog-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setDeleting(editing);
                  setEditing(undefined);
                }}
              >
                <Trash2 size={14} />
                移除
              </button>
              <button
                className="primary"
                disabled={busy || friendNoteLength(note) > 80}
              >
                保存备注
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="移除饼友" close={() => setDeleting(undefined)}>
          <p className="dialog-copy">
            将移除 {deleting.displayName}{" "}
            的本地备注、分组和动态缓存。此操作不改变烧饼站上的关系。
          </p>
          {errorBox}
          <div className="dialog-actions">
            <button onClick={() => setDeleting(undefined)}>取消</button>
            <button
              className="danger solid"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await call("remove", { id: deleting.userId });
                  setDeleting(undefined);
                  setPerson("");
                  setNotice("已移除饼友");
                })
              }
            >
              确认移除
            </button>
          </div>
        </Modal>
      )}
      {backup && (
        <Modal title="导入备份" close={() => setBackup(undefined)}>
          <div className="import-stats">
            <span>
              <strong>{backup.friends.length - conflicts}</strong>新增饼友
            </span>
            <span>
              <strong>{conflicts}</strong>已在名单
            </span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            用备份覆盖已有备注、分组和置顶
          </label>
          <p className="hint">默认保留当前名单中已有饼友的设置。</p>
          {errorBox}
          <div className="dialog-actions">
            <button onClick={() => setBackup(undefined)}>取消</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await call("import", { backup, overwrite });
                  setBackup(undefined);
                  setNotice("备份已导入");
                })
              }
            >
              确认导入
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
