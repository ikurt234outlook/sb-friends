import { describe, expect, it } from "vitest";
import { isNicknameLink, placeProfileAction } from "./pageIntegration";

describe("原站昵称标记与卡片操作", () => {
  it("只标记昵称，不标记同一用户的主题/回帖/收藏/头像链接", () => {
    document.body.innerHTML = `
      <nav><a href="https://linux.sb/user/1">我的主页</a></nav>
      <div class="tabs"><a href="https://linux.sb/user/1?tab=topics">主题</a><a href="https://linux.sb/user/1?tab=replies">回帖</a><a href="https://linux.sb/user/1?tab=favorites">收藏</a></div>
      <div class="user-header"><a class="user-name" href="https://linux.sb/user/1">甲</a><a href="https://linux.sb/user/1"><img alt="甲"/></a></div>
      <div class="user-links"><a href="https://linux.sb/user/1?tab=topics">TA的主题</a><a href="https://linux.sb/user/1?tab=replies">TA的回帖</a><a href="https://linux.sb/user/1?tab=favorites">TA的收藏</a></div>
      <li class="post-item"><div class="post-meta"><a href="https://linux.sb/user/1">甲</a></div><div class="post-info"><a class="post-author" href="https://linux.sb/user/2">乙</a></div></li>`;
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>("a")]
        .filter(isNicknameLink)
        .map((a) => a.textContent),
    ).toEqual(["甲", "甲", "乙"]);
  });
  it("操作按钮位于屏蔽 TA 后方，重复渲染不重复插入", () => {
    document.body.innerHTML = `<div class="user-card"><div class="user-wrap"><div class="user-header"></div><div class="user-links"><a href="/notify/1">私信TA</a></div></div><a class="btn-post">私信TA</a><button id="block">屏蔽 TA</button></div>`;
    const button = document.createElement("button");
    placeProfileAction(button, document);
    placeProfileAction(button, document);
    expect(button.previousElementSibling?.id).toBe("block");
    expect(button.parentElement?.className).toBe("user-card");
    expect(document.querySelectorAll(".user-card > button")).toHaveLength(2);
  });
});
