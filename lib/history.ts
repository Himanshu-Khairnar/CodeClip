/**
 * Clips created on this device, kept in localStorage. The owner token
 * stored here is what lets this browser edit or delete a clip.
 * Client-only — never import from server code.
 */

export interface HistoryItem {
  code: string;
  url: string;
  textSnippet: string;
  fileCount: number;
  createdAt: number;
  expiresAt?: number;
  ownerToken?: string;
  burnAfterRead?: boolean;
  hasPassword?: boolean;
}

const HISTORY_KEY = "codeclip-history";
const MAX_ITEMS = 20;

function write(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // storage full or blocked — ignore
  }
}

/** Saved clips, minus any that have already expired. */
export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const items = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    const live = items.filter((h) => !h.expiresAt || h.expiresAt > Date.now());
    if (live.length !== items.length) write(live);
    return live;
  } catch {
    return [];
  }
}

export function saveHistoryItem(item: HistoryItem) {
  const items = loadHistory().filter((h) => h.code !== item.code);
  items.unshift(item);
  write(items.slice(0, MAX_ITEMS));
}

export function removeHistoryItem(code: string): HistoryItem[] {
  const next = loadHistory().filter((h) => h.code !== code);
  write(next);
  return next;
}

export function getOwnerToken(code: string): string | undefined {
  return loadHistory().find((h) => h.code === code)?.ownerToken;
}

/** Headers that identify this browser as the clip's creator, if it is. */
export function ownerHeaders(code: string): Record<string, string> {
  const token = getOwnerToken(code);
  return token ? { "x-owner-token": token } : {};
}
