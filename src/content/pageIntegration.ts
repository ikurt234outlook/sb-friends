import { uid } from "../shared/urls";

// A profile URL also appears in tabs and menus: only identity surfaces are marked.
export function isNicknameLink(link: HTMLAnchorElement): boolean {
  if (!link.textContent?.trim() || link.querySelector("img")) return false;
  if (link.closest("nav, .user-links, .tabs, .tab-bar, .pagination"))
    return false;
  try {
    uid(link.href);
    if (new URL(link.href).search) return false;
  } catch {
    return false;
  }
  return link.matches(
    ".user-header a.user-name, .post-info a.post-author, .post-item .post-meta a[href*='/user/']",
  );
}

export function placeProfileAction(
  button: HTMLButtonElement,
  doc: Document,
): void {
  const header = doc.querySelector(".user-header");
  if (!header) return;
  const card = header.closest(".user-card");
  const nativeActions = card
    ? [...card.querySelectorAll<HTMLElement>("a, button")].filter(
        (element) =>
          element !== button &&
          !element.closest(".user-links") &&
          /^(?:私信|屏蔽|取消屏蔽)\s*TA$/i.test(
            element.textContent?.trim() ?? "",
          ),
      )
    : [];
  const native = nativeActions.at(-1);
  if (native) {
    if (native.nextElementSibling !== button) native.after(button);
    const box = native.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      const style = getComputedStyle(native);
      // Match the actual action, without copying its message/block behavior classes.
      button.style.width = `${box.width}px`;
      button.style.height = `${box.height}px`;
      for (const key of [
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "fontSize",
        "fontFamily",
        "fontWeight",
        "lineHeight",
        "borderRadius",
      ] as const) {
        button.style[key] = style[key];
      }
    }
  } else {
    const host = card ?? header.parentElement ?? header;
    if (button.parentElement !== host) host.append(button);
    button.removeAttribute("style");
  }
}
