import { logger } from "./logger";
import type {
  YandexQueueItem,
  YandexQueueListResponse,
  YandexQueueResponse,
  YandexTrack,
  YandexTrackResponse,
  TrackInfo,
} from "./types";

const YANDEX_API_BASE = "https://api.music.yandex.net";

/**
 * Yandex Music API client.
 * Uses the unofficial API to fetch the user's play queue and track metadata.
 */
export class YandexMusicClient {
  private token: string;
  private deviceHeader: string;

  constructor(token: string) {
    this.token = token;
    // The X-Yandex-Music-Device header is required for queue endpoints
    this.deviceHeader =
      "os=unknown; os_version=unknown; manufacturer=unknown; " +
      "model=unknown; clid=; device_id=unknown; uuid=unknown";
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `OAuth ${this.token}`,
      "X-Yandex-Music-Device": this.deviceHeader,
      Accept: "application/json",
    };
  }

  /**
   * List all queues for the current user.
   */
  async getQueues(): Promise<YandexQueueItem[]> {
    const url = `${YANDEX_API_BASE}/queues`;
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      throw new Error(`Yandex API /queues returned ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as YandexQueueListResponse;
    return data.result?.queues ?? [];
  }

  /**
   * Get a specific queue by ID, containing tracks and current index.
   */
  async getQueue(queueId: string): Promise<YandexQueueResponse["result"] | null> {
    const url = `${YANDEX_API_BASE}/queues/${queueId}`;
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Yandex API /queues/${queueId} returned ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as YandexQueueResponse;
    return data.result;
  }

  /**
   * Fetch track metadata by track ID.
   */
  async getTrack(trackId: number | string): Promise<YandexTrack | null> {
    const url = `${YANDEX_API_BASE}/tracks/${trackId}`;
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Yandex API /tracks/${trackId} returned ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as YandexTrackResponse;
    return data.result?.[0] ?? null;
  }

  /**
   * Get the currently playing track from the user's most recent queue.
   * Returns null if no track is playing or the queue is empty.
   */
  async getCurrentTrack(): Promise<TrackInfo | null> {
    try {
      const queues = await this.getQueues();

      if (queues.length === 0) {
        logger.debug("No queues found");
        return null;
      }

      // Use the most recently modified queue
      const latestQueue = queues[0]!;
      const queue = await this.getQueue(latestQueue.id);

      if (!queue || !queue.tracks || queue.tracks.length === 0) {
        logger.debug("Queue is empty or has no tracks");
        return null;
      }

      const currentIndex = queue.currentIndex;
      if (currentIndex < 0 || currentIndex >= queue.tracks.length) {
        logger.debug("Current index out of bounds:", currentIndex);
        return null;
      }

      const currentTrackId = queue.tracks[currentIndex]!;
      const track = await this.getTrack(currentTrackId.trackId);

      if (!track) {
        logger.debug("Could not fetch track metadata for:", currentTrackId.trackId);
        return null;
      }

      const artist = track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
      const title = track.title || "Unknown Title";
      const album = track.albums?.[0]?.title || "";
      const durationMs = track.durationMs || 0;

      return { artist, title, album, durationMs };
    } catch (err) {
      logger.error("Error fetching current track from Yandex Music:", (err as Error).message);
      return null;
    }
  }
}
