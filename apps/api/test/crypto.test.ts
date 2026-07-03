import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/security/crypto.js";
import { generateApiKey, hashApiKey, secureTokenEqual } from "../src/security/api-keys.js";

describe("credentials", () => {
  it("encrypts provider keys with authenticated encryption", () => {
    const encrypted = encryptSecret("provider-secret", "master-secret");
    expect(encrypted).not.toContain("provider-secret");
    expect(decryptSecret(encrypted, "master-secret")).toBe("provider-secret");
    expect(() => decryptSecret(encrypted, "another-secret")).toThrow();
  });

  it("creates prefixed API keys and deterministic hashes", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith("rf_")).toBe(true);
    expect(key.hash).toBe(hashApiKey(key.plaintext));
    expect(secureTokenEqual(key.plaintext, key.plaintext)).toBe(true);
    expect(secureTokenEqual(key.plaintext, `${key.plaintext}x`)).toBe(false);
  });
});
