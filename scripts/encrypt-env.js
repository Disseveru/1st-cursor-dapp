#!/usr/bin/env node
const crypto = require("crypto");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function usage() {
  console.log(
    "Usage: npm run encrypt:key -- --private-key <0x...> --passphrase <secret>",
  );
}

function main() {
  const privateKey = readArg("--private-key");
  const passphrase = readArg("--passphrase");

  if (!privateKey || !passphrase) {
    usage();
    process.exit(1);
  }

  const cleanKey = privateKey.trim();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(cleanKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
  console.log(payload);
}

main();
