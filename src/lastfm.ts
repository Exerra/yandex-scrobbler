import { createHash } from "crypto";
import { logger } from "./logger";
import type {
  LastfmTokenResponse,
  LastfmSessionResponse,
  LastfmScrobbleResponse,
  TrackInfo,
} from "./types";

const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

/**
 * Generate a Last.fm API method signature.
 * Parameters are sorted alphabetically, concatenated as key+value pairs,
 * then the shared secret is appended. The result is MD5-hashed.
 */
export function generateApiSig(
  params: Record<string, string>,
  secret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  let sigString = "";
  for (const key of sortedKeys) {
    if (key === "format") continue; // format is excluded from signature
    sigString += key + params[key];
  }
  sigString += secret;

  return createHash("md5").update(sigString, "utf8").digest("hex");
}

/**
 * Last.fm API client for authentication, scrobbling, and now-playing updates.
 */
export class LastfmClient {
  private apiKey: string;
  private apiSecret: string;
  private sessionKey: string;

  constructor(apiKey: string, apiSecret: string, sessionKey: string = "") {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.sessionKey = sessionKey;
  }

  setSessionKey(key: string): void {
    this.sessionKey = key;
  }

  /**
   * Make a signed POST request to the Last.fm API.
   */
  private async apiPost(params: Record<string, string>): Promise<unknown> {
    params.api_key = this.apiKey;
    params.format = "json";

    if (this.sessionKey) {
      params.sk = this.sessionKey;
    }

    params.api_sig = generateApiSig(params, this.apiSecret);

    const body = new URLSearchParams(params);
    const res = await fetch(LASTFM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();

    if ((data as Record<string, unknown>).error) {
      throw new Error(
        `Last.fm API error ${(data as Record<string, unknown>).error}: ${(data as Record<string, unknown>).message}`
      );
    }

    return data;
  }

  /**
   * Make a signed GET request to the Last.fm API.
   */
  private async apiGet(params: Record<string, string>): Promise<unknown> {
    params.api_key = this.apiKey;
    params.format = "json";

    params.api_sig = generateApiSig(params, this.apiSecret);

    const url = new URL(LASTFM_API_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if ((data as Record<string, unknown>).error) {
      throw new Error(
        `Last.fm API error ${(data as Record<string, unknown>).error}: ${(data as Record<string, unknown>).message}`
      );
    }

    return data;
  }

  /**
   * Step 1 of desktop auth: request an unauthorized token.
   */
  async getToken(): Promise<string> {
    const data = (await this.apiGet({ method: "auth.getToken" })) as LastfmTokenResponse;
    return data.token;
  }

  /**
   * Step 3 of desktop auth: exchange the authorized token for a session key.
   */
  async getSession(token: string): Promise<LastfmSessionResponse["session"]> {
    const data = (await this.apiPost({
      method: "auth.getSession",
      token,
    })) as LastfmSessionResponse;
    return data.session;
  }

  /**
   * Update the user's "Now Playing" status on Last.fm.
   */
  async updateNowPlaying(track: TrackInfo): Promise<void> {
    const params: Record<string, string> = {
      method: "track.updateNowPlaying",
      artist: track.artist,
      track: track.title,
    };

    if (track.album) {
      params.album = track.album;
    }

    if (track.durationMs > 0) {
      params.duration = String(Math.round(track.durationMs / 1000));
    }

    await this.apiPost(params);
    logger.debug(`Updated Now Playing: ${track.artist} - ${track.title}`);
  }

  /**
   * Scrobble a track to Last.fm.
   */
  async scrobble(track: TrackInfo, timestamp: number): Promise<void> {
    const params: Record<string, string> = {
      method: "track.scrobble",
      artist: track.artist,
      track: track.title,
      timestamp: String(timestamp),
    };

    if (track.album) {
      params.album = track.album;
    }

    if (track.durationMs > 0) {
      params.duration = String(Math.round(track.durationMs / 1000));
    }

    const data = (await this.apiPost(params)) as LastfmScrobbleResponse;
    const accepted = data?.scrobbles?.["@attr"]?.accepted ?? 0;
    const ignored = data?.scrobbles?.["@attr"]?.ignored ?? 0;

    if (accepted > 0) {
      logger.info(`✓ Scrobbled: ${track.artist} - ${track.title}`);
    } else if (ignored > 0) {
      logger.warn(`✗ Scrobble ignored: ${track.artist} - ${track.title}`);
    }
  }
}
