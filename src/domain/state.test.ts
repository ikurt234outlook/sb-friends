import { describe, it, expect } from "vitest";
import { emptyState, type ActivityPage, STORAGE_KEY } from "../shared/types";
import {
  addFriend,
  removeFriend,
  mergePage,
  importBackup,
  parseBackup,
  backupOf,
  friendPatch,
} from "./state";
import { createStore } from "../background/store";
const profile = { userId: "1", displayName: "甲" };
const page = (): ActivityPage => ({
  profile,
  viewerKey: "guest",
  items: [
    {
      id: "topic:2",
      kind: "topic",
      actorUserId: "1",
      topicId: "2",
      title: "主题",
      url: "https://linux.sb/topic/2",
      occurredAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
    },
  ],
});
describe("名单与缓存", () => {
  it("存储额度不足时清理缓存，保留名单并中止操作", async () => {
    let data: Record<string, unknown> = {};
    let first = true;
    const store = createStore({
      get: async () => structuredClone(data),
      set: async (value) => {
        if (first) {
          first = false;
          throw new Error("QUOTA_BYTES exceeded");
        }
        data = structuredClone(value);
      },
    });
    await expect(store.update((s) => addFriend(s, profile))).rejects.toThrow(
      "已清理动态缓存",
    );
    expect((await store.read()).friends["1"].displayName).toBe("甲");
    expect(data[STORAGE_KEY]).toHaveProperty("activities", {});
  });
  it("活动合并遵守每人及全局容量限制，名单不被裁剪", () => {
    let s = emptyState();
    for (let i = 1; i <= 21; i++) {
      const user = { userId: String(i), displayName: `用户${i}` };
      s = addFriend(s, user);
      const entries = Array.from({ length: 110 }, (_, index) => ({
        ...page().items[0],
        id: `topic:${i}-${index}`,
        actorUserId: String(i),
      }));
      s = mergePage(
        s,
        String(i),
        "topic",
        { profile: user, viewerKey: "guest", items: entries },
        s.friends[String(i)].addedAt,
      );
    }
    expect(Object.keys(s.friends)).toHaveLength(21);
    expect(Object.values(s.activities).flat()).toHaveLength(2000);
    expect(
      Object.values(s.activities).every((items) => items.length <= 100),
    ).toBe(true);
  });
  it("加载历史页不推迟最新页的缓存时间，也不标为新增", () => {
    let s = addFriend(emptyState(), profile);
    const generation = s.friends["1"].addedAt;
    const firstTime = new Date(Date.now() - 600000).toISOString();
    s = mergePage(s, "1", "topic", page(), generation, firstTime);
    const older = page();
    older.items[0] = { ...older.items[0], id: "topic:3", topicId: "3" };
    s = mergePage(s, "1", "topic", older, generation, undefined, 2);
    expect(s.scopes["1:topic"].latestPageAt).toBe(firstTime);
    expect(s.activities["1"].find((a) => a.id === "topic:3")?.isNew).toBe(
      false,
    );
  });
  it("改名保留备注、加入时间及 UID，合并刷新不重复", () => {
    let s = addFriend(emptyState(), profile);
    s.friends["1"].note = "熟人";
    const generation = s.friends["1"].addedAt;
    s = addFriend(s, { ...profile, displayName: "改名" });
    expect(s.friends["1"].note).toBe("熟人");
    expect(s.friends["1"].addedAt).toBe(generation);
    s = mergePage(s, "1", "topic", page(), generation);
    s = mergePage(s, "1", "topic", page(), generation);
    expect(s.activities["1"]).toHaveLength(1);
    expect(s.friends["1"].note).toBe("熟人");
  });
  it("迟到刷新不能复活已移除用户或覆盖重新添加的用户", () => {
    const s = addFriend(emptyState(), profile, "2026-11-01T00:00:00Z");
    const removed = removeFriend(s, "1");
    expect(
      mergePage(removed, "1", "topic", page(), s.friends["1"].addedAt),
    ).toEqual(removed);
    const readded = addFriend(removed, profile, "2026-11-02T00:00:00Z");
    expect(
      mergePage(readded, "1", "topic", page(), s.friends["1"].addedAt),
    ).toEqual(readded);
  });
  it("配置导入默认保留冲突，显式覆盖生效，错误站点被拒绝", () => {
    let s = addFriend(emptyState(), profile);
    s.friends["1"].note = "现在";
    const b = backupOf(s);
    b.friends = b.friends.map((f) => ({ ...f, note: "过去" }));
    const parsed = parseBackup(b);
    expect(importBackup(s, parsed, false).friends["1"].note).toBe("现在");
    expect(importBackup(s, parsed, true).friends["1"].note).toBe("过去");
    expect(() => parseBackup({ ...b, site: "linux.do" })).toThrow();
    expect(() =>
      parseBackup({ ...b, friends: [...b.friends, ...b.friends] }),
    ).toThrow();
    expect(backupOf(s)).not.toHaveProperty("activities");
  });
  it("备注按 Unicode 字符限制，分组规范化", () => {
    expect(
      friendPatch({
        note: "你好\n世界",
        groups: ["技术", " 技术 "],
        pinned: false,
      }),
    ).toEqual({ note: "你好 世界", groups: ["技术"], pinned: false });
    expect(() =>
      friendPatch({ note: "😀".repeat(81), groups: [], pinned: false }),
    ).toThrow("80");
  });
  it("账户观察值变化后不保留上一个账户的同类型缓存", () => {
    let s = addFriend(emptyState(), profile);
    const generation = s.friends["1"].addedAt;
    s = mergePage(s, "1", "topic", page(), generation);
    s = mergePage(
      s,
      "1",
      "topic",
      { profile, viewerKey: "user:8", items: [] },
      generation,
    );
    expect(s.activities["1"]).toEqual([]);
  });
  it("并发写入不会丢掉备注或另一个用户", async () => {
    let data: Record<string, unknown> = {};
    const store = createStore({
      get: async () => structuredClone(data),
      set: async (d) => {
        await new Promise((r) => setTimeout(r, 2));
        data = structuredClone(d);
      },
    });
    await Promise.all([
      store.update((s) => addFriend(s, profile)),
      store.update((s) => addFriend(s, { userId: "2", displayName: "乙" })),
    ]);
    const s = await store.read();
    expect(Object.keys(s.friends)).toEqual(["1", "2"]);
  });
});
