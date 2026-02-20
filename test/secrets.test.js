const crypto = require("crypto");
const { decryptEncryptedEnv } = require("../src/security/secrets");

function encryptForTest(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

describe("decryptEncryptedEnv", () => {
  it("decrypts a payload encrypted with the same passphrase", () => {
    const key = "0xdeadbeef1234567890abcdef";
    const passphrase = "test-passphrase";
    const encrypted = encryptForTest(key, passphrase);

    const result = decryptEncryptedEnv({
      encryptedValue: encrypted,
      passphrase,
    });
    expect(result).toBe(key);
  });

  it("prepends 0x if the decrypted key is missing it", () => {
    const plainKey = "deadbeef1234567890abcdef";
    const passphrase = "my-secret";
    const encrypted = encryptForTest(plainKey, passphrase);

    const result = decryptEncryptedEnv({
      encryptedValue: encrypted,
      passphrase,
    });
    expect(result).toBe("0xdeadbeef1234567890abcdef");
  });

  it("returns null when encryptedValue is missing", () => {
    expect(decryptEncryptedEnv({ encryptedValue: null, passphrase: "x" })).toBeNull();
  });

  it("returns null when passphrase is missing", () => {
    expect(decryptEncryptedEnv({ encryptedValue: "abc", passphrase: "" })).toBeNull();
  });

  it("throws on wrong passphrase", () => {
    const encrypted = encryptForTest("0xkey", "correct");
    expect(() => decryptEncryptedEnv({ encryptedValue: encrypted, passphrase: "wrong" })).toThrow();
  });
});
