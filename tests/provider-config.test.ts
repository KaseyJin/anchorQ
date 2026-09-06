import { describe, expect, it } from "vitest";
import { requestSchema } from "../src/domain/messages";

describe("BYOK 配置消息", () => {
  it("接受 HTTPS OpenAI 兼容接口", () => {
    expect(requestSchema.safeParse({
      type: "MODEL_CONFIG_SAVE",
      payload: {
        baseUrl: "https://api.example.com/v1",
        model: "vendor/model",
        apiKey: "secret",
        consentGranted: true,
      },
    }).success).toBe(true);
  });

  it("拒绝明文 HTTP、空模型和未授权发送", () => {
    for (const payload of [
      { baseUrl: "http://api.example.com/v1", model: "model", apiKey: "secret", consentGranted: true },
      { baseUrl: "https://api.example.com/v1", model: "", apiKey: "secret", consentGranted: true },
      { baseUrl: "https://api.example.com/v1", model: "model", apiKey: "secret", consentGranted: false },
    ]) {
      expect(requestSchema.safeParse({ type: "MODEL_CONFIG_SAVE", payload }).success).toBe(false);
    }
  });
});
