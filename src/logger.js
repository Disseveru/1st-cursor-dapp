const pino = require("pino");

function createLogger(level = "info") {
  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "*.privateKey",
        "*.authPrivateKey",
        "privateKey",
        "authPrivateKey",
        "config.privateKey",
      ],
      censor: "[REDACTED]",
    },
  });
}

module.exports = { createLogger };
