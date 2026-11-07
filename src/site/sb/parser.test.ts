import { describe, it, expect } from "vitest";
import { parseActivities, assertPage } from "./parser";
import { uid, userUrl, safeSiteUrl } from "../../shared/urls";

const doc = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
const header =
  '<a href="/login">登录</a><div class="user-header"><a class="user-name" href="/user/1">甲</a><img class="avatar-img" src="/avatar.png"></div>';
const row = (reply = true) =>
  `<li class="post-item"><a class="post-title" href="/topic/42${reply ? "?replyid=99" : ""}">主题 &amp; 标题</a>${reply ? '<div class="profile-reply-excerpt">回复内容</div>' : ""}<div class="post-meta"><span><a href="/user/${reply ? "2" : "1"}">${reply ? "乙" : "甲"}</a></span><span data-performance-time="1793934059">刚刚</span><span class="post-forum-meta"><a href="/forum/4">技术交流</a></span><span><svg><path d="M21 15a4 4 0 0 1-4 4"></path></svg>5</span><span>776</span></div></li>`;
describe("烧饼页面解析", () => {
  it("回帖行为人取主页用户，保留原主题作者，数字昵称不覆盖回复数", () => {
    const result = parseActivities(
      doc(
        `${header}<main><ul>${row()}</ul><a href="/user/1?tab=replies&p=2">下一页</a></main>`,
      ),
      "1",
      "reply",
      userUrl("1", "reply"),
    );
    expect(result.items[0]).toMatchObject({
      actorUserId: "1",
      topicAuthorUserId: "2",
      replyId: "99",
      topicReplyCount: 5,
      kind: "reply",
      title: "主题 & 标题",
      excerpt: "回复内容",
    });
    expect(result.nextPage).toBe(2);
    expect(result.viewerKey).toBe("guest");
  });
  it("主题页验证作者和活动类型", () => {
    expect(
      parseActivities(doc(header + row(false)), "1", "topic", userUrl("1"))
        .items[0].id,
    ).toBe("topic:42");
    expect(() =>
      parseActivities(doc(header + row()), "1", "topic", userUrl("1")),
    ).toThrow("动态链接格式");
  });
  it("确认空列表与结构变化分别处理", () => {
    expect(
      parseActivities(
        doc(header + "<main><p>暂无回帖</p></main>"),
        "1",
        "reply",
        userUrl("1", "reply"),
      ).items,
    ).toEqual([]);
    expect(() =>
      parseActivities(
        doc(header + "<main>新的排版</main>"),
        "1",
        "reply",
        userUrl("1", "reply"),
      ),
    ).toThrow("没有识别到");
  });
  it("登录、验证页和跨域响应不能被当成空动态", () => {
    expect(() =>
      assertPage(doc("<title>登录</title>"), "https://linux.sb/login"),
    ).toThrow("需要登录");
    expect(() =>
      assertPage(doc("<title>Just a moment...</title>"), userUrl("1")),
    ).toThrow("需要验证");
    expect(() => safeSiteUrl("https://example.com/user/1")).toThrow("其他站点");
  });
  it("URL 仅接受原站个人主页和数字 UID", () => {
    expect(uid("https://linux.sb/user/123?tab=topics")).toBe("123");
    expect(() => uid("https://evil.example/user/1")).toThrow();
    expect(() => uid("https://name@linux.sb/user/1")).toThrow();
    expect(() => uid("__proto__")).toThrow();
    expect(() => userUrl("1", "reply", -1)).toThrow();
  });
  it("缺失时间不伪造成当前时间，缺失评论图标不猜回复数", () => {
    const html = (header + row())
      .replace('data-performance-time="1793934059"', "")
      .replace("M21 15a4", "X");
    const item = parseActivities(doc(html), "1", "reply", userUrl("1", "reply"))
      .items[0];
    expect(item.occurredAt).toBeUndefined();
    expect(item.topicReplyCount).toBeUndefined();
  });
});
