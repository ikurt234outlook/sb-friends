import {
  type Profile,
  type Activity,
  type ActivityPage,
  type Kind,
  SiteError,
} from "../../shared/types";
import { uid, avatar, safeSiteUrl } from "../../shared/urls";

const text = (element: Element | null) => element?.textContent?.trim() ?? "";
function linkUid(link: Element | null): string | undefined {
  try {
    return uid(link?.getAttribute("href"));
  } catch {
    return undefined;
  }
}
export function assertPage(doc: Document, finalUrl: string): void {
  const url = new URL(safeSiteUrl(finalUrl));
  if (
    /^\/login(?:\/|$)/.test(url.pathname) ||
    doc.querySelector('form[action*="login"]')
  ) {
    throw new SiteError("login", "这个页面需要登录，请先在烧饼站登录后重试。");
  }
  if (
    /just a moment|安全验证|请完成验证|attention required/i.test(doc.title) ||
    doc.querySelector(
      "#challenge-form, #cf-challenge-running, [data-cap-widget]",
    )
  ) {
    throw new SiteError(
      "challenge",
      "页面需要验证，请在烧饼站完成验证后重试。",
    );
  }
  if (
    /404|用户不存在/.test(doc.title) ||
    /^(用户不存在|该用户不存在|404 Not Found)$/.test(
      text(doc.querySelector("h1")),
    )
  ) {
    throw new SiteError("not-found", "用户不存在或当前不可访问。");
  }
}
export function parseProfile(doc: Document, requestedId: string): Profile {
  const id = uid(requestedId);
  const name = doc.querySelector(
    ".user-header .user-name, .user-card .user-name",
  );
  if (!name || linkUid(name) !== id || !text(name))
    throw new SiteError("structure", "无法识别用户资料，原站页面可能已变化。");
  const host = name.closest(".user-header, .user-card");
  return {
    userId: id,
    displayName: text(name).slice(0, 100),
    avatarUrl: avatar(
      host?.querySelector("img.avatar-img")?.getAttribute("src") ?? undefined,
    ),
  };
}
export function currentViewer(doc: Document): string {
  const id = linkUid(doc.querySelector("a.nav-mine"));
  if (id) return `user:${id}`;
  if (doc.querySelector('a[href^="/login"]')) return "guest";
  return "unknown";
}
export function parseActivities(
  doc: Document,
  requestedId: string,
  kind: Kind,
  sourceUrl: string,
  now = new Date().toISOString(),
): ActivityPage {
  assertPage(doc, sourceUrl);
  const profile = parseProfile(doc, requestedId);
  const source = new URL(safeSiteUrl(sourceUrl));
  if (
    uid(source.href) !== profile.userId ||
    (source.searchParams.get("tab") ?? "topics") !==
      (kind === "topic" ? "topics" : "replies")
  ) {
    throw new SiteError("structure", "返回的用户或动态类型与请求不一致。");
  }
  const rows = [...doc.querySelectorAll("li.post-item")];
  const items: Activity[] = [];
  for (const row of rows) {
    const title = row.querySelector("a.post-title");
    if (!title || !text(title))
      throw new SiteError("structure", "动态列表缺少标题，已保留原有数据。");
    const url = new URL(safeSiteUrl(title.getAttribute("href") ?? ""));
    const topicId = url.pathname.match(/^\/topic\/(\d+)\/?$/)?.[1];
    const replyId = url.searchParams.get("replyid") ?? undefined;
    if (
      !topicId ||
      (kind === "reply" && !replyId) ||
      (kind === "topic" && replyId)
    )
      throw new SiteError("structure", "动态链接格式已变化。");
    const meta = row.querySelector(".post-meta");
    const time = meta?.querySelector("[data-performance-time]");
    const raw = time?.getAttribute("data-performance-time");
    const millis = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : NaN;
    const occurredAt =
      Number.isFinite(millis) &&
      millis > 0 &&
      millis <= Date.parse(now) + 86400000
        ? new Date(millis).toISOString()
        : undefined;
    const topicAuthorUserId = linkUid(
      meta?.querySelector('a[href*="/user/"]') ?? null,
    );
    if (kind === "topic" && topicAuthorUserId !== requestedId)
      throw new SiteError("structure", "主题作者与个人主页不一致。");
    // The speech-bubble SVG identifies the count; the final author can have a numeric name.
    const countSpan = [...(meta?.querySelectorAll(":scope > span") ?? [])].find(
      (span) =>
        [...span.querySelectorAll("svg path")].some((path) =>
          /M21 15a4/.test(path.getAttribute("d") ?? ""),
        ),
    );
    const count = text(countSpan ?? null);
    items.push({
      id: kind === "reply" ? `reply:${topicId}:${replyId}` : `topic:${topicId}`,
      actorUserId: profile.userId,
      topicAuthorUserId,
      kind,
      title: text(title).slice(0, 300),
      topicId,
      replyId,
      url: url.href,
      excerpt:
        kind === "reply"
          ? text(row.querySelector(".profile-reply-excerpt")).slice(0, 500)
          : undefined,
      forumName:
        text(row.querySelector(".post-forum-meta a, .post-forum-badge")).slice(
          0,
          80,
        ) || undefined,
      occurredAt,
      sourceTimeText: text(time ?? null) || undefined,
      topicReplyCount: /^\d+$/.test(count) ? Number(count) : undefined,
      refreshedAt: now,
    });
  }
  if (!rows.length) {
    const empty = [
      ...doc.querySelectorAll(
        "main p, main .empty, main .empty-state, main .alert, main .text-muted, .post-list",
      ),
    ].some((node) =>
      /暂无(?:主题|回帖|回复|帖子|内容|数据)|还没有(?:发布|回复|发表|主题|回帖)/.test(
        text(node),
      ),
    );
    if (!empty)
      throw new SiteError("structure", "没有识别到动态列表，已保留原有数据。");
  }
  let nextPage: number | undefined;
  const next = [...doc.querySelectorAll("a")].find((a) => text(a) === "下一页");
  if (next) {
    const nextUrl = new URL(safeSiteUrl(next.getAttribute("href") ?? ""));
    const n = Number(nextUrl.searchParams.get("p"));
    if (
      uid(nextUrl.href) === profile.userId &&
      nextUrl.searchParams.get("tab") ===
        (kind === "topic" ? "topics" : "replies") &&
      Number.isSafeInteger(n) &&
      n > Number(source.searchParams.get("p") ?? 1) &&
      n <= 10000
    )
      nextPage = n;
  }
  return { profile, items, nextPage, viewerKey: currentViewer(doc) };
}
