import { describe, test, expect } from "bun:test";
import { isSameTrack, shouldScrobble } from "../src/scrobbler";
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
