# Yandex Music → Last.fm Scrobbler

> **⚠️ Disclaimer:** This project was built entirely by AI and thrown together for personal use. It may have bugs, rough edges, or quirks. Use at your own discretion.

A 24/7 running scrobbler that tracks what you listen to on Yandex Music and scrobbles it to your Last.fm profile. Built with [Bun](https://bun.sh) and TypeScript.

## Features

- 🎵 Polls your Yandex Music play queue for the currently playing track
- 📊 Scrobbles tracks to Last.fm following official scrobbling rules
- 🎧 Updates your "Now Playing" status on Last.fm in real-time
- 🔄 Runs continuously (24/7) with configurable polling interval
- 🛡️ Graceful error handling and automatic recovery
- ⚡ Lightweight — built with Bun for fast startup and low memory usage

## Prerequisites

- [Bun](https://bun.sh) v1.0+ installed
- A Yandex Music account with an OAuth token
- A [Last.fm API account](https://www.last.fm/api/account/create)

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Get your Yandex Music token

You need an OAuth token for the Yandex Music API. You can obtain one by:

1. Opening [this OAuth URL](https://oauth.yandex.com/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d) in your browser
2. Logging into your Yandex account
3. Copying the `access_token` value from the URL bar after redirect

### 3. Create a Last.fm API account

1. Go to [Last.fm API account creation](https://www.last.fm/api/account/create)
2. Fill in an application name and description
3. Note your **API Key** and **Shared Secret**

### 4. Authenticate with Last.fm

Run the authentication helper:

```bash
bun run auth
```

This will guide you through the Last.fm desktop authentication flow and give you a session key.

### 5. Configure environment

Create a `.env` file in the project root:

```env
YANDEX_MUSIC_TOKEN=your_yandex_oauth_token
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_API_SECRET=your_lastfm_shared_secret
LASTFM_SESSION_KEY=your_lastfm_session_key

# Optional: polling interval in seconds (default: 15)
POLLING_INTERVAL_SECONDS=15

# Optional: set to "debug" for verbose logging
LOG_LEVEL=info
```

### 6. Start the scrobbler

```bash
bun run start
```

## Running 24/7

### Using tmux

The simplest approach for keeping the scrobbler running in the background:

```bash
tmux new-session -d -s scrobbler 'bun run start'
```

To view the logs or manage the session:

```bash
# Attach to the session
tmux attach -t scrobbler

# Detach (while inside the session)
# Press Ctrl+B, then D

# Stop the scrobbler
tmux kill-session -t scrobbler
```

To have it start automatically on login, add the command to your shell profile (e.g. `~/.bashrc` or `~/.zshrc`):

```bash
# Start scrobbler in tmux if not already running
tmux has-session -t scrobbler 2>/dev/null || tmux new-session -d -s scrobbler -c /path/to/yandex-scrobbler 'bun run start'
```

### Using Docker

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
CMD ["bun", "run", "start"]
```

```bash
docker build -t yandex-scrobbler .
docker run -d --env-file .env --restart unless-stopped --name yandex-scrobbler yandex-scrobbler
```

### Using systemd (Linux)

Create a service file at `/etc/systemd/system/yandex-scrobbler.service`:

```ini
[Unit]
Description=Yandex Music Last.fm Scrobbler
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/yandex-scrobbler
ExecStart=/path/to/.bun/bin/bun run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl enable yandex-scrobbler
sudo systemctl start yandex-scrobbler
```

## How It Works

1. The scrobbler polls the Yandex Music API every 15 seconds (configurable)
2. It uses two detection methods:
   - **Queue-based** (primary): Checks your active play queue for real-time "now playing" detection. **Note:** this detection method is largely unverified — the queue API is device-specific and frequently returns no results, so it may not reliably detect playback in all situations.
   - **History-based** (fallback): Uses the "recently played" contexts endpoint to detect tracks when no active queue exists — covers albums, artists, playlists, and radio listening
3. When a new track is detected, it updates your Last.fm "Now Playing" status
4. For queue-based detection: a track is scrobbled when listened to for at least half its duration or 4 minutes (whichever comes first), with a minimum of 30 seconds — following [Last.fm's scrobbling rules](https://www.last.fm/api/scrobbling)
5. For history-based detection: tracks are scrobbled immediately when detected as new plays (using timestamps to avoid duplicates)

## Testing

```bash
bun test
```

## Project Structure

```
├── index.ts            # Entry point
├── src/
│   ├── auth.ts         # Last.fm authentication CLI
│   ├── config.ts       # Environment variable loader
│   ├── lastfm.ts       # Last.fm API client
│   ├── logger.ts       # Simple logger
│   ├── scrobbler.ts    # Main scrobbler logic
│   ├── types.ts        # TypeScript type definitions
│   └── yandex.ts       # Yandex Music API client
├── tests/
│   ├── lastfm.test.ts  # Last.fm client tests
│   ├── scrobbler.test.ts # Scrobbler logic tests
│   └── config.test.ts  # Config loader tests
├── package.json
├── tsconfig.json
└── .env                # Your configuration (not committed)
```

## License

MIT