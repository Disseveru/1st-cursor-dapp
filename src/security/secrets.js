const crypto = require("crypto");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { normalizePrivateKey } = require("../utils");

function decryptEncryptedEnv({
  encryptedValue,
  passphrase,
}) {
  if (!encryptedValue || !passphrase) return null;

  const raw = Buffer.from(encryptedValue, "base64");
  const salt = raw.subarray(0, 16);
  const iv = raw.subarray(16, 28);
  const tag = raw.subarray(28, 44);
  const payload = raw.subarray(44);

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(payload),
    decipher.final(),
  ]).toString("utf8");

  return normalizePrivateKey(decrypted.trim());
}

async function fetchPrivateKeyFromAws({
  secretId,
  region,
}) {
  if (!secretId || !region) return null;

  const client = new SecretsManagerClient({ region });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );

  if (!response.SecretString) {
    throw new Error("AWS secret must contain SecretString.");
  }

  const secret = response.SecretString.trim();

  // Supports either raw private key string or a JSON payload.
  if (secret.startsWith("{")) {
    const parsed = JSON.parse(secret);
    const key =
      parsed.PRIVATE_KEY ||
      parsed.privateKey ||
      parsed.key ||
      parsed.secret;
    if (!key) {
      throw new Error(
        "AWS secret JSON did not contain PRIVATE_KEY/privateKey/key/secret.",
      );
    }
    return normalizePrivateKey(String(key));
  }

  return normalizePrivateKey(secret);
}

async function resolvePrivateKey(env, logger) {
  const secretId = env.PRIVATE_KEY_SECRET_ID;
  const awsRegion = env.AWS_REGION;
  const encryptedValue = env.PRIVATE_KEY_ENCRYPTED;
  const encryptionKey = env.ENV_ENCRYPTION_KEY;
  const plain = env.PRIVATE_KEY;

  if (secretId && awsRegion) {
    logger.info(
      { secretId, awsRegion },
      "Loading private key from AWS Secrets Manager",
    );
    return fetchPrivateKeyFromAws({ secretId, region: awsRegion });
  }

  if (encryptedValue && encryptionKey) {
    logger.info("Loading private key from encrypted env payload");
    return decryptEncryptedEnv({
      encryptedValue,
      passphrase: encryptionKey,
    });
  }

  if (plain) {
    logger.warn(
      "Using plain PRIVATE_KEY from .env. Prefer AWS Secrets Manager or PRIVATE_KEY_ENCRYPTED.",
    );
    return normalizePrivateKey(plain);
  }

  throw new Error(
    "No private key source configured. Set PRIVATE_KEY or PRIVATE_KEY_ENCRYPTED+ENV_ENCRYPTION_KEY or PRIVATE_KEY_SECRET_ID+AWS_REGION.",
  );
}

module.exports = {
  resolvePrivateKey,
  decryptEncryptedEnv,
  fetchPrivateKeyFromAws,
};
