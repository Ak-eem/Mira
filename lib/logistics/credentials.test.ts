import { randomBytes } from "node:crypto";

function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${message}`);
  if (!condition) process.exitCode = 1;
}

function run() {
  process.env.LOGISTICS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
  const { encryptCredential, decryptCredential } = require("./credentials");

  const plaintext = JSON.stringify({ apiKey: "sk_live_shiip_test_1234567890", secret: "a-webhook-signing-secret" });
  const encrypted = encryptCredential(plaintext);

  check(encrypted !== plaintext, "ciphertext is not the plaintext");
  check(!encrypted.includes("sk_live_shiip"), "ciphertext does not leak the plaintext credential as a substring");
  check(decryptCredential(encrypted) === plaintext, "round-trips back to the exact original plaintext");

  const encryptedAgain = encryptCredential(plaintext);
  check(encryptedAgain !== encrypted, "two encryptions of the same plaintext produce different ciphertext (random IV, not deterministic)");
  check(decryptCredential(encryptedAgain) === plaintext, "the second encryption still decrypts correctly");

  let tamperThrew = false;
  const tampered = Buffer.from(encrypted, "base64");
  tampered[tampered.length - 1] ^= 0xff; // flip a bit in the ciphertext
  try {
    decryptCredential(tampered.toString("base64"));
  } catch {
    tamperThrew = true;
  }
  check(tamperThrew, "a tampered ciphertext fails to decrypt instead of silently returning garbage (GCM auth tag catches it)");

  let wrongKeyThrew = false;
  const savedKey = process.env.LOGISTICS_CREDENTIALS_KEY;
  process.env.LOGISTICS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
  try {
    decryptCredential(encrypted);
  } catch {
    wrongKeyThrew = true;
  }
  check(wrongKeyThrew, "decrypting with the wrong key throws rather than returning garbage");
  process.env.LOGISTICS_CREDENTIALS_KEY = savedKey;

  let missingKeyThrew = false;
  delete process.env.LOGISTICS_CREDENTIALS_KEY;
  try {
    encryptCredential("test");
  } catch {
    missingKeyThrew = true;
  }
  check(missingKeyThrew, "encrypting with no key configured throws immediately, rather than failing silently or using a default");
  process.env.LOGISTICS_CREDENTIALS_KEY = savedKey;

  let shortKeyThrew = false;
  process.env.LOGISTICS_CREDENTIALS_KEY = "tooshort";
  try {
    encryptCredential("test");
  } catch {
    shortKeyThrew = true;
  }
  check(shortKeyThrew, "a key that doesn't decode to exactly 32 bytes is rejected, not silently truncated/padded");
}

run();
