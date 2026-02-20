#!/usr/bin/env node
const crypto = require("crypto");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function usage() {
  console.log(
    [
      "Usage:",
      "  HOT_WALLET_PRIVATE_KEY=<0x...> ENV_ENCRYPTION_PASSPHRASE=<secret> npm run encrypt:key",
      "or",
      "  npm run encrypt:key -- --private-key <0x...> --passphrase <secret>",
    ].join("\n"),
  );
}

function main() {
  const privateKey =
    process.env.HOT_WALLET_PRIVATE_KEY || readArg("--private-key");
  const passphrase =
    process.env.ENV_ENCRYPTION_PASSPHRASE || readArg("--passphrase");

  if (!privateKey || !passphrase) {
    usage();
    process.exit(1);
  }

  if (readArg("--private-key") || readArg("--passphrase")) {
    console.error(
      "Warning: CLI arguments can leak in shell history / process lists. Prefer env vars.",
    );
  }

  const cleanKey = privateKey.trim();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(cleanKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
  console.log(payload);
}

main();
