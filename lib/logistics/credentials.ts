import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts/decrypts courier credentials before they ever reach the
// database. The key lives ONLY in this env var -- never in Postgres --
// so a leaked service-role key or a DB backup yields unusable ciphertext,
// not a live Shiip/GIGL credential. Mirrors how PAYSTACK_SECRET_KEY is
// handled: a secret in env, never written to a column.
//
// AES-256-GCM: authenticated encryption, not just confidentiality -- a
// tampered ciphertext fails to decrypt rather than silently decrypting to
// garbage, so a corrupted or attacker-modified row is detected, not used.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM; 16-byte IVs are unnecessary and non-standard here.
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.LOGISTICS_CREDENTIALS_KEY?.trim();
  if (!raw) throw new Error("Missing LOGISTICS_CREDENTIALS_KEY");
  // Expect a 64-char hex string (32 raw bytes) -- generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("LOGISTICS_CREDENTIALS_KEY must decode to exactly 32 bytes (a 64-char hex string)");
  return key;
}

/**
 * Encrypts a plaintext string (a JSON-stringified credentials object, or
 * a bare secret) into a single base64 blob: [iv][authTag][ciphertext].
 * Call this right before an INSERT/UPDATE into encrypted_credentials or
 * encrypted_webhook_secret -- plaintext must never be held longer than
 * necessary, and never logged.
 */
export function encryptCredential(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Reverses encryptCredential(). Throws if the key is wrong, the blob was
 * tampered with, or it's malformed -- callers should treat any throw here
 * as "this credential is unusable", not attempt to use a partial result.
 */
export function decryptCredential(blob: string): string {
  const key = getKey();
  const raw = Buffer.from(blob, "base64");
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) throw new Error("Malformed credential blob");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
