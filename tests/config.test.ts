import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set all required env vars
    process.env.YANDEX_MUSIC_TOKEN = "test_yandex_token";
    process.env.LASTFM_API_KEY = "test_api_key";
    process.env.LASTFM_API_SECRET = "test_api_secret";
    process.env.LASTFM_SESSION_KEY = "test_session_key";
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  test("loads all required config from env", () => {
    const config = loadConfig();

    expect(config.yandexToken).toBe("test_yandex_token");
    expect(config.lastfmApiKey).toBe("test_api_key");
    expect(config.lastfmApiSecret).toBe("test_api_secret");
    expect(config.lastfmSessionKey).toBe("test_session_key");
    expect(config.pollingIntervalMs).toBe(15000); // default
  });

  test("uses custom polling interval", () => {
    process.env.POLLING_INTERVAL_SECONDS = "30";
    const config = loadConfig();
    expect(config.pollingIntervalMs).toBe(30000);
  });

  test("enforces minimum 5 second polling interval", () => {
    process.env.POLLING_INTERVAL_SECONDS = "2";
    const config = loadConfig();
    expect(config.pollingIntervalMs).toBe(5000);
  });

  test("throws when YANDEX_MUSIC_TOKEN is missing", () => {
    delete process.env.YANDEX_MUSIC_TOKEN;
    expect(() => loadConfig()).toThrow("YANDEX_MUSIC_TOKEN");
  });

  test("throws when LASTFM_API_KEY is missing", () => {
    delete process.env.LASTFM_API_KEY;
    expect(() => loadConfig()).toThrow("LASTFM_API_KEY");
  });

  test("throws when LASTFM_API_SECRET is missing", () => {
    delete process.env.LASTFM_API_SECRET;
    expect(() => loadConfig()).toThrow("LASTFM_API_SECRET");
  });

  test("throws when LASTFM_SESSION_KEY is missing", () => {
    delete process.env.LASTFM_SESSION_KEY;
    expect(() => loadConfig()).toThrow("LASTFM_SESSION_KEY");
  });

  test("lists all missing variables in error message", () => {
    delete process.env.YANDEX_MUSIC_TOKEN;
    delete process.env.LASTFM_API_KEY;

    expect(() => loadConfig()).toThrow("YANDEX_MUSIC_TOKEN, LASTFM_API_KEY");
  });
});
