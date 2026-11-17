import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1.";

function keyBytes(): Buffer | null {
  const raw = (process.env.MEETRA_DATA_KEY ?? "").trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) {
    throw new Error("MEETRA_DATA_KEY must decode to 32 bytes.");
  }
  return key;
}

/** Encrypt a secret. Refuses to return plaintext when the key is missing. */
export function sealSecret(plain: string): string {
  const key = keyBytes();
  if (!key) {
    throw new Error("MEETRA_DATA_KEY is required to store secrets.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, ciphertext, tag]).toString("base64url");
}

/** Decrypt a v1 secret. Legacy plaintext is returned unchanged. */
export function openSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = keyBytes();
  if (!key) return "";
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  if (raw.length < 12 + 16) return "";
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
