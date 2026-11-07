import { SITE, SiteError, type Kind } from "./types";
export function uid(input: unknown): string {
  if (typeof input !== "string")
    throw new Error("请输入烧饼站 UID 或个人主页链接。");
  let value = input.trim();
  if (!/^\d+$/.test(value)) {
    let url: URL;
    try {
      url = new URL(value, SITE);
    } catch {
      throw new Error("主页链接格式不正确。");
    }
    if (!url.href.startsWith(`${SITE}/`))
      throw new Error("只支持 https://linux.sb 的用户主页。");
    value = url.pathname.match(/^\/user\/(\d+)\/?$/)?.[1] ?? "";
  }
  if (!/^[1-9]\d{0,14}$/.test(value))
    throw new Error("请输入有效的数字 UID 或 /user/UID 主页链接。");
  return value;
}
export function userUrl(id: string, kind: Kind = "topic", page = 1): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new Error("分页参数不正确。");
  return `${SITE}/user/${uid(id)}?tab=${kind === "topic" ? "topics" : "replies"}&p=${page}`;
}
export function safeSiteUrl(value: string): string {
  const url = new URL(value, SITE);
  if (!url.href.startsWith(`${SITE}/`))
    throw new SiteError("invalid", "页面链接指向了其他站点。");
  return url.href;
}
export function avatar(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, SITE);
    return url.href.startsWith(`${SITE}/`) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
