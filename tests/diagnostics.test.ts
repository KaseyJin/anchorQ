import { describe, expect, it } from "vitest";
import { classifyDiagnosticFailure, createDiagnosticReport } from "../src/domain/diagnostics";
import { initialAppState } from "../src/domain/types";
import { createSession } from "../src/domain/session-machine";

describe("脱敏诊断", () => {
  it("只记录错误类别和 HTTP 状态，不保留原始错误正文", () => {
    const event = classifyDiagnosticFailure(
      new Error("模型接口失败（HTTP 429）。 secret-key file:///private/paper.pdf"),
      "AI_SEND",
      new Date("2026-09-06T12:00:00.000Z"),
    );

    expect(event).toEqual({
      occurredAt: "2026-09-06T12:00:00.000Z",
      operation: "AI_SEND",
      category: "model_rate_limit",
      httpStatus: 429,
    });
    expect(JSON.stringify(event)).not.toContain("secret-key");
    expect(JSON.stringify(event)).not.toContain("paper.pdf");
  });

  it("报告不包含模型地址、模型名、论文、目标或对话内容", () => {
    const state = initialAppState(true);
    state.provider.baseUrl = "https://private.example/v1";
    state.provider.model = "private/model";
    state.session = createSession({
      coreTabId: 7,
      coreFileUrl: "file:///Users/private/secret-paper.pdf",
      readerUrl: "chrome-extension://private/reader/index.html?source=secret",
      paperTitle: "Confidential paper",
      learningGoal: "Private learning goal",
    });
    state.dialogue = {
      question: "Private question",
      source: "generated",
      evidence: [{ pageNumber: 3, text: "Private paper text" }],
      messages: [{ id: "private", role: "user", text: "Private answer" }],
      busy: false,
    };
    state.lastDiagnostic = classifyDiagnosticFailure(new Error("HTTP 401"), "MODEL_CONFIG_TEST");

    const report = createDiagnosticReport({
      state,
      extensionVersion: "1.0.0",
      browser: "Microsoft Edge 140",
      platform: "Windows",
      fileAccessAllowed: true,
      webAccessGranted: false,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });
    const serialized = JSON.stringify(report);

    expect(report.provider).toEqual({ configured: true, consentGranted: true });
    expect(report.permissions).toEqual({ fileAccessAllowed: true, webAccessGranted: false });
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("private/model");
    expect(serialized).not.toContain("secret-paper");
    expect(serialized).not.toContain("Confidential paper");
    expect(serialized).not.toContain("Private learning goal");
    expect(serialized).not.toContain("Private question");
    expect(serialized).not.toContain("Private paper text");
    expect(serialized).not.toContain("Private answer");
    expect(serialized).not.toContain("paperTitle");
    expect(serialized).not.toContain("learningGoal");
    expect(serialized).not.toContain("messages");
  });
});
