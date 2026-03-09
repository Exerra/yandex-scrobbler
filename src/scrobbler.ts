import { YandexMusicClient } from "./yandex";
import { LastfmClient } from "./lastfm";
import { logger } from "./logger";
import type { TrackInfo, ScrobblerConfig } from "./types";

/**
 * Determines if two TrackInfo objects represent the same track.
 */
export function isSameTrack(a: TrackInfo | null, b: TrackInfo | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
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
        // Track changed — scrobble the previous track if eligible
        await this.handleTrackChange(currentTrack);
      } else if (currentTrack && !this.state.scrobbled) {
        // Same track still playing — check if we should scrobble it now
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

    // Update state with the new track
    this.state.lastTrack = newTrack;
    this.state.lastTrackStartTime = Date.now();
    this.state.scrobbled = false;
    this.state.nowPlayingUpdated = false;

    if (newTrack) {
      logger.info(`♫ Now playing: ${newTrack.artist} - ${newTrack.title}`);

      // Update Now Playing on Last.fm
      try {
        await this.lastfm.updateNowPlaying(newTrack);
        this.state.nowPlayingUpdated = true;
      } catch (err) {
        logger.error("Failed to update Now Playing:", (err as Error).message);
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
