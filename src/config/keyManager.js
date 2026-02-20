import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import config from './index.js';
import { logger } from '../utils/logger.js';

const ALGO = 'aes-256-gcm';
const SALT_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;

function deriveKey(password, salt) {
  return scryptSync(password, salt, 32);
}

function encryptKey(plaintext, password) {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

function decryptKey(blob, password) {
  const buf = Buffer.from(blob, 'base64');
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

async function fetchFromAWS() {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      '@aws-sdk/client-secrets-manager'
    );
    const client = new SecretsManagerClient({ region: config.aws.region });
    const resp = await client.send(
      new GetSecretValueCommand({ SecretId: config.aws.secretName }),
    );
    return resp.SecretString;
  } catch (err) {
    throw new Error(`AWS Secrets Manager fetch failed: ${err.message}`);
  }
}

/**
 * Resolves the private key from the configured source:
 *  1. AWS Secrets Manager (if enabled)
 *  2. Encrypted file on disk (if encryption enabled)
 *  3. Plain .env value (fallback)
 */
export async function resolvePrivateKey() {
  if (config.aws.enabled) {
    logger.info('Fetching private key from AWS Secrets Manager');
    return fetchFromAWS();
  }

  if (config.encryption.enabled) {
    const { password, keyFile } = config.encryption;
    if (!password) throw new Error('KEY_ENCRYPTION_PASSWORD is required when encryption is enabled');

    if (existsSync(keyFile)) {
      logger.info('Decrypting private key from encrypted file');
      const blob = readFileSync(keyFile, 'utf8').trim();
      return decryptKey(blob, password);
    }

    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY must be set for initial encryption');
    }
    logger.info('Encrypting private key and writing to disk');
    const cipher = encryptKey(config.privateKey, password);
    writeFileSync(keyFile, cipher, 'utf8');
    return config.privateKey;
  }

  if (!config.privateKey) {
    throw new Error('No private key configured. Set PRIVATE_KEY, enable AWS, or enable encryption.');
  }
  return config.privateKey;
}
