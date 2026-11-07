// Adapted from linuxdo-friends (MIT), Copyright (c) 2026 lafish.
export const MAX_FRIEND_NOTE_LENGTH = 80;
export function friendNoteLength(value: string): number {
  return Array.from(value).length;
}
export function normalizeFriendNoteInput(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
