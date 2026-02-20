import 'dotenv/config';
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a hex-encoded payload: iv + tag + ciphertext.
 */
export function encrypt(plaintext, key) {
  const keyBuf = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

/**
 * Decrypt a hex payload produced by encrypt().
 */
export function decrypt(payload, key) {
  const keyBuf = Buffer.from(key, 'hex');
  const data = Buffer.from(payload, 'hex');
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = data.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, keyBuf, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v || v.startsWith('your_')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

function resolvePrivateKey() {
  const encKey = optionalEnv('ENV_ENCRYPTION_KEY', '');
  const raw = requiredEnv('PRIVATE_KEY');
  if (encKey) {
    try {
      return decrypt(raw, encKey);
    } catch {
      return raw;
    }
  }
  return raw;
}

const settings = Object.freeze({
  privateKey: resolvePrivateKey(),
  dsaId: Number(optionalEnv('DSA_ID', '0')),

  rpc: {
    mainnet: requiredEnv('RPC_URL_MAINNET'),
    arbitrum: optionalEnv('RPC_URL_ARBITRUM', ''),
    base: optionalEnv('RPC_URL_BASE', ''),
  },

  flashbots: {
    relayUrl: optionalEnv('FLASHBOTS_RELAY_URL', 'https://relay.flashbots.net'),
    authSignerKey: optionalEnv('FLASHBOTS_AUTH_SIGNER_KEY', ''),
  },

  killSwitch: {
    minEthBalance: parseFloat(optionalEnv('MIN_ETH_BALANCE', '0.05')),
  },

  polling: {
    intervalMs: Number(optionalEnv('POLL_INTERVAL_MS', '2000')),
  },

  profit: {
    minThreshold: parseFloat(optionalEnv('MIN_PROFIT_THRESHOLD', '0.005')),
  },

  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
  },
});

export default settings;
