import { SiteError, type Kind, type ActivityPage } from "../../shared/types";
import { userUrl, safeSiteUrl } from "../../shared/urls";
import {
  parseActivities,
  parseProfile,
  currentViewer,
  assertPage,
} from "./parser";

export async function fetchPage(
  id: string,
  kind: Kind,
  page: number,
  signal: AbortSignal,
  profileOnly = false,
): Promise<ActivityPage> {
  const response = await fetch(userUrl(id, kind, page), {
    credentials: "include",
    signal,
    headers: { Accept: "text/html" },
  });
  safeSiteUrl(response.url);
  if (response.status === 429) {
    const retry = response.headers.get("Retry-After");
    const retryAt =
      retry && /^\d+$/.test(retry)
        ? Date.now() + Number(retry) * 1000
        : Date.parse(retry ?? "");
    throw new SiteError(
      "rate-limit",
      "请求过于频繁，本轮已停止。请在冷却结束后再刷新。",
      Number.isFinite(retryAt) && retryAt > Date.now()
        ? retryAt
        : Date.now() + 600000,
    );
  }
  if (
    response.status === 403 ||
    response.headers.get("cf-mitigated") === "challenge"
  )
    throw new SiteError(
      "challenge",
      "站点拒绝访问或需要验证，请打开烧饼站检查。",
      Date.now() + 600000,
    );
  if (response.status === 404)
    throw new SiteError("not-found", "用户不存在或已不可访问。");
  if (!response.ok)
    throw new SiteError(
      "http",
      `烧饼站返回 HTTP ${response.status}，请稍后重试。`,
    );
  const html = await response.text();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (profileOnly) {
    assertPage(doc, response.url);
    return {
      profile: parseProfile(doc, id),
      items: [],
      viewerKey: currentViewer(doc),
    };
  }
  return parseActivities(doc, id, kind, response.url);
}
