#!/usr/bin/env node
/**
 * Interactive .env setup wizard.
 *
 * Usage:
 *   npm run setup
 *
 * Reads .env.example, prompts you for the required values, and writes .env.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");
const OUTPUT_PATH = path.join(ROOT, ".env");

// ── prompt helpers ────────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans)));
}

async function confirm(rl, question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(rl, `${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.trim().toLowerCase().startsWith("y");
}

// ── .env.example parser ───────────────────────────────────────────────────────

/**
 * Parse .env.example into an ordered array of tokens so we can reconstruct the
 * file with the same comments and structure.
 *
 * Each token is one of:
 *   { type: 'blank' }
 *   { type: 'comment', text: '# ...' }
 *   { type: 'var', name: 'KEY', value: 'default', commented: false }
 *   { type: 'var', name: 'KEY', value: 'default', commented: true  }
 */
function parseExample(content) {
  const tokens = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "") {
      tokens.push({ type: "blank" });
      continue;
    }

    // Fully commented-out variable assignment (e.g.  # PRIVATE_KEY=0xyour...)
    const commentedVar = trimmed.match(/^#\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (commentedVar) {
      tokens.push({
        type: "var",
        name: commentedVar[1],
        value: commentedVar[2],
        commented: true,
      });
      continue;
    }

    // Active assignment
    const activeVar = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (activeVar) {
      tokens.push({
        type: "var",
        name: activeVar[1],
        value: activeVar[2],
        commented: false,
      });
      continue;
    }

    // Everything else is a comment / section header
    tokens.push({ type: "comment", text: line });
  }
  return tokens;
}

// ── known prompts ─────────────────────────────────────────────────────────────

/**
 * Metadata for variables we want to interactively ask about.
 * Keys not listed here are written with their example-file defaults.
 */
const PROMPTS = {
  // ── required ────────────────────────────────────────────────────────────────
  DSA_ID: {
    label: "Instadapp DSA ID (integer)",
    required: true,
    hint: "Find it in the Instadapp dashboard.",
  },
  ETHEREUM_RPC_URL: {
    label: "Ethereum mainnet RPC URL",
    required: true,
    hint: "e.g. https://your-mainnet.quiknode.pro/xxxxx or https://eth-mainnet.g.alchemy.com/v2/xxxxx",
  },
  QUICKNODE_RPC_URL: {
    label: "QuickNode RPC URL (optional, overrides ETHEREUM_RPC_URL for speed)",
    required: false,
  },
  ALCHEMY_RPC_URL: {
    label: "Alchemy RPC URL (optional, overrides ETHEREUM_RPC_URL for speed)",
    required: false,
  },

  // ── private key (one of three methods) ──────────────────────────────────────
  PRIVATE_KEY: {
    label: "Hot-wallet private key (plain, dev only)",
    required: false,
    secret: true,
    hint: "Leave blank to use an encrypted payload or AWS Secrets Manager instead.",
  },
  PRIVATE_KEY_ENCRYPTED: {
    label: "Encrypted private key payload (from `npm run encrypt:key`)",
    required: false,
    hint: "Leave blank if using PRIVATE_KEY or AWS.",
  },
  ENV_ENCRYPTION_KEY: {
    label: "Encryption passphrase (for PRIVATE_KEY_ENCRYPTED)",
    required: false,
    secret: true,
  },
  PRIVATE_KEY_SECRET_ID: {
    label: "AWS Secrets Manager secret ID",
    required: false,
    hint: "Leave blank if not using AWS.",
  },
  AWS_REGION: {
    label: "AWS region (e.g. us-east-1)",
    required: false,
  },

  // ── Flashbots ────────────────────────────────────────────────────────────────
  FLASHBOTS_AUTH_PRIVATE_KEY: {
    label: "Flashbots authentication private key",
    required: false,
    secret: true,
    hint: "Separate key used to sign Flashbots bundles. Leave blank to auto-generate at startup.",
  },

  // ── extra chain RPCs ──────────────────────────────────────────────────────────
  BASE_RPC_URL: {
    label: "Base chain RPC URL",
    required: false,
    hint: "e.g. https://mainnet.base.org",
  },
  ARBITRUM_RPC_URL: {
    label: "Arbitrum RPC URL",
    required: false,
    hint: "e.g. https://arb1.arbitrum.io/rpc",
  },
};

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(EXAMPLE_PATH)) {
    console.error(`ERROR: ${EXAMPLE_PATH} not found. Cannot continue.`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("\n======================================================");
  console.log("   Instadapp Searcher Bot  –  .env setup wizard");
  console.log("======================================================\n");
  console.log("Note: secret values (private keys, passphrases) are entered via this prompt");
  console.log("      and will be visible in the terminal. For better security, set them as");
  console.log("      environment variables before running this script (e.g. PRIVATE_KEY=0x...)");
  console.log("      and they will be picked up automatically.\n");

  // ── check for existing .env ────────────────────────────────────────────────
  if (fs.existsSync(OUTPUT_PATH)) {
    const overwrite = await confirm(rl, ".env already exists. Overwrite it?", false);
    if (!overwrite) {
      console.log("Aborted. Existing .env was not modified.");
      rl.close();
      return;
    }
    console.log("");
  }

  const exampleContent = fs.readFileSync(EXAMPLE_PATH, "utf8");
  const tokens = parseExample(exampleContent);

  // ── collect values ─────────────────────────────────────────────────────────
  const collected = {}; // name -> value entered by user

  console.log("Answer each prompt. Press Enter to keep the default shown in brackets.");
  console.log("Leave required fields blank to be warned (you can still edit .env manually).\n");

  // Which variables we've already asked about (avoids duplicate prompts for
  // commented-out alternatives of the same key).
  const asked = new Set();

  for (const token of tokens) {
    if (token.type !== "var") continue;
    const { name, value: defaultValue } = token;

    // Skip if already asked.
    if (asked.has(name)) continue;

    const meta = PROMPTS[name];
    if (!meta) continue; // not in the interactive list – keep the default

    asked.add(name);

    const label = meta.label;
    const required = meta.required;
    const isSecret = meta.secret === true;

    // If the secret was pre-set in the environment, use it silently.
    if (isSecret && process.env[name]) {
      console.log(`  Using ${name} from environment variable.`);
      collected[name] = process.env[name];
      console.log("");
      continue;
    }

    let promptLine = `${required ? "*" : " "} ${label}`;
    if (meta.hint) promptLine += `\n    (${meta.hint})`;
    if (defaultValue) promptLine += `\n    default: ${defaultValue}`;
    promptLine += "\n  > ";

    const entered = await ask(rl, promptLine);

    // Use example default if nothing was entered.
    const value = entered.trim() || defaultValue;

    if (required && !value.trim()) {
      console.warn(`  ⚠  WARNING: ${name} is required but was left blank.`);
    }

    collected[name] = value.trim();
    console.log("");
  }

  rl.close();

  // ── build output lines ─────────────────────────────────────────────────────
  const lines = [];
  const written = new Set();

  for (const token of tokens) {
    if (token.type === "blank") {
      lines.push("");
      continue;
    }
    if (token.type === "comment") {
      lines.push(token.text);
      continue;
    }

    // token.type === 'var'
    const { name, value: defaultValue, commented } = token;

    // If the user provided a value for this key, write it active.
    if (Object.prototype.hasOwnProperty.call(collected, name) && !written.has(name)) {
      const userValue = collected[name];
      // Only write it if the user actually entered something or the key has a
      // non-empty default (keep the line for context even if blank).
      if (userValue !== "" || defaultValue !== "") {
        lines.push(`${name}=${userValue !== "" ? userValue : defaultValue}`);
      } else {
        lines.push(`${name}=`);
      }
      written.add(name);
      continue;
    }

    // Keys not asked about: preserve their original form.
    if (commented) {
      lines.push(`# ${name}=${defaultValue}`);
    } else {
      lines.push(`${name}=${defaultValue}`);
    }
  }

  const output = lines.join("\n") + "\n";

  // ── write .env ─────────────────────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_PATH, output, { encoding: "utf8", mode: 0o600 });

  console.log(`\n✅  .env written to ${OUTPUT_PATH}`);
  console.log("   File permissions set to 0600 (owner-read/write only).\n");
  console.log("Next steps:");
  console.log("  npm run check      — validate module loading");
  console.log("  npm run dry-run    — single dry-run cycle");
  console.log("  npm run start      — start the bot\n");
}

main().catch((err) => {
  console.error("setup-env failed:", err);
  process.exit(1);
});
