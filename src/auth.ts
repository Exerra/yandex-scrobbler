import { LastfmClient } from "./lastfm";
import { logger } from "./logger";
import * as readline from "readline";

/**
 * Interactive CLI to authenticate with Last.fm and obtain a session key.
 * Usage: bun run src/auth.ts
 */

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("=== Last.fm Authentication Setup ===\n");
  console.log("This script will help you obtain a Last.fm session key.");
  console.log("You need a Last.fm API account. Create one at:");
  console.log("  https://www.last.fm/api/account/create\n");

  const apiKey = await prompt(rl, "Enter your Last.fm API Key: ");
  const apiSecret = await prompt(rl, "Enter your Last.fm API Secret: ");

  if (!apiKey || !apiSecret) {
    console.error("API Key and Secret are required.");
    rl.close();
    process.exit(1);
  }

  const client = new LastfmClient(apiKey, apiSecret);

  try {
    console.log("\nRequesting authentication token...");
    const token = await client.getToken();

    const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;
    console.log("\nPlease open this URL in your browser and authorize the application:");
    console.log(`\n  ${authUrl}\n`);

    await prompt(rl, "Press Enter after you have authorized the application...");

    console.log("Fetching session...");
    const session = await client.getSession(token);

    console.log("\n=== Authentication Successful! ===\n");
    console.log(`Username: ${session.name}`);
    console.log(`Session Key: ${session.key}`);
    console.log("\nAdd these to your .env file:");
    console.log(`  LASTFM_SESSION_KEY=${session.key}`);
  } catch (err) {
    logger.error("Authentication failed:", (err as Error).message);
    console.log("\nMake sure you authorized the application in the browser before pressing Enter.");
  }

  rl.close();
}

main();
