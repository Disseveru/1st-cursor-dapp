function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  parseJSON,
  asBool,
  normalizePrivateKey,
  addressEq,
};
