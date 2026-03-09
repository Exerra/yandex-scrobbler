import { describe, test, expect } from "bun:test";
import { findLatestTrackFromContexts } from "../src/yandex";
import type { YandexContext } from "../src/types";

describe("findLatestTrackFromContexts", () => {
  test("returns null for empty contexts", () => {
    expect(findLatestTrackFromContexts([])).toBeNull();
  });

  test("returns null when contexts have no tracks", () => {
    const contexts: YandexContext[] = [
      { client: "web", context: "album", contextItem: 123, tracks: [] },
    ];
    expect(findLatestTrackFromContexts(contexts)).toBeNull();
  });

  test("returns the only track when there is one context with one track", () => {
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "album",
        contextItem: 123,
        tracks: [
          { trackId: { id: 100, albumId: 1 }, timestamp: "2026-03-09T22:00:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result).toEqual({
      trackId: 100,
      albumId: 1,
      timestamp: "2026-03-09T22:00:00+00:00",
    });
  });

  test("picks the track with the latest timestamp across contexts", () => {
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "playlist",
        contextItem: 1,
        tracks: [
          { trackId: { id: 200 }, timestamp: "2026-03-09T20:00:00+00:00" },
        ],
      },
      {
        client: "web",
        context: "album",
        contextItem: 2,
        tracks: [
          { trackId: { id: 300, albumId: 5 }, timestamp: "2026-03-09T22:00:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result!.trackId).toBe(300);
  });

  test("correctly compares timestamps with different timezone offsets", () => {
    // This is the key bug fix: string comparison would incorrectly pick the +03:00 timestamp
    // because "2026-03-10T01:00:00+03:00" > "2026-03-09T22:30:00+00:00" as strings,
    // even though 2026-03-10T01:00:00+03:00 = 22:00 UTC < 22:30 UTC.
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "radio",
        contextItem: "radio:wave",
        tracks: [
          // This is 22:00 UTC (earlier)
          { trackId: { id: 999 }, timestamp: "2026-03-10T01:00:00+03:00" },
        ],
      },
      {
        client: "web",
        context: "album",
        contextItem: 24089687,
        tracks: [
          // This is 22:30 UTC (later) — should be selected
          { trackId: { id: 108873885, albumId: 24089687 }, timestamp: "2026-03-09T22:30:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result!.trackId).toBe(108873885);
    expect(result!.albumId).toBe(24089687);
  });

  test("skips tracks with invalid timestamps", () => {
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "album",
        contextItem: 1,
        tracks: [
          { trackId: { id: 100 }, timestamp: "not-a-timestamp" },
        ],
      },
      {
        client: "web",
        context: "playlist",
        contextItem: 2,
        tracks: [
          { trackId: { id: 200, albumId: 10 }, timestamp: "2026-03-09T22:00:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result!.trackId).toBe(200);
  });

  test("handles multiple tracks per context", () => {
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "album",
        contextItem: 1,
        tracks: [
          { trackId: { id: 100 }, timestamp: "2026-03-09T20:00:00+00:00" },
          { trackId: { id: 101 }, timestamp: "2026-03-09T23:00:00+00:00" },
          { trackId: { id: 102 }, timestamp: "2026-03-09T21:00:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result!.trackId).toBe(101);
  });

  test("handles Z suffix and offset formats equally", () => {
    // "2026-03-09T22:30:00Z" and "2026-03-09T22:30:00+00:00" are the same time
    const contexts: YandexContext[] = [
      {
        client: "web",
        context: "album",
        contextItem: 1,
        tracks: [
          { trackId: { id: 100 }, timestamp: "2026-03-09T22:30:00Z" },
        ],
      },
      {
        client: "web",
        context: "playlist",
        contextItem: 2,
        tracks: [
          { trackId: { id: 200 }, timestamp: "2026-03-09T22:00:00+00:00" },
        ],
      },
    ];
    const result = findLatestTrackFromContexts(contexts);
    expect(result!.trackId).toBe(100);
  });
});
