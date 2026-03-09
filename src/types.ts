/** Yandex Music API types */

export interface YandexQueueItem {
  id: string;
  context?: {
    type: string;
    id?: string;
    description?: string;
  };
  modified: string;
}

export interface YandexQueueListResponse {
  invocationInfo: Record<string, string>;
  result: {
    queues: YandexQueueItem[];
  };
}

export interface YandexTrackId {
  trackId: number;
  albumId?: number;
  from?: string;
}

export interface YandexQueue {
  id?: string;
  context?: {
    type: string;
    id?: string;
    description?: string;
  };
  tracks: YandexTrackId[];
  currentIndex: number;
  modified: string;
}

export interface YandexQueueResponse {
  invocationInfo: Record<string, string>;
  result: YandexQueue;
}

export interface YandexArtist {
  id: number;
  name: string;
}

export interface YandexAlbum {
  id: number;
  title: string;
}

export interface YandexTrack {
  id: string | number;
  title: string;
  artists: YandexArtist[];
  albums: YandexAlbum[];
  durationMs: number;
}

export interface YandexTrackResponse {
  invocationInfo: Record<string, string>;
  result: YandexTrack[];
}

/** Last.fm API types */

export interface LastfmSession {
  name: string;
  key: string;
  subscriber: number;
}

export interface LastfmTokenResponse {
  token: string;
}

export interface LastfmSessionResponse {
  session: LastfmSession;
}

export interface LastfmScrobbleResponse {
  scrobbles: {
    scrobble: {
      track: { corrected: string; "#text": string };
      artist: { corrected: string; "#text": string };
      album: { corrected: string; "#text": string };
      ignoredMessage: { code: string; "#text": string };
    };
    "@attr": { accepted: number; ignored: number };
  };
}

/** Internal types */

export interface TrackInfo {
  artist: string;
  title: string;
  album: string;
  durationMs: number;
}

export interface ScrobblerConfig {
  yandexToken: string;
  lastfmApiKey: string;
  lastfmApiSecret: string;
  lastfmSessionKey: string;
  pollingIntervalMs: number;
}
