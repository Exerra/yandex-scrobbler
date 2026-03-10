import { YandexMusicClient } from "./yandex";
import { LastfmClient } from "./lastfm";
import { logger } from "./logger";
import type { TrackInfo, ScrobblerConfig } from "./types";

/**
 * Determines if two TrackInfo objects represent the same track.
 * When tracks have playedAt timestamps (from history), compare those too.
 */
export function isSameTrack(a: TrackInfo | null, b: TrackInfo | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // If both have playedAt (from history), a different timestamp means a different play event
  if (a.playedAt && b.playedAt) {
    return a.playedAt === b.playedAt;
  }

  return a.artist === b.artist && a.title === b.title && a.durationMs === b.durationMs;
}

/**
 * Determines whether a track should be scrobbled based on Last.fm rules:
 * - The track must have been played for at least 4 minutes, or
 * - The track must have been played for at least half its duration.
 * - Minimum 30 seconds to avoid accidental scrobbles.
 */
export function shouldScrobble(
  durationMs: number,
  elapsedMs: number
): boolean {
  const MIN_SCROBBLE_MS = 30_000; // 30 seconds minimum
  const FOUR_MINUTES_MS = 240_000; // 4 minutes

  if (elapsedMs < MIN_SCROBBLE_MS) return false;

  const halfDuration = durationMs / 2;

  // If we don't know the duration, require at least 30 seconds
  if (durationMs <= 0) return elapsedMs >= MIN_SCROBBLE_MS;

  return elapsedMs >= Math.min(halfDuration, FOUR_MINUTES_MS);
}

/**
 * Determines if a history track (from /contexts) is "stale" — i.e., from a
 * previous listening session rather than the current one.
 *
 * The /contexts endpoint returns all recently-listened contexts, which can span
 * days or weeks. When the scrobbler starts (or after a long pause), the latest
 * context track may be from a completely different session. We must not scrobble
 * those stale tracks when a fresh track eventually appears as their successor.
 *
 * A track is stale if its playedAt timestamp is older than its duration + a
 * generous buffer from the reference time (defaults to now).
 */
export function isStaleHistoryTrack(
  playedAt: string,
  durationMs: number,
  now: number = Date.now()
): boolean {
  const playedAtTime = new Date(playedAt).getTime();
  if (Number.isNaN(playedAtTime)) return true; // invalid timestamp → treat as stale

  const ageMs = now - playedAtTime;

  const STALE_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
  const maxFreshAge = Math.max(durationMs + STALE_BUFFER_MS, STALE_BUFFER_MS);

  return ageMs > maxFreshAge;
}

export interface ScrobblerState {
  lastTrack: TrackInfo | null;
  lastTrackStartTime: number;
  scrobbled: boolean;
  nowPlayingUpdated: boolean;
}

/**
 * Main scrobbler that polls Yandex Music and scrobbles to Last.fm.
 */
export class Scrobbler {
  private yandex: YandexMusicClient;
  private lastfm: LastfmClient;
  private pollingIntervalMs: number;
  private state: ScrobblerState;
  private running: boolean = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ScrobblerConfig) {
    this.yandex = new YandexMusicClient(config.yandexToken);
    this.lastfm = new LastfmClient(
      config.lastfmApiKey,
      config.lastfmApiSecret,
      config.lastfmSessionKey
    );
    this.pollingIntervalMs = config.pollingIntervalMs;
    this.state = {
      lastTrack: null,
      lastTrackStartTime: 0,
      scrobbled: false,
      nowPlayingUpdated: false,
    };
  }

  /**
   * Process one poll cycle: fetch current track, handle changes, scrobble if needed.
   * Exposed for testing.
   */
  async poll(): Promise<void> {
    try {
      const currentTrack = await this.yandex.getCurrentTrack();

      if (!isSameTrack(currentTrack, this.state.lastTrack)) {
        // Track changed — handle the transition
        await this.handleTrackChange(currentTrack);
      } else if (currentTrack && !this.state.scrobbled && !currentTrack.playedAt) {
        // Same queue-based track still playing — check if we should scrobble it now.
        // History-based tracks (with playedAt) are already finished playing;
        // we wait for a successor track to confirm they were actually listened to.
        const elapsed = Date.now() - this.state.lastTrackStartTime;
        if (shouldScrobble(currentTrack.durationMs, elapsed)) {
          try {
            await this.lastfm.scrobble(currentTrack, Math.floor(this.state.lastTrackStartTime / 1000));
            this.state.scrobbled = true;
          } catch (err) {
            logger.error("Failed to scrobble:", (err as Error).message);
          }
        }
      }
    } catch (err) {
      logger.error("Error during poll cycle:", (err as Error).message);
    }
  }

  private async handleTrackChange(newTrack: TrackInfo | null): Promise<void> {
    const prevTrack = this.state.lastTrack;
    const prevStartTime = this.state.lastTrackStartTime;

    // Scrobble the previous track if it hasn't been scrobbled yet
    if (prevTrack && !this.state.scrobbled) {
      if (prevTrack.playedAt) {
        // History-based track: the /contexts endpoint's timestamps for radio
        // tracks are unreliable for determining play duration (gaps of seconds
        // between tracks that were fully played). Instead, trust that a track
        // appearing in the current session's history was actually played.
        // Stale tracks (from old sessions) were already marked as scrobbled
        // on detection and won't reach here.
        const timestamp = Math.floor(new Date(prevTrack.playedAt).getTime() / 1000);
        try {
          await this.lastfm.scrobble(prevTrack, timestamp);
        } catch (err) {
          logger.error("Failed to scrobble previous track:", (err as Error).message);
        }
      } else {
        // Queue-based track: use elapsed wall-clock time since detection
        const elapsed = Date.now() - prevStartTime;
        if (shouldScrobble(prevTrack.durationMs, elapsed)) {
          try {
            await this.lastfm.scrobble(prevTrack, Math.floor(prevStartTime / 1000));
          } catch (err) {
            logger.error("Failed to scrobble previous track:", (err as Error).message);
          }
        } else {
          logger.debug(
            `Skipped scrobble for "${prevTrack.artist} - ${prevTrack.title}" ` +
              `(played ${Math.round(elapsed / 1000)}s)`
          );
        }
      }
    }

    // Update state with the new track
    this.state.lastTrack = newTrack;
    this.state.lastTrackStartTime = Date.now();
    this.state.scrobbled = false;
    this.state.nowPlayingUpdated = false;

    if (newTrack) {
      if (newTrack.playedAt) {
        // History-based track from /contexts.
        // Check if the track is stale (from a previous listening session).
        // If so, mark it as already scrobbled so it won't be scrobbled when
        // a successor appears.
        if (isStaleHistoryTrack(newTrack.playedAt, newTrack.durationMs)) {
          this.state.scrobbled = true;
          logger.debug(
            `Ignoring stale history track: ${newTrack.artist} - ${newTrack.title} ` +
              `(playedAt: ${newTrack.playedAt})`
          );
        } else {
          logger.info(`♫ Detected (history): ${newTrack.artist} - ${newTrack.title}`);
        }
      } else {
        // Queue-based track: this is actually playing right now
        logger.info(`♫ Now playing (queue): ${newTrack.artist} - ${newTrack.title}`);
        try {
          await this.lastfm.updateNowPlaying(newTrack);
          this.state.nowPlayingUpdated = true;
        } catch (err) {
          logger.error("Failed to update Now Playing:", (err as Error).message);
        }
      }
    } else {
      logger.debug("No track currently playing");
    }
  }

  /**
   * Start the scrobbler loop.
   */
  start(): void {
    if (this.running) {
      logger.warn("Scrobbler is already running");
      return;
    }

    this.running = true;
    logger.info("Yandex Music → Last.fm scrobbler started");
    logger.info(`Polling every ${this.pollingIntervalMs / 1000} seconds`);

    const loop = async () => {
      if (!this.running) return;
      await this.poll();
      this.timer = setTimeout(loop, this.pollingIntervalMs);
    };

    loop();
  }

  /**
   * Stop the scrobbler loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("Scrobbler stopped");
  }

  /** Check if the scrobbler is currently running */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the current scrobbler state (for testing) */
  getState(): Readonly<ScrobblerState> {
    return { ...this.state };
  }
}
