export type Kind = "topic" | "reply";
export interface Profile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}
export interface Friend extends Profile {
  note: string;
  groups: string[];
  pinned: boolean;
  addedAt: string;
  updatedAt: string;
}
export interface Activity {
  id: string;
  actorUserId: string;
  topicAuthorUserId?: string;
  kind: Kind;
  title: string;
  excerpt?: string;
  topicId: string;
  replyId?: string;
  url: string;
  forumName?: string;
  occurredAt?: string;
  sourceTimeText?: string;
  topicReplyCount?: number;
  refreshedAt: string;
  isNew?: boolean;
}
export interface ActivityPage {
  profile: Profile;
  items: Activity[];
  nextPage?: number;
  viewerKey: string;
}
export interface Scope {
  lastSuccessAt?: string;
  latestPageAt?: string;
  error?: string;
  nextPage?: number;
  viewerKey?: string;
}
export interface Job {
  id: string;
  status: "running" | "success" | "partial" | "error" | "cancelled";
  done: number;
  total: number;
  label: string;
  startedAt: string;
  error?: string;
}
export interface State {
  schemaVersion: 1;
  site: "linux.sb";
  friends: Record<string, Friend>;
  activities: Record<string, Activity[]>;
  scopes: Record<string, Scope>;
  job?: Job;
  cooldownUntil?: number;
}
export interface Backup {
  schemaVersion: 1;
  site: "linux.sb";
  exportedAt: string;
  friends: Friend[];
}
export const STORAGE_KEY = "sbFriends:v1";
export const SITE = "https://linux.sb";
export const emptyState = (): State => ({
  schemaVersion: 1,
  site: "linux.sb",
  friends: {},
  activities: {},
  scopes: {},
});
export class SiteError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAt?: number,
  ) {
    super(message);
  }
}
export type Reply<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; retryAt?: number };
