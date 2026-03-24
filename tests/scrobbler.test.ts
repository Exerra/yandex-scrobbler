import { describe, test, expect } from "bun:test";
import { isSameTrack, shouldScrobble, isStaleHistoryTrack } from "../src/scrobbler";
import type { TrackInfo } from "../src/types";

describe("isSameTrack", () => {
  const trackA: TrackInfo = {
    artist: "Artist A",
    title: "Song A",
    album: "Album A",
    durationMs: 200000,
  };

  const trackB: TrackInfo = {
    artist: "Artist B",
    title: "Song B",
    album: "Album B",
    durationMs: 300000,
  };

  test("returns true for two nulls", () => {
    expect(isSameTrack(null, null)).toBe(true);
  });

  test("returns false when one is null", () => {
    expect(isSameTrack(trackA, null)).toBe(false);
    expect(isSameTrack(null, trackA)).toBe(false);
  });

  test("returns true for identical tracks", () => {
    expect(isSameTrack(trackA, { ...trackA })).toBe(true);
  });

  test("returns false for different tracks", () => {
    expect(isSameTrack(trackA, trackB)).toBe(false);
  });

  test("returns true when album differs but artist, title, duration match", () => {
    const trackA2 = { ...trackA, album: "Different Album" };
    expect(isSameTrack(trackA, trackA2)).toBe(true);
  });

  test("returns false when artist differs", () => {
    const trackA2 = { ...trackA, artist: "Different Artist" };
    expect(isSameTrack(trackA, trackA2)).toBe(false);
  });

  test("returns false when title differs", () => {
    const trackA2 = { ...trackA, title: "Different Title" };
    expect(isSameTrack(trackA, trackA2)).toBe(false);
  });

  test("uses playedAt timestamp to compare history-based tracks", () => {
    const histTrack1: TrackInfo = { ...trackA, playedAt: "2026-03-09T15:00:00+00:00" };
    const histTrack2: TrackInfo = { ...trackA, playedAt: "2026-03-09T16:00:00+00:00" };
    // Same track metadata but different playedAt → different play event
    expect(isSameTrack(histTrack1, histTrack2)).toBe(false);
  });

  test("returns true for history tracks with same playedAt", () => {
    const histTrack1: TrackInfo = { ...trackA, playedAt: "2026-03-09T15:00:00+00:00" };
    const histTrack2: TrackInfo = { ...trackA, playedAt: "2026-03-09T15:00:00+00:00" };
    expect(isSameTrack(histTrack1, histTrack2)).toBe(true);
  });

  test("falls back to metadata comparison when no playedAt", () => {
    // Queue-based tracks (no playedAt) compare by metadata
    const queueTrack1: TrackInfo = { ...trackA };
    const queueTrack2: TrackInfo = { ...trackA };
    expect(isSameTrack(queueTrack1, queueTrack2)).toBe(true);
  });
});

describe("shouldScrobble", () => {
  test("returns false for very short listen time (<30s)", () => {
    expect(shouldScrobble(200000, 10000)).toBe(false); // 10s < 30s
    expect(shouldScrobble(200000, 29000)).toBe(false); // 29s < 30s
  });

  test("returns true after half of a short track", () => {
    // Track is 60s, half is 30s — should scrobble after 30s
    expect(shouldScrobble(60000, 30000)).toBe(true);
  });

  test("returns true after half of a medium track", () => {
    // Track is 200s, half is 100s — scrobble after 100s
    expect(shouldScrobble(200000, 100000)).toBe(true);
    expect(shouldScrobble(200000, 99000)).toBe(false);
  });

  test("scrobbles at 4 minutes for long tracks", () => {
    // Track is 10 minutes (600s), half is 300s, but min(300s, 240s) = 240s
    expect(shouldScrobble(600000, 240000)).toBe(true);
    expect(shouldScrobble(600000, 239000)).toBe(false);
  });

  test("handles unknown duration (0ms)", () => {
    // When duration is unknown, just require 30 seconds
    expect(shouldScrobble(0, 30000)).toBe(true);
    expect(shouldScrobble(0, 29000)).toBe(false);
  });

  test("handles very short track with enough listen time", () => {
    // Track is 40s, half is 20s, but minimum is 30s
    expect(shouldScrobble(40000, 20000)).toBe(false); // 20s < 30s minimum
    expect(shouldScrobble(40000, 30000)).toBe(true);  // 30s >= 30s minimum
  });
});

describe("shouldScrobble with history timestamp gaps", () => {
  // These tests validate the logic used in handleTrackChange for history-based
  // tracks, where the "elapsed" time is derived from the gap between consecutive
  // playedAt timestamps rather than wall-clock time.

  test("skipped track has small timestamp gap and is not scrobbled", () => {
    // Track is 200s, but user skipped after ~10s (gap between playedAt timestamps)
    const trackDurationMs = 200_000;
    const prevPlayedAt = new Date("2026-03-09T15:00:00+00:00").getTime();
    const nextPlayedAt = new Date("2026-03-09T15:00:10+00:00").getTime();
    const gap = nextPlayedAt - prevPlayedAt; // 10s
    expect(shouldScrobble(trackDurationMs, gap)).toBe(false);
  });

  test("fully played track has large timestamp gap and is scrobbled", () => {
    // Track is 200s, user listened fully (gap ≈ 200s)
    const trackDurationMs = 200_000;
    const prevPlayedAt = new Date("2026-03-09T15:00:00+00:00").getTime();
    const nextPlayedAt = new Date("2026-03-09T15:03:20+00:00").getTime();
    const gap = nextPlayedAt - prevPlayedAt; // 200s
    expect(shouldScrobble(trackDurationMs, gap)).toBe(true);
  });

  test("track played past half duration is scrobbled", () => {
    // Track is 200s, half is 100s. User listened ~110s before skipping.
    const trackDurationMs = 200_000;
    const prevPlayedAt = new Date("2026-03-09T15:00:00+00:00").getTime();
    const nextPlayedAt = new Date("2026-03-09T15:01:50+00:00").getTime();
    const gap = nextPlayedAt - prevPlayedAt; // 110s > 100s (half)
    expect(shouldScrobble(trackDurationMs, gap)).toBe(true);
  });

  test("track played less than half duration is not scrobbled", () => {
    // Track is 200s, half is 100s. User listened ~90s.
    const trackDurationMs = 200_000;
    const prevPlayedAt = new Date("2026-03-09T15:00:00+00:00").getTime();
    const nextPlayedAt = new Date("2026-03-09T15:01:30+00:00").getTime();
    const gap = nextPlayedAt - prevPlayedAt; // 90s < 100s (half)
    expect(shouldScrobble(trackDurationMs, gap)).toBe(false);
  });

  test("short track skipped quickly is not scrobbled", () => {
    // Track is 60s, user skipped after ~5s
    const trackDurationMs = 60_000;
    const prevPlayedAt = new Date("2026-03-09T15:00:00+00:00").getTime();
    const nextPlayedAt = new Date("2026-03-09T15:00:05+00:00").getTime();
    const gap = nextPlayedAt - prevPlayedAt; // 5s
    expect(shouldScrobble(trackDurationMs, gap)).toBe(false);
  });

  test("negative gap (clock issue) is not scrobbled", () => {
    // Edge case: next track has earlier timestamp (shouldn't happen but be safe)
    const trackDurationMs = 200_000;
    const gap = -5000;
    // gap < 0 means shouldScrobble gets negative elapsed → returns false
    expect(shouldScrobble(trackDurationMs, gap)).toBe(false);
  });
});

describe("isStaleHistoryTrack", () => {
  // The /contexts endpoint returns contexts that can span days or weeks.
  // Stale tracks (from old sessions) should be filtered out to prevent
  // scrobbling tracks from previous listening sessions.

  test("track played just now is not stale", () => {
    const now = Date.now();
    const playedAt = new Date(now - 30_000).toISOString(); // 30s ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(false);
  });

  test("track played within its duration is not stale", () => {
    const now = Date.now();
    const playedAt = new Date(now - 180_000).toISOString(); // 3 min ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(false); // 3min < 200s + 10min
  });

  test("track played hours ago is stale", () => {
    const now = Date.now();
    const playedAt = new Date(now - 3_600_000).toISOString(); // 1 hour ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(true);
  });

  test("track played yesterday is stale", () => {
    const now = Date.now();
    const playedAt = new Date(now - 86_400_000).toISOString(); // 24 hours ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(true);
  });

  test("track within duration + 10min buffer is not stale", () => {
    const now = Date.now();
    // Track is 200s. maxFreshAge = max(200s + 600s, 600s) = 800s = 13.3min
    const playedAt = new Date(now - 780_000).toISOString(); // 13 min ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(false);
  });

  test("track just past duration + 10min buffer is stale", () => {
    const now = Date.now();
    // Track is 200s. maxFreshAge = 800s. 801s > 800s
    const playedAt = new Date(now - 801_000).toISOString(); // 13min 21s ago
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(true);
  });

  test("enforces minimum 10-minute staleness for short tracks", () => {
    const now = Date.now();
    // Very short track (30s). maxFreshAge = max(30s + 600s, 600s) = 630s.
    // But minimum is 10min = 600s. Since 630s > 600s, use 630s.
    const playedAt = new Date(now - 620_000).toISOString(); // 10min 20s ago
    expect(isStaleHistoryTrack(playedAt, 30_000, now)).toBe(false); // 620s < 630s
  });

  test("enforces minimum 10-minute staleness for zero-duration tracks", () => {
    const now = Date.now();
    // Unknown duration (0). maxFreshAge = max(0 + 600s → 600s, 600s) = 600s.
    const playedAt9min = new Date(now - 540_000).toISOString(); // 9 min ago
    const playedAt11min = new Date(now - 660_000).toISOString(); // 11 min ago
    expect(isStaleHistoryTrack(playedAt9min, 0, now)).toBe(false);
    expect(isStaleHistoryTrack(playedAt11min, 0, now)).toBe(true);
  });

  test("long track has proportionally longer fresh window", () => {
    const now = Date.now();
    // 30-minute track (1800s). maxFreshAge = 1800s + 600s = 2400s = 40min
    const playedAt = new Date(now - 2_000_000).toISOString(); // 33 min ago
    expect(isStaleHistoryTrack(playedAt, 1_800_000, now)).toBe(false); // 33min < 40min
  });

  test("invalid timestamp is treated as stale", () => {
    expect(isStaleHistoryTrack("not-a-date", 200_000)).toBe(true);
    expect(isStaleHistoryTrack("", 200_000)).toBe(true);
  });

  test("future timestamp is not stale", () => {
    const now = Date.now();
    const playedAt = new Date(now + 60_000).toISOString(); // 1 min in future
    expect(isStaleHistoryTrack(playedAt, 200_000, now)).toBe(false);
  });
});
