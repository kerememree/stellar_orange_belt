import type { ContractEventFeedItem, PollResults } from "@/app/lib/types";

export const POLL_CACHE_KEY = "stellar-orange-belt-poll-cache";
export const POLL_CACHE_TTL_MS = 60_000;

export type PollCacheSnapshot = {
  walletAddress: string | null;
  walletBalance: string | null;
  results: PollResults;
  events: ContractEventFeedItem[];
  cachedAt: string;
};

export type ParsedPollCache = {
  snapshot: PollCacheSnapshot;
  ageMs: number;
  isFresh: boolean;
};

type StorageLike = Pick<Storage, "setItem" | "removeItem">;

function isPollResults(value: unknown): value is PollResults {
  if (typeof value !== "object" || !value) {
    return false;
  }

  const candidate = value as Partial<PollResults>;

  return (
    typeof candidate.freighter === "number" &&
    typeof candidate.xbull === "number" &&
    typeof candidate.total === "number"
  );
}

function isEventFeed(value: unknown): value is ContractEventFeedItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ContractEventFeedItem).id === "string" &&
        Array.isArray((item as ContractEventFeedItem).topics),
    )
  );
}

export function createPollCacheSnapshot(input: {
  walletAddress: string | null;
  walletBalance: string | null;
  results: PollResults;
  events: ContractEventFeedItem[];
  cachedAt?: string;
}): PollCacheSnapshot {
  return {
    walletAddress: input.walletAddress,
    walletBalance: input.walletBalance,
    results: input.results,
    events: input.events,
    cachedAt: input.cachedAt ?? new Date().toISOString(),
  };
}

export function parsePollCacheSnapshot(
  rawValue: string | null,
  now = Date.now(),
  ttlMs = POLL_CACHE_TTL_MS,
): ParsedPollCache | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PollCacheSnapshot>;

    if (
      typeof parsed.cachedAt !== "string" ||
      !isPollResults(parsed.results) ||
      !isEventFeed(parsed.events)
    ) {
      return null;
    }

    const ageMs = Math.max(0, now - new Date(parsed.cachedAt).getTime());

    return {
      snapshot: {
        walletAddress:
          typeof parsed.walletAddress === "string" ? parsed.walletAddress : null,
        walletBalance:
          typeof parsed.walletBalance === "string" ? parsed.walletBalance : null,
        results: parsed.results,
        events: parsed.events,
        cachedAt: parsed.cachedAt,
      },
      ageMs,
      isFresh: ageMs <= ttlMs,
    };
  } catch {
    return null;
  }
}

export function persistPollCache(storage: StorageLike, snapshot: PollCacheSnapshot) {
  storage.setItem(POLL_CACHE_KEY, JSON.stringify(snapshot));
}

export function clearPollCache(storage: StorageLike) {
  storage.removeItem(POLL_CACHE_KEY);
}
