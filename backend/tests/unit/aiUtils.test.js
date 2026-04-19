import { describe, it, expect } from "vitest";
const { resolveAiConfig, validateOpenAiConfig, validateOpenAiAuth } = require("../../utils/aiUtils");

describe("aiUtils", () => {
  describe("resolveAiConfig", () => {
    it("resolves openai provider", () => {
      const config = resolveAiConfig({
        provider: "openai",
        openai: { baseUrl: "https://api.example.com", model: "gpt-4", apiKey: "sk-test" },
      });
      expect(config.provider).toBe("openai");
      expect(config.baseUrl).toBe("https://api.example.com");
      expect(config.model).toBe("gpt-4");
      expect(config.apiKey).toBe("sk-test");
    });
    it("resolves ollama provider by default", () => {
      const config = resolveAiConfig({});
      expect(config.provider).toBe("ollama");
      expect(config.host).toBeTruthy();
      expect(config.model).toBeTruthy();
    });
    it("uses provided ollama host/model", () => {
      const config = resolveAiConfig({
        provider: "ollama",
        ollama: { host: "http://custom:11434", model: "llama2" },
      });
      expect(config.host).toBe("http://custom:11434");
      expect(config.model).toBe("llama2");
    });
  });

  describe("validateOpenAiConfig", () => {
    it("returns empty string for valid config", () => {
      expect(validateOpenAiConfig({ baseUrl: "http://a.com", model: "m", apiKey: "k" })).toBe("");
    });
    it("returns error for missing fields", () => {
      expect(validateOpenAiConfig({ baseUrl: "", model: "", apiKey: "" })).not.toBe("");
    });
  });

  describe("validateOpenAiAuth", () => {
    it("returns empty string for valid auth", () => {
      expect(validateOpenAiAuth({ baseUrl: "http://a.com", apiKey: "k" })).toBe("");
    });
    it("returns error for missing fields", () => {
      expect(validateOpenAiAuth({ baseUrl: "", apiKey: "" })).not.toBe("");
    });
  });
});
