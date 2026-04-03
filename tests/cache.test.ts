import { describe, expect, it } from "vitest";
import {
  POLL_CACHE_TTL_MS,
  createPollCacheSnapshot,
  parsePollCacheSnapshot,
} from "../app/lib/cache";
import { initialResults } from "../app/lib/poll-utils";

describe("poll cache helpers", () => {
  it("parses a fresh snapshot", () => {
    const snapshot = createPollCacheSnapshot({
      walletAddress: "GABC",
      walletBalance: "50",
      results: { ...initialResults, freighter: 2, total: 2 },
      events: [],
      cachedAt: "2026-04-02T12:00:00.000Z",
    });

    const parsed = parsePollCacheSnapshot(
      JSON.stringify(snapshot),
      new Date("2026-04-02T12:00:30.000Z").getTime(),
      POLL_CACHE_TTL_MS,
    );

    expect(parsed?.isFresh).toBe(true);
    expect(parsed?.snapshot.results.freighter).toBe(2);
  });

  it("marks an old snapshot as stale", () => {
    const snapshot = createPollCacheSnapshot({
      walletAddress: null,
      walletBalance: null,
      results: initialResults,
      events: [],
      cachedAt: "2026-04-02T12:00:00.000Z",
    });

    const parsed = parsePollCacheSnapshot(
      JSON.stringify(snapshot),
      new Date("2026-04-02T12:03:00.000Z").getTime(),
      POLL_CACHE_TTL_MS,
    );

    expect(parsed?.isFresh).toBe(false);
    expect(parsed?.ageMs).toBeGreaterThan(POLL_CACHE_TTL_MS);
  });
});
