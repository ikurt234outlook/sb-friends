import {
  type State,
  type Profile,
  type Friend,
  type ActivityPage,
  type Backup,
  type Kind,
} from "../shared/types";
import { uid, avatar } from "../shared/urls";
import { normalizeFriendNoteInput, friendNoteLength } from "./friendNote";

export function normalizeProfile(value: unknown): Profile {
  const v = value as Partial<Profile>;
  if (
    !v ||
    typeof v.displayName !== "string" ||
    !v.displayName.trim() ||
    v.displayName.length > 100
  )
    throw new Error("用户资料格式不正确。");
  return {
    userId: uid(v.userId),
    displayName: v.displayName.trim(),
    avatarUrl: avatar(v.avatarUrl),
  };
}
export function friendPatch(
  value: unknown,
): Pick<Friend, "note" | "groups" | "pinned"> {
  const v = value as Partial<Friend>;
  if (
    !v ||
    typeof v.note !== "string" ||
    !Array.isArray(v.groups) ||
    typeof v.pinned !== "boolean"
  )
    throw new Error("备注或分组格式不正确。");
  const note = normalizeFriendNoteInput(v.note);
  if (friendNoteLength(note) > 80) throw new Error("备注最多 80 个字符。");
  if (
    v.groups.length > 10 ||
    v.groups.some((g) => typeof g !== "string" || g.trim().length > 20)
  )
    throw new Error("最多 10 个分组，每组最多 20 个字符。");
  return {
    note,
    groups: [...new Set(v.groups.map((g) => g.trim()).filter(Boolean))],
    pinned: v.pinned,
  };
}
export function addFriend(
  state: State,
  profile: Profile,
  now = new Date().toISOString(),
): State {
  const existing = state.friends[profile.userId];
  if (!existing && Object.keys(state.friends).length >= 200)
    throw new Error("首版最多保存 200 位饼友，请先整理名单。");
  return {
    ...state,
    friends: {
      ...state.friends,
      [profile.userId]: {
        ...(existing ?? { note: "", groups: [], pinned: false, addedAt: now }),
        ...profile,
        updatedAt: now,
      },
    },
  };
}
export function removeFriend(state: State, id: string): State {
  const friends = { ...state.friends },
    activities = { ...state.activities },
    scopes = { ...state.scopes };
  delete friends[id];
  delete activities[id];
  delete scopes[`${id}:topic`];
  delete scopes[`${id}:reply`];
  return { ...state, friends, activities, scopes };
}
export function mergePage(
  state: State,
  id: string,
  kind: Kind,
  page: ActivityPage,
  generation: string,
  now = new Date().toISOString(),
  pageNumber = 1,
): State {
  const friend = state.friends[id];
  if (!friend || friend.addedAt !== generation) return state;
  const key = `${id}:${kind}`;
  const before = state.scopes[key];
  const old = state.activities[id] ?? [];
  // Avoid retaining account-dependent data when the observed viewer changes.
  const viewerChanged =
    before?.viewerKey !== undefined && before.viewerKey !== page.viewerKey;
  const kept = viewerChanged ? old.filter((a) => a.kind !== kind) : old;
  const known = new Set(kept.map((a) => a.id));
  const merged = new Map(
    kept.map((a) => [a.id, { ...a, isNew: a.kind === kind ? false : a.isNew }]),
  );
  for (const item of page.items)
    merged.set(item.id, {
      ...item,
      isNew:
        pageNumber === 1 &&
        !!before?.latestPageAt &&
        !viewerChanged &&
        !known.has(item.id),
    });
  const cutoff = Date.parse(now) - 30 * 86400000;
  const time = (a: { occurredAt?: string; refreshedAt: string }) =>
    Date.parse(a.occurredAt ?? a.refreshedAt);
  const activities = {
    ...state.activities,
    [id]: [...merged.values()]
      .filter((a) => time(a) >= cutoff)
      .sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id))
      .slice(0, 100),
  };
  const global = Object.values(activities)
    .flat()
    .sort((a, b) => time(b) - time(a))
    .slice(0, 2000);
  const retained = new Set(global.map((a) => `${a.actorUserId}/${a.id}`));
  for (const owner of Object.keys(activities))
    activities[owner] = activities[owner].filter((a) =>
      retained.has(`${owner}/${a.id}`),
    );
  return {
    ...state,
    activities,
    friends: { ...state.friends, [id]: { ...friend, ...page.profile } },
    scopes: {
      ...state.scopes,
      [key]: {
        lastSuccessAt: now,
        latestPageAt:
          pageNumber === 1
            ? now
            : viewerChanged
              ? undefined
              : before?.latestPageAt,
        nextPage: page.nextPage,
        viewerKey: page.viewerKey,
      },
    },
  };
}
export function parseBackup(value: unknown): Backup {
  const v = value as Partial<Backup>;
  if (
    !v ||
    v.site !== "linux.sb" ||
    v.schemaVersion !== 1 ||
    !Array.isArray(v.friends) ||
    v.friends.length > 200
  )
    throw new Error("请选择饼友 v1 的 linux.sb 配置文件（最多 200 位）。");
  const ids = new Set<string>();
  const friends = v.friends.map((input) => {
    const p = normalizeProfile(input),
      patch = friendPatch(input);
    if (ids.has(p.userId)) throw new Error("备份包含重复 UID。");
    ids.add(p.userId);
    const now = new Date().toISOString();
    return { ...p, ...patch, addedAt: now, updatedAt: now };
  });
  return {
    schemaVersion: 1,
    site: "linux.sb",
    exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : "",
    friends,
  };
}
export function importBackup(
  state: State,
  backup: Backup,
  overwrite: boolean,
): State {
  let next = state;
  for (const friend of backup.friends) {
    if (next.friends[friend.userId] && !overwrite) continue;
    next = addFriend(next, friend);
    next.friends[friend.userId] = {
      ...next.friends[friend.userId],
      ...friendPatch(friend),
    };
  }
  return next;
}
export function backupOf(state: State): Backup {
  return {
    schemaVersion: 1,
    site: "linux.sb",
    exportedAt: new Date().toISOString(),
    friends: Object.values(state.friends),
  };
}
