import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `rf_${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 11),
    hash: hashApiKey(plaintext)
  };
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

export function secureTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

