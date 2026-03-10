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
        // History-based track: use the time gap between this track's playedAt
        // and the next track's playedAt to determine if it was actually played.
        // The /contexts endpoint returns all recently touched tracks including
        // skipped ones, so we compare timestamps to filter out short plays.
        const prevTime = new Date(prevTrack.playedAt).getTime();
        const nextTime = newTrack?.playedAt
          ? new Date(newTrack.playedAt).getTime()
          : Date.now();
        const gap = nextTime - prevTime;

        if (gap > 0 && shouldScrobble(prevTrack.durationMs, gap)) {
          const timestamp = Math.floor(prevTime / 1000);
          try {
            await this.lastfm.scrobble(prevTrack, timestamp);
          } catch (err) {
            logger.error("Failed to scrobble previous track:", (err as Error).message);
          }
        } else {
          logger.debug(
            `Skipped scrobble for "${prevTrack.artist} - ${prevTrack.title}" ` +
              `(history gap ${Math.round(Math.max(0, gap) / 1000)}s)`
          );
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
        // History-based track: don't scrobble immediately.
        // The /contexts endpoint returns all recently touched tracks including skipped ones.
        // We wait for a successor track and use the timestamp gap to determine
        // if this track was actually listened to (see handleTrackChange).
        logger.info(`♫ Detected (history): ${newTrack.artist} - ${newTrack.title}`);
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
