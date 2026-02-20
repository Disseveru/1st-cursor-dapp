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
        "config.dsa.privateKey",
        "config.flashbots.authPrivateKey",
        "dsa.privateKey",
        "flashbots.authPrivateKey",
      ],
      censor: "[REDACTED]",
    },
  });
}

module.exports = { createLogger };
