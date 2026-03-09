import { Scrobbler } from "./src/scrobbler";
import { loadConfig } from "./src/config";
import { logger, setLogLevel, LogLevel } from "./src/logger";

async function main() {
  if (process.env.LOG_LEVEL === "debug") {
    setLogLevel(LogLevel.DEBUG);
  }

  logger.info("Yandex Music → Last.fm Scrobbler");
  logger.info("─".repeat(40));

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }

  const scrobbler = new Scrobbler(config);

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    scrobbler.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  scrobbler.start();
}

main();