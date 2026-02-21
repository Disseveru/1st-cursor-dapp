function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(
  fn,
  {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    shouldRetry = () => true,
    label = "operation",
    logger = null,
    onRetry = null,
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) * jitter, maxDelayMs);
      const retryEvent = {
        label,
        attempt,
        maxAttempts,
        delayMs: Math.round(delay),
        error: error.message,
      };
      if (typeof onRetry === "function") {
        try {
          onRetry(retryEvent);
        } catch (observerError) {
          logger?.debug(
            { label, error: observerError.message },
            "Retry observer callback failed",
          );
        }
      }
      if (logger) {
        logger.debug(retryEvent, "Retrying after transient failure");
      }
      await sleep(delay);
    }
  }
  throw lastError;
}

function isTransientRpcError(error) {
  const msg = (error.message || "").toLowerCase();
  return (
    error.code === "TIMEOUT" ||
    error.code === "SERVER_ERROR" ||
    error.code === "NETWORK_ERROR" ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

function parseJSON(value, fallback, label) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function normalizePrivateKey(privateKey) {
  if (!privateKey) return "";
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

function addressEq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

module.exports = {
  sleep,
  withRetry,
  isTransientRpcError,
  parseJSON,
  asBool,
  normalizePrivateKey,
  addressEq,
};
