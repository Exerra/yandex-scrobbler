import type { ScrobblerConfig } from "./types";

/**
 * Load configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadConfig(): ScrobblerConfig {
  const yandexToken = process.env.YANDEX_MUSIC_TOKEN;
  const lastfmApiKey = process.env.LASTFM_API_KEY;
  const lastfmApiSecret = process.env.LASTFM_API_SECRET;
  const lastfmSessionKey = process.env.LASTFM_SESSION_KEY;
  const pollingInterval = process.env.POLLING_INTERVAL_SECONDS;

  const missing: string[] = [];

  if (!yandexToken) missing.push("YANDEX_MUSIC_TOKEN");
  if (!lastfmApiKey) missing.push("LASTFM_API_KEY");
  if (!lastfmApiSecret) missing.push("LASTFM_API_SECRET");
  if (!lastfmSessionKey) missing.push("LASTFM_SESSION_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Please create a .env file with these variables. See README.md for details."
    );
  }

  const pollingIntervalMs = pollingInterval
    ? Math.max(5, parseInt(pollingInterval, 10)) * 1000
    : 15_000; // Default: 15 seconds

  return {
    yandexToken: yandexToken!,
    lastfmApiKey: lastfmApiKey!,
    lastfmApiSecret: lastfmApiSecret!,
    lastfmSessionKey: lastfmSessionKey!,
    pollingIntervalMs,
  };
}
