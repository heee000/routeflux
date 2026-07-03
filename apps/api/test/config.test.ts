import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  DATABASE_URL: "postgres://localhost/test",
  MASTER_KEY: "test-master-key",
  ADMIN_TOKEN: "test-admin-token-long-enough"
};

describe("configuration", () => {
  it("accepts empty optional bootstrap values from Docker Compose", () => {
    const config = loadConfig({
      ...baseEnv,
      BOOTSTRAP_PROVIDER_NAME: "",
      BOOTSTRAP_PROVIDER_BASE_URL: "",
      BOOTSTRAP_PROVIDER_API_KEY: "",
      BOOTSTRAP_PROVIDER_MODELS: ""
    });
    expect(config.BOOTSTRAP_PROVIDER_BASE_URL).toBeUndefined();
    expect(config.BOOTSTRAP_PROVIDER_NAME).toBeUndefined();
  });

  it("rejects an invalid bootstrap endpoint", () => {
    expect(() => loadConfig({ ...baseEnv, BOOTSTRAP_PROVIDER_BASE_URL: "not-a-url" })).toThrow();
  });
});
